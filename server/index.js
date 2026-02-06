const express = require('express');
const cors = require('cors');
const http = require('http'); 
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const geoip = require('geoip-lite');

const app = express();

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
        res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
        next();
    }
});

const server = http.createServer(app);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ahmetcnd:Ahmet263271@videochat.vok6vud.mongodb.net/?appName=videochat';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Bağlantısı Başarılı'))
  .catch(err => console.error('❌ MongoDB Bağlantı Hatası:', err));

// --- MODELLER ---
const UserSchema = new mongoose.Schema({
  googleId: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  name: String,
  avatar: String,
  likes: { type: Number, default: 0 },
  isRegistered: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Ban = mongoose.model('Ban', new mongoose.Schema({ ip: String, reason: String, date: { type: Date, default: Date.now } }));
const Report = mongoose.model('Report', new mongoose.Schema({ reporterId: String, reportedId: String, reportedIP: String, screenshot: String, date: { type: Date, default: Date.now } }));
const Log = mongoose.model('Log', new mongoose.Schema({ userId: String, userIP: String, action: String, targetId: String, duration: Number, date: { type: Date, default: Date.now } }));

// --- API ROTALARI ---
app.post('/api/auth/social-login', async (req, res) => {
  const { googleId, email, name, avatar } = req.body;
  try {
    let user = await User.findOne({ googleId });
    if (!user) {
      user = new User({ googleId, email, name, avatar, isRegistered: true });
      await user.save();
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Giriş hatası" });
  }
});

const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"], credentials: true } });

let globalQueue = [];
const activeMatches = new Map();
const userDetails = new Map();

io.on('connection', async (socket) => {
  let userIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  if (userIP.includes(',')) userIP = userIP.split(',')[0].trim();
  if (userIP === '::1' || userIP === '127.0.0.1') userIP = '176.234.224.0';
  
  const geo = geoip.lookup(userIP);
  const countryCode = geo ? geo.country : 'UN';

  // --- KRİTİK DÜZELTME: Veritabanı Bilgilerini Çekme ---
  const dbUserId = socket.handshake.query.dbUserId; 
  let currentLikes = 0;
  let isRegistered = false;

  if (dbUserId && mongoose.Types.ObjectId.isValid(dbUserId)) {
    const dbUser = await User.findById(dbUserId);
    if (dbUser) {
      currentLikes = dbUser.likes;
      isRegistered = true;
    }
  }

  userDetails.set(socket.id, {
    id: socket.id,
    dbId: dbUserId || null,
    ip: userIP,
    country: countryCode,
    status: 'IDLE',
    likes: currentLikes,
    isRegistered: isRegistered,
    myGender: 'male'
  });

  const isBanned = await Ban.findOne({ ip: userIP });
  if (isBanned) return socket.disconnect();

  socket.on('find_partner', async ({ myGender, searchGender, selectedCountry }) => {
    globalQueue = globalQueue.filter(item => item.id !== socket.id);
    const u = userDetails.get(socket.id);
    if (u) { u.status = 'SEARCHING'; u.myGender = myGender; }

    const tryMatch = () => {
      const partnerIndex = globalQueue.findIndex(p => {
        const genderMatch = (searchGender === 'all' || searchGender === p.myGender) && 
                            (p.searchGender === 'all' || p.searchGender === myGender);
        const countryMatch = (selectedCountry === 'all' || selectedCountry === p.countryCode);
        return genderMatch && countryMatch && p.id !== socket.id;
      });

      if (partnerIndex !== -1) {
        const partner = globalQueue[partnerIndex];
        const pDetails = userDetails.get(partner.id);
        const myDetails = userDetails.get(socket.id);
        
        globalQueue.splice(partnerIndex, 1);
        activeMatches.set(socket.id, partner.id);
        activeMatches.set(partner.id, socket.id);
        
        if (myDetails) myDetails.status = 'BUSY';
        if (pDetails) pDetails.status = 'BUSY';

        // --- PARTNER FOUND: Likes bilgisini ekledik ---
        io.to(socket.id).emit('partner_found', { 
            partnerId: partner.id, 
            initiator: true, 
            country: partner.countryCode,
            partnerGender: partner.myGender,
            partnerLikes: pDetails ? pDetails.likes : 0 // Partnerin puanı
        });
        io.to(partner.id).emit('partner_found', { 
            partnerId: socket.id, 
            initiator: false, 
            country: countryCode,
            partnerGender: myGender,
            partnerLikes: myDetails ? myDetails.likes : 0 // Senin puanın
        });
        return true;
      }
      return false;
    };

    if (!tryMatch()) {
      globalQueue.push({ id: socket.id, myGender, searchGender, countryCode, selectedCountry });
    }
  });

  // --- LIKE (KALP) OLAYI ---
  socket.on('like_partner', async ({ targetId }) => {
    const me = userDetails.get(socket.id);
    const partner = userDetails.get(targetId);

    if (partner && partner.dbId) {
      await User.findByIdAndUpdate(partner.dbId, { $inc: { likes: 1 } });
      partner.likes += 1;
      io.to(targetId).emit('receive_like', { newLikes: partner.likes });
      new Log({ userId: socket.id, action: 'LIKED', targetId }).save();
    }
  });

  socket.on('stop_search', () => {
    globalQueue = globalQueue.filter(u => u.id !== socket.id);
    const u = userDetails.get(socket.id);
    if (u) u.status = 'IDLE';
    const partnerId = activeMatches.get(socket.id);
    if (partnerId) io.to(partnerId).emit('partner_disconnected');
  });

  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
  });

  socket.on('disconnect', () => {
    userDetails.delete(socket.id);
    globalQueue = globalQueue.filter(u => u.id !== socket.id);
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Sunucu ${PORT} portunda yayında.`);
});