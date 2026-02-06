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

// MODELLER
const Ban = mongoose.model('Ban', new mongoose.Schema({ ip: String, reason: String, date: { type: Date, default: Date.now } }));
const Report = mongoose.model('Report', new mongoose.Schema({ reporterId: String, reportedId: String, reportedIP: String, screenshot: String, date: { type: Date, default: Date.now } }));
const Log = mongoose.model('Log', new mongoose.Schema({ userId: String, userIP: String, action: String, targetId: String, duration: Number, date: { type: Date, default: Date.now } }));

const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"], credentials: true } });

let globalQueue = [];
const activeMatches = new Map();
const matchTimes = new Map();
const userDetails = new Map();

io.on('connection', async (socket) => {
  // IP YAKALAMA VE RENDER PROXY DÜZELTMESİ
  let userIP = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  if (userIP.includes(',')) userIP = userIP.split(',')[0].trim();
  if (userIP === '::1' || userIP === '127.0.0.1') userIP = '176.234.224.0';
  
  const geo = geoip.lookup(userIP);
  const countryCode = geo ? geo.country : 'UN';

  userDetails.set(socket.id, {
    id: socket.id,
    ip: userIP,
    country: countryCode,
    joinedAt: new Date(),
    skips: 0,
    reports: 0,
    status: 'IDLE',
    currentPartner: null
  });

  const isBanned = await Ban.findOne({ ip: userIP });
  if (isBanned) return socket.disconnect();

  socket.on('find_partner', async ({ myGender, searchGender, selectedCountry }) => {
    // 1. Önceki kuyruğu temizle
    globalQueue = globalQueue.filter(item => item.id !== socket.id);

    const u = userDetails.get(socket.id);
    if (u) {
        u.skips += 1;
        u.status = 'SEARCHING';
    }

    if (activeMatches.has(socket.id)) {
        const duration = Math.floor((Date.now() - (matchTimes.get(socket.id) || Date.now())) / 1000);
        new Log({ userId: socket.id, userIP, action: 'SKIPPED', duration }).save();
    }

    const tryMatch = () => {
      const partnerIndex = globalQueue.findIndex(p => {
        const genderMatch = (searchGender === 'all' || searchGender === p.myGender) && 
                            (p.searchGender === 'all' || p.searchGender === myGender);
        
        const countryMatch = (selectedCountry === 'all' || selectedCountry === p.countryCode);
        
        return genderMatch && countryMatch && p.id !== socket.id;
      });

      if (partnerIndex !== -1) {
        const partner = globalQueue[partnerIndex];
        globalQueue.splice(partnerIndex, 1);
        
        activeMatches.set(socket.id, partner.id);
        activeMatches.set(partner.id, socket.id);
        
        const now = Date.now();
        matchTimes.set(socket.id, now);
        matchTimes.set(partner.id, now);

        const u1 = userDetails.get(socket.id);
        const u2 = userDetails.get(partner.id);
        if (u1) { u1.status = 'BUSY'; u1.currentPartner = partner.id; }
        if (u2) { u2.status = 'BUSY'; u2.currentPartner = socket.id; }

        // KRİTİK: country bilgisini taze GeoIP verisinden gönderiyoruz
        io.to(socket.id).emit('partner_found', { partnerId: partner.id, initiator: true, country: partner.countryCode });
        io.to(partner.id).emit('partner_found', { partnerId: socket.id, initiator: false, country: countryCode });
        return true;
      }
      return false;
    };

    if (!tryMatch()) {
      globalQueue.push({ id: socket.id, myGender, searchGender, countryCode, selectedCountry });
    }
  });

  // START/STOP İÇİN YENİ: Kuyruktan çıkarma ve eşleşmeyi bitirme
  socket.on('stop_search', () => {
    globalQueue = globalQueue.filter(u => u.id !== socket.id);
    const u = userDetails.get(socket.id);
    if (u) {
        u.status = 'IDLE';
        u.currentPartner = null;
    }
    
    const partnerId = activeMatches.get(socket.id);
    if (partnerId) {
        io.to(partnerId).emit('partner_disconnected');
        activeMatches.delete(socket.id);
        activeMatches.delete(partnerId);
    }
  });

  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
  });

  socket.on('report_user', async ({ targetId, screenshot }) => {
    try {
      const targetProfile = userDetails.get(targetId);
      new Report({ reporterId: socket.id, reportedId: targetId, reportedIP: targetProfile ? targetProfile.ip : "Bilinmiyor", screenshot }).save();
      if (targetProfile) targetProfile.reports += 1;
      new Log({ userId: socket.id, userIP, action: 'REPORTED', targetId }).save();
    } catch (err) { console.error(err); }
  });

  socket.on('disconnect', () => {
    const partnerId = activeMatches.get(socket.id);
    if (partnerId) {
      const p = userDetails.get(partnerId);
      if (p) { p.status = 'IDLE'; p.currentPartner = null; }
      io.to(partnerId).emit('partner_disconnected');
    }
    userDetails.delete(socket.id);
    globalQueue = globalQueue.filter(u => u.id !== socket.id);
    activeMatches.delete(socket.id);
    matchTimes.delete(socket.id);
  });
});

// ADMIN API ROTALARI
app.get('/api/admin/active-users', (req, res) => res.json(Array.from(userDetails.values())));
app.get('/api/admin/stats', async (req, res) => {
    res.json({ activeUsers: userDetails.size, totalBans: await Ban.countDocuments(), pendingReports: await Report.countDocuments() });
});
app.get('/api/reports', async (req, res) => res.json(await Report.find().sort({ date: -1 })));
app.get('/api/bans', async (req, res) => res.json(await Ban.find().sort({ date: -1 })));
app.delete('/api/reports/:id', async (req, res) => { await Report.findByIdAndDelete(req.params.id); res.json({ success: true }); });
app.delete('/api/bans/:ip', async (req, res) => { await Ban.findOneAndDelete({ ip: req.params.ip }); res.json({ success: true }); });

const PORT = process.env.PORT || 5001;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Sunucu ${PORT} portunda yayında.`);
});