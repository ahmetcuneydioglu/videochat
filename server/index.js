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
    currentPartner: null,
    myGender: 'male' // Varsayılan
  });

  const isBanned = await Ban.findOne({ ip: userIP });
  if (isBanned) return socket.disconnect();

  socket.on('find_partner', async ({ myGender, searchGender, selectedCountry }) => {
    globalQueue = globalQueue.filter(item => item.id !== socket.id);

    const u = userDetails.get(socket.id);
    if (u) {
        u.skips += 1;
        u.status = 'SEARCHING';
        u.myGender = myGender; // Cinsiyeti güncelle
    }

    const tryMatch = () => {
      const partnerIndex = globalQueue.findIndex(p => {
        const genderMatch = (searchGender === 'all' || searchGender === p.myGender) && 
                            (p.searchGender === 'all' || p.myGender === myGender);
        const countryMatch = (selectedCountry === 'all' || selectedCountry === p.countryCode);
        return genderMatch && countryMatch && p.id !== socket.id;
      });

      if (partnerIndex !== -1) {
        const partner = globalQueue[partnerIndex];
        globalQueue.splice(partnerIndex, 1);
        
        activeMatches.set(socket.id, partner.id);
        activeMatches.set(partner.id, socket.id);
        
        const u1 = userDetails.get(socket.id);
        const u2 = userDetails.get(partner.id);
        if (u1) u1.status = 'BUSY';
        if (u2) u2.status = 'BUSY';

        // Karşılıklı veri gönderimi
        io.to(socket.id).emit('partner_found', { 
            partnerId: partner.id, 
            initiator: true, 
            country: partner.countryCode,
            partnerGender: partner.myGender 
        });
        io.to(partner.id).emit('partner_found', { 
            partnerId: socket.id, 
            initiator: false, 
            country: countryCode,
            partnerGender: myGender 
        });
        return true;
      }
      return false;
    };

    if (!tryMatch()) {
      globalQueue.push({ id: socket.id, myGender, searchGender, countryCode, selectedCountry });
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