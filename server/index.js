const express = require('express');
const cors = require('cors');
const https = require('https'); 
const fs = require('fs'); 
const path = require('path'); // Dosya yolları için eklendi
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const geoip = require('geoip-lite');

const app = express();

// CORS Ayarları
app.use(cors({
  origin: ["https://localhost:3000", "https://192.168.1.170:3000"],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// --- HTTPS SERTİFİKA AYARLARI (GÜNCELLENDİ) ---
// path.join(__dirname, ...) kullanarak dosya yolunu garantiliyoruz
const options = {
  key: fs.readFileSync(path.join(__dirname, 'certificates', 'localhost-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'certificates', 'localhost.pem'))
};

const server = https.createServer(options, app);

// 1. MONGODB BAĞLANTISI
mongoose.connect('mongodb://localhost:27017/videochat')
  .then(() => console.log('✅ MongoDB Bağlantısı Başarılı (Secure)'))
  .catch(err => console.error('❌ MongoDB Bağlantı Hatası:', err));

// 2. MODELLER
const Ban = mongoose.model('Ban', new mongoose.Schema({ 
    ip: String, reason: String, date: { type: Date, default: Date.now } 
}));
const Report = mongoose.model('Report', new mongoose.Schema({ 
    reporterId: String, reportedId: String, reportedIP: String, screenshot: String, date: { type: Date, default: Date.now } 
}));
const Log = mongoose.model('Log', new mongoose.Schema({
    userId: String, userIP: String, action: String, targetId: String, duration: Number, date: { type: Date, default: Date.now }
}));

// SOCKET.IO AYARLARI
const io = new Server(server, {
  cors: {
    origin: ["https://localhost:3000", "https://192.168.1.170:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// 3. ANLIK TAKİP MERKEZİ
let globalQueue = [];
const activeMatches = new Map();
const matchTimes = new Map();
const userDetails = new Map();

io.on('connection', async (socket) => {
  let userIP = socket.handshake.address;
  if (userIP === '::1' || userIP === '127.0.0.1') userIP = '176.234.224.0';
  
  const geo = geoip.lookup(userIP);
  const countryCode = geo ? geo.country : 'UN';

  userDetails.set(socket.id, {
    id: socket.id,
    ip: socket.handshake.address,
    country: countryCode,
    joinedAt: new Date(),
    skips: 0,
    reports: 0,
    status: 'IDLE',
    currentPartner: null
  });

  const isBanned = await Ban.findOne({ ip: socket.handshake.address });
  if (isBanned) {
    socket.emit('error_msg', 'Erişiminiz engellenmiştir.');
    return socket.disconnect();
  }

  socket.on('find_partner', async ({ myGender, searchGender, onlySameCountry }) => {
    const u = userDetails.get(socket.id);
    if (u) u.skips += 1;

    if (activeMatches.has(socket.id)) {
        const duration = Math.floor((Date.now() - (matchTimes.get(socket.id) || Date.now())) / 1000);
        new Log({ userId: socket.id, userIP: socket.handshake.address, action: 'SKIPPED', duration }).save();
    }

    globalQueue = globalQueue.filter(u => u.id !== socket.id);

    const tryMatch = (forceGlobal = false) => {
      const partnerIndex = globalQueue.findIndex(p => {
        const genderMatch = (searchGender === 'all' || searchGender === p.myGender) && (p.searchGender === 'all' || p.searchGender === myGender);
        let countryMatch = true;
        if (!forceGlobal && (onlySameCountry || p.onlySameCountry)) countryMatch = (p.countryCode === countryCode);
        return genderMatch && countryMatch && p.id !== socket.id;
      });

      if (partnerIndex !== -1) {
        const partner = globalQueue[partnerIndex];
        globalQueue.splice(partnerIndex, 1);
        activeMatches.set(socket.id, partner.id);
        activeMatches.set(partner.id, socket.id);
        const u1 = userDetails.get(socket.id);
        const u2 = userDetails.get(partner.id);
        if (u1) { u1.status = 'BUSY'; u1.currentPartner = partner.id; }
        if (u2) { u2.status = 'BUSY'; u2.currentPartner = socket.id; }
        const now = Date.now();
        matchTimes.set(socket.id, now);
        matchTimes.set(partner.id, now);
        io.to(socket.id).emit('partner_found', { partnerId: partner.id, initiator: true, country: partner.countryCode });
        io.to(partner.id).emit('partner_found', { partnerId: socket.id, initiator: false, country: countryCode });
        return true;
      }
      return false;
    };

    if (!tryMatch(false)) {
      globalQueue.push({ id: socket.id, myGender, searchGender, countryCode, onlySameCountry });
      if (onlySameCountry) {
        setTimeout(() => {
          const userInQueue = globalQueue.find(u => u.id === socket.id);
          if (userInQueue && userInQueue.onlySameCountry) {
            userInQueue.onlySameCountry = false;
            socket.emit('waiting_msg', 'Global eşleşmeye geçiliyor...');
            tryMatch(true); 
          }
        }, 5000);
      }
    }
  });

  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
  });

  socket.on('report_user', async ({ targetId, screenshot }) => {
    try {
      const sockets = await io.fetchSockets();
      const targetSocket = sockets.find(s => s.id === targetId);
      const targetIP = targetSocket ? targetSocket.handshake.address : "Bilinmiyor";
      new Report({ reporterId: socket.id, reportedId: targetId, reportedIP: targetIP, screenshot }).save();
      const targetProfile = userDetails.get(targetId);
      if (targetProfile) targetProfile.reports += 1;
      new Log({ userId: socket.id, userIP: socket.handshake.address, action: 'REPORTED', targetId }).save();
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

// --- ADMIN ROTALARI ---
app.get('/api/admin/active-users', (req, res) => res.json(Array.from(userDetails.values())));

app.get('/api/admin/stats', async (req, res) => {
    const stats = {
        activeUsers: userDetails.size,
        totalBans: await Ban.countDocuments(),
        pendingReports: await Report.countDocuments(),
    };
    res.json(stats);
});

// Server Başlatma
server.listen(5001, "0.0.0.0", () => {
    console.log('🚀 Güvenli Komuta Merkezi (HTTPS) 5001 portunda aktif.');
});