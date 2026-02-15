const express = require('express');
const cors = require('cors');
const http = require('http'); 
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const geoip = require('geoip-lite');
const { OAuth2Client } = require('google-auth-library');

const app = express();

const allowedOrigins = [
  "https://www.omegpt.com", 
  "https://omegpt.com", 
  "http://localhost:3000"
];

app.use(cors({ 
  origin: allowedOrigins, 
  credentials: true 
}));

app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
        res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
        next();
    }
});

const server = http.createServer(app);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ahmetcnd:Ahmet263271@videochat.vok6vud.mongodb.net/videochat?retryWrites=true&w=majority';
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

// DÜZELTME: Ban şemasına expireAt eklendi
const BanSchema = new mongoose.Schema({ 
  ip: String, 
  reason: String, 
  date: { type: Date, default: Date.now },
  expireAt: { type: Date } // Ban bitiş süresi
});
const Ban = mongoose.model('Ban', BanSchema);

const Report = mongoose.model('Report', new mongoose.Schema({ reporterId: String, reportedId: String, reportedIP: String, screenshot: String, date: { type: Date, default: Date.now } }));
const Log = mongoose.model('Log', new mongoose.Schema({ userId: String, userIP: String, action: String, targetId: String, duration: Number, date: { type: Date, default: Date.now } }));

let globalQueue = [];
const activeMatches = new Map();
const userDetails = new Map();

if (!global.liveMatches) global.liveMatches = new Map();

const client = new OAuth2Client("18397104529-p1kna8b71s0n5b6lv1oatk2vdrofp6c2.apps.googleusercontent.com");

app.post('/api/auth/social-login', async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience: "18397104529-p1kna8b71s0n5b6lv1oatk2vdrofp6c2.apps.googleusercontent.com" });
    const payload = ticket.getPayload();
    let user = await User.findOne({ googleId: payload['sub'] });
    if (!user) {
      user = new User({ googleId: payload['sub'], email: payload['email'], name: payload['name'], avatar: payload['picture'], isRegistered: true });
      await user.save();
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Giriş başarısız" });
  }
});

const io = new Server(server, {
  cors: {
    origin: allowedOrigins, // <-- DÜZELTİLDİ
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["polling", "websocket"]
});

const getMatchId = (id1, id2) => [id1, id2].sort().join('_');

io.on('connection', async (socket) => {
  let userIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  if (userIP.includes(',')) userIP = userIP.split(',')[0].trim();
  if (userIP === '::1' || userIP === '127.0.0.1') userIP = '176.234.224.0';
  
  // DÜZELTME: Bağlantı anında süreli ban kontrolü
  const activeBan = await Ban.findOne({ 
    ip: userIP, 
    expireAt: { $gt: new Date() } // Süresi henüz dolmamış banları bul
  });

  if (activeBan) {
      console.log(`🚫 Yasaklı Kullanıcı Engellendi: ${userIP} (Bitiş: ${activeBan.expireAt})`);
      // Frontend'e neden engellendiğini ve süreyi gönder
      socket.emit('connection_refused', { 
        reason: activeBan.reason, 
        expireAt: activeBan.expireAt 
      });
      return socket.disconnect();
  }

  const geo = geoip.lookup(userIP);
  const countryCode = geo ? geo.country : 'UN';

  console.log(`👤 Yeni Bağlantı: ${socket.id.slice(0,6)}... (IP: ${userIP}, Ülke: ${countryCode})`);

  const dbUserId = socket.handshake.query.dbUserId; 
  let currentLikes = 0; let isRegistered = false;

  if (dbUserId && mongoose.Types.ObjectId.isValid(dbUserId)) {
    const dbUser = await User.findById(dbUserId);
    if (dbUser) { currentLikes = dbUser.likes; isRegistered = true; }
  }

  userDetails.set(socket.id, { id: socket.id, dbId: dbUserId || null, ip: userIP, country: countryCode, status: 'IDLE', likes: currentLikes, isRegistered, myGender: 'male' });

  socket.on('find_partner', async ({ myGender, searchGender, selectedCountry }) => {
    console.log(`🔍 [${socket.id.slice(0,6)}] Eşleşme arıyor... (Kendi: ${myGender}, Aradığı: ${searchGender}, Bölge: ${selectedCountry})`);
    
    const existingPartner = activeMatches.get(socket.id);
    if (existingPartner) {
        console.log(`⚠️ GÜVENLİK: [${socket.id.slice(0,6)}] yeni arama yaptı ama eski eşleşmesi askıda kalmış. Temizleniyor...`);
        io.to(existingPartner).emit('partner_left_auto_next');
        activeMatches.delete(socket.id);
        activeMatches.delete(existingPartner);
        if (global.liveMatches) global.liveMatches.delete(getMatchId(socket.id, existingPartner));
    }

    globalQueue = globalQueue.filter(item => item.id !== socket.id);
    const u = userDetails.get(socket.id);
    if (u) { u.status = 'SEARCHING'; u.myGender = myGender; }

    const tryMatch = () => {
      const partnerIndex = globalQueue.findIndex(p => {
        const genderMatch = (searchGender === 'all' || searchGender === p.myGender) && (p.searchGender === 'all' || p.searchGender === myGender);
        const countryMatch = (selectedCountry === 'all' || selectedCountry === p.countryCode);
        return genderMatch && countryMatch && p.id !== socket.id;
      });

      if (partnerIndex !== -1) {
        const partner = globalQueue[partnerIndex];
        globalQueue.splice(partnerIndex, 1);
        
        activeMatches.set(socket.id, partner.id);
        activeMatches.set(partner.id, socket.id);
        
        const myDetails = userDetails.get(socket.id);
        const pDetails = userDetails.get(partner.id);
        if (myDetails) myDetails.status = 'BUSY';
        if (pDetails) pDetails.status = 'BUSY';

        const matchId = getMatchId(socket.id, partner.id);
        global.liveMatches.set(matchId, {
            id: matchId,
            user1: { id: socket.id, country: countryCode, ip: userIP },
            user2: { id: partner.id, country: partner.countryCode, ip: pDetails ? pDetails.ip : 'N/A' },
            startTime: new Date()
        });

        console.log(`🎉 EŞLEŞME BAŞARILI: [${socket.id.slice(0,6)}] ❤️ [${partner.id.slice(0,6)}]`);

        io.to(socket.id).emit('partner_found', { partnerId: partner.id, initiator: true, country: partner.countryCode, partnerGender: partner.myGender, partnerLikes: pDetails ? pDetails.likes : 0 });
        io.to(partner.id).emit('partner_found', { partnerId: socket.id, initiator: false, country: countryCode, partnerGender: myGender, partnerLikes: myDetails ? myDetails.likes : 0 });
        return true;
      }
      return false;
    };

    if (!tryMatch()) {
      globalQueue.push({ id: socket.id, myGender, searchGender, countryCode, selectedCountry });
      console.log(`⏳ [${socket.id.slice(0,6)}] Kuyruğa eklendi. Kuyrukta bekleyen: ${globalQueue.length} kişi`);
    }
  });

  socket.on('next_user', () => {
    const partnerId = activeMatches.get(socket.id);
    if (partnerId) {
      console.log(`⏭️ [${socket.id.slice(0,6)}] NEXT dedi. Eski partner [${partnerId.slice(0,6)}] ile bağ koparılıyor.`);
      io.to(partnerId).emit('partner_left_auto_next');
      activeMatches.delete(socket.id);
      activeMatches.delete(partnerId);
      
      const p = userDetails.get(partnerId);
      if (p) p.status = 'SEARCHING';

      if (global.liveMatches) global.liveMatches.delete(getMatchId(socket.id, partnerId));
    }
  });

  socket.on('stop_search', () => {
    console.log(`⏹️ [${socket.id.slice(0,6)}] Aramayı tamamen durdurdu.`);
    globalQueue = globalQueue.filter(u => u.id !== socket.id);
    const u = userDetails.get(socket.id);
    if (u) u.status = 'IDLE';
    const partnerId = activeMatches.get(socket.id);
    if (partnerId) {
        io.to(partnerId).emit('partner_left_auto_next');
        activeMatches.delete(socket.id);
        activeMatches.delete(partnerId);
        if (global.liveMatches) global.liveMatches.delete(getMatchId(socket.id, partnerId));
    }
  });

  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
  });

  socket.on('disconnect', () => {
    console.log(`❌ Bağlantı Koptu: [${socket.id.slice(0,6)}]`);
    const partnerId = activeMatches.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partner_left_auto_next');
      activeMatches.delete(partnerId);
      if (global.liveMatches) global.liveMatches.delete(getMatchId(socket.id, partnerId));
    }
    userDetails.delete(socket.id);
    globalQueue = globalQueue.filter(u => u.id !== socket.id);
    activeMatches.delete(socket.id);
  });
  
  socket.on('like_partner', async ({ targetId, increaseCounter, currentSessionLikes }) => {
    const me = userDetails.get(socket.id); const partner = userDetails.get(targetId);
    if (me && partner && increaseCounter && me.isRegistered && partner.dbId) {
        await User.findByIdAndUpdate(partner.dbId, { $inc: { likes: 1 } });
        partner.likes += 1;
    }
    io.to(targetId).emit('receive_like', { newLikes: partner?.likes, senderSessionLikes: currentSessionLikes });
  });

  socket.on('report_user', async ({ reportedId, screenshot }) => {
    const reported = userDetails.get(reportedId);
    if (reported) {
        await new Report({ reporterId: socket.id, reportedId, reportedIP: reported.ip, screenshot, date: new Date() }).save();
        reported.reports = (reported.reports || 0) + 1;
        console.log(`⚠️ KULLANICI RAPORLANDI: [${reportedId}]`);
    }
  });
});

// --- ADMIN API ---
app.get('/api/admin/active-users', (req, res) => res.json(Array.from(userDetails.values())));
app.get('/api/reports', async (req, res) => res.json(await Report.find().sort({ date: -1 }).limit(50)));
app.delete('/api/reports/:id', async (req, res) => { await Report.findByIdAndDelete(req.params.id); res.json({ success: true }); });

// Sadece aktif (süresi dolmamış) banları getir
app.get('/api/bans', async (req, res) => {
  const activeBans = await Ban.find({ expireAt: { $gt: new Date() } });
  res.json(activeBans);
});

app.delete('/api/bans/:ip', async (req, res) => { await Ban.findOneAndDelete({ ip: req.params.ip }); res.json({ success: true }); });
app.get('/api/admin/stats', async (req, res) => {
  // Stats kısmında da sadece aktif banları sayalım
  const totalActiveBans = await Ban.countDocuments({ expireAt: { $gt: new Date() } });
  res.json({ activeUsers: userDetails.size, totalBans: totalActiveBans, pendingReports: await Report.countDocuments(), totalMatchesToday: 0 });
});
app.get('/api/admin/active-matches', (req, res) => res.json(global.liveMatches ? Array.from(global.liveMatches.values()) : []));

// DÜZELTME: Banlama işlemi 24 saatlik süre ile yapılır
app.post('/api/ban-user', async (req, res) => {
  const { ip, reportedId, reason } = req.body;
  
  // 24 saat sonrasını hesapla
  const expireDate = new Date();
  expireDate.setHours(expireDate.getHours() + 24);

  await new Ban({ 
    ip, 
    reason: reason || "Kurallara Aykırı Davranış", 
    expireAt: expireDate 
  }).save();

  if (reportedId) {
    // Kişiye 24 saat banlandığını bildir
    io.to(reportedId).emit('account_banned', { 
      reason: reason || "Topluluk kurallarını ihlal ettiniz.",
      expireAt: expireDate
    });
    
    // Mesajın ulaşması için kısa bir süre bekleyip bağlantıyı kopar
    const s = io.sockets.sockets.get(reportedId);
    if (s) {
      setTimeout(() => {
        s.disconnect();
      }, 1500);
    } 
  }
  res.json({ success: true });
});

app.post('/api/admin/kill-match', (req, res) => {
    const { matchId, user1Id, user2Id } = req.body;
    io.to(user1Id).emit('partner_left_auto_next'); io.to(user2Id).emit('partner_left_auto_next');
    if (global.liveMatches) global.liveMatches.delete(matchId);
    res.json({ success: true });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, "0.0.0.0", () => console.log(`🚀 Sunucu ${PORT} portunda yayında.`));