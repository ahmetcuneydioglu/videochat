const express = require('express');
const cors = require('cors');
const http = require('http'); 
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const geoip = require('geoip-lite');
const { OAuth2Client } = require('google-auth-library');

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

// Veritabanı Bağlantısı
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
const Ban = mongoose.model('Ban', new mongoose.Schema({ ip: String, reason: String, date: { type: Date, default: Date.now } }));
const Report = mongoose.model('Report', new mongoose.Schema({ reporterId: String, reportedId: String, reportedIP: String, screenshot: String, date: { type: Date, default: Date.now } }));
const Log = mongoose.model('Log', new mongoose.Schema({ userId: String, userIP: String, action: String, targetId: String, duration: Number, date: { type: Date, default: Date.now } }));

// --- GLOBAL DEĞİŞKENLER ---
let globalQueue = [];
const activeMatches = new Map();
const userDetails = new Map();

// Admin Paneli için Canlı Maçları Tutan Map (En dışta olmalı)
if (!global.liveMatches) global.liveMatches = new Map();

// --- AUTH ROUTE ---
const client = new OAuth2Client("18397104529-p1kna8b71s0n5b6lv1oatk2vdrofp6c2.apps.googleusercontent.com");

app.post('/api/auth/social-login', async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await client.verifyIdToken({
        idToken: token,
        audience: "18397104529-p1kna8b71s0n5b6lv1oatk2vdrofp6c2.apps.googleusercontent.com",
    });
    const payload = ticket.getPayload();
    const googleId = payload['sub'];

    let user = await User.findOne({ googleId });
    if (!user) {
      user = new User({ 
        googleId: googleId, 
        email: payload['email'], 
        name: payload['name'], 
        avatar: payload['picture'],
        isRegistered: true 
      });
      await user.save();
    }
    res.json(user);
  } catch (err) {
    console.error("Auth Hatası:", err);
    res.status(500).json({ error: "Giriş başarısız" });
  }
});

// --- SOCKET.IO ---
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"], credentials: true } });

io.on('connection', async (socket) => {
  let userIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  if (userIP.includes(',')) userIP = userIP.split(',')[0].trim();
  if (userIP === '::1' || userIP === '127.0.0.1') userIP = '176.234.224.0';
  
  const geo = geoip.lookup(userIP);
  const countryCode = geo ? geo.country : 'UN';

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

  socket.on("user_logged_in", async ({ dbUserId }) => {
    const u = userDetails.get(socket.id);
    if (u && mongoose.Types.ObjectId.isValid(dbUserId)) {
      const dbUser = await User.findById(dbUserId);
      if (dbUser) {
        u.dbId = dbUserId;
        u.likes = dbUser.likes;
        u.isRegistered = true;
        console.log(`✅ Kullanıcı bağlandı ve doğrulandı: ${dbUser.name}`);
      }
    }
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

        // --- ADMİN PANELİ İÇİN CANLI EŞLEŞME KAYDI ---
        const matchId = `match_${socket.id}_${partner.id}`;
        global.liveMatches.set(matchId, {
            id: matchId,
            user1: { id: socket.id, country: countryCode, ip: userIP },
            user2: { id: partner.id, country: partner.countryCode, ip: pDetails ? pDetails.ip : 'N/A' },
            startTime: new Date()
        });

        io.to(socket.id).emit('partner_found', { 
            partnerId: partner.id, 
            initiator: true, 
            country: partner.countryCode,
            partnerGender: partner.myGender,
            partnerLikes: pDetails ? pDetails.likes : 0
        });
        io.to(partner.id).emit('partner_found', { 
            partnerId: socket.id, 
            initiator: false, 
            country: countryCode,
            partnerGender: myGender,
            partnerLikes: myDetails ? myDetails.likes : 0
        });
        return true;
      }
      return false;
    };

    if (!tryMatch()) {
      globalQueue.push({ id: socket.id, myGender, searchGender, countryCode, selectedCountry });
    }
  });

  socket.on('like_partner', async ({ targetId, increaseCounter, currentSessionLikes }) => {
    const me = userDetails.get(socket.id);
    const partner = userDetails.get(targetId);

    if (!me || !partner) return;

    if (increaseCounter && me.isRegistered && partner.dbId) {
        try {
            await User.findByIdAndUpdate(partner.dbId, { $inc: { likes: 1 } });
            partner.likes += 1;
            new Log({ userId: socket.id, userIP: me.ip, action: 'LIKED', targetId }).save();
        } catch (err) {
            console.error("Like update error:", err);
        }
    }
    io.to(targetId).emit('receive_like', { newLikes: partner.likes, senderSessionLikes: currentSessionLikes });
  });

  socket.on('report_user', async ({ reportedId, screenshot }) => {
    const reporter = userDetails.get(socket.id);
    const reported = userDetails.get(reportedId);

    if (reported) {
      try {
        const newReport = new Report({
          reporterId: socket.id,
          reportedId: reportedId,
          reportedIP: reported.ip,
          screenshot: screenshot, 
          date: new Date()
        });
        await newReport.save();
        reported.reports = (reported.reports || 0) + 1;
        new Log({ userId: socket.id, userIP: reporter ? reporter.ip : 'N/A', action: 'REPORTED', targetId: reportedId }).save();
        console.log(`⚠️ Kullanıcı Raporlandı: ${reportedId}`);
      } catch (err) {
        console.error("Rapor kaydedilemedi:", err);
      }
    }
  });

  socket.on('stop_search', () => {
    globalQueue = globalQueue.filter(u => u.id !== socket.id);
    const u = userDetails.get(socket.id);
    if (u) u.status = 'IDLE';
    const partnerId = activeMatches.get(socket.id);
    if (partnerId) io.to(partnerId).emit('partner_disconnected');
  });

  socket.on('next_user', () => {
    const partnerId = activeMatches.get(socket.id);
    
    if (partnerId) {
      io.to(partnerId).emit('partner_left_auto_next');
      
      activeMatches.delete(socket.id);
      activeMatches.delete(partnerId);
      
      const p = userDetails.get(partnerId);
      if (p) p.status = 'SEARCHING';

      // Live match temizliği
      const matchId1 = `match_${socket.id}_${partnerId}`;
      const matchId2 = `match_${partnerId}_${socket.id}`;
      global.liveMatches.delete(matchId1);
      global.liveMatches.delete(matchId2);
    }

    globalQueue = globalQueue.filter(u => u.id !== socket.id);
    const u = userDetails.get(socket.id);
    if (u) u.status = 'IDLE';
  });

  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
  });

  socket.on('disconnect', () => {
    const partnerId = activeMatches.get(socket.id);
    if (partnerId) {
      io.to(partnerId).emit('partner_left_auto_next');
      activeMatches.delete(partnerId);

      const matchId1 = `match_${socket.id}_${partnerId}`;
      const matchId2 = `match_${partnerId}_${socket.id}`;
      global.liveMatches.delete(matchId1);
      global.liveMatches.delete(matchId2);
    }
    
    userDetails.delete(socket.id);
    globalQueue = globalQueue.filter(u => u.id !== socket.id);
    activeMatches.delete(socket.id);
  });
});

// --- ADMIN PANELİ API ROTALARI (Socket Dışına Taşındı) ---

app.get('/api/admin/active-users', (req, res) => {
  const users = Array.from(userDetails.values());
  res.json(users);
});

app.get('/api/reports', async (req, res) => {
  const reports = await Report.find().sort({ date: -1 }).limit(50);
  res.json(reports);
});

app.delete('/api/reports/:id', async (req, res) => {
  await Report.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.get('/api/bans', async (req, res) => {
  const bans = await Ban.find();
  res.json(bans);
});

app.post('/api/ban-user', async (req, res) => {
  const { ip, reason } = req.body;
  const newBan = new Ban({ ip, reason: reason || "Admin tarafından yasaklandı" });
  await newBan.save();
  res.json({ success: true });
});

app.delete('/api/bans/:ip', async (req, res) => {
  await Ban.findOneAndDelete({ ip: req.params.ip });
  res.json({ success: true });
});

app.get('/api/admin/stats', async (req, res) => {
  const activeUsers = userDetails.size;
  const totalBans = await Ban.countDocuments();
  const pendingReports = await Report.countDocuments();
  res.json({ activeUsers, totalBans, pendingReports, totalMatchesToday: 0 });
});

app.get('/api/admin/active-matches', (req, res) => {
  const matches = global.liveMatches ? Array.from(global.liveMatches.values()) : [];
  res.json(matches);
});

app.post('/api/admin/kill-match', (req, res) => {
    const { matchId, user1Id, user2Id } = req.body;

    io.to(user1Id).emit('partner_left_auto_next');
    io.to(user2Id).emit('partner_left_auto_next');

    if (global.liveMatches) {
        global.liveMatches.delete(matchId);
    }

    console.log(`🛠️ Admin müdahalesi: Match ${matchId} sonlandırıldı.`);
    res.json({ success: true });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Sunucu ${PORT} portunda yayında.`);
});