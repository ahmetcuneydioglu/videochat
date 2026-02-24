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
  role: { type: String, default: 'user' }, // 'user', 'vip', 'admin'
  trustScore: { type: Number, default: 100 }, // Güven Skoru (0-100)
  status: { type: String, default: 'active' }, // 'active', 'shadow_banned'
  lastSeen: { type: Date, default: Date.now },
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
    const ticket = await client.verifyIdToken({ 
      idToken: token, 
      // DİKKAT: Artık hem Web hem de iOS uygulamanı tanıyacak!
      audience: [
        "18397104529-p1kna8b71s0n5b6lv1oatk2vdrofp6c2.apps.googleusercontent.com", // Web (omegpt.com)
        "18397104529-nkekeeding26dqscnl6tgg8ejanhn5c0.apps.googleusercontent.com"  // iOS (Mobil Uygulama)
      ] 
    });
    
    const payload = ticket.getPayload();
    let user = await User.findOne({ googleId: payload['sub'] });
    
    if (!user) {
      user = new User({ 
        googleId: payload['sub'], 
        email: payload['email'], 
        name: payload['name'], 
        avatar: payload['picture'], 
        isRegistered: true 
      });
      await user.save();
    }
    
    // Kullanıcı bilgilerini mobil uygulamaya başarıyla gönderiyoruz
    res.json(user);
    
  } catch (err) {
    // Hatayı sunucu loglarında görebilmek için buraya yazdırıyoruz
    console.error("❌ Google Login Doğrulama Hatası:", err); 
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
const normalizeCountry = (code) => {
  if (!code) return 'UN';
  const normalized = String(code).toUpperCase();
  return normalized === 'ALL' ? 'all' : normalized;
};

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
  const countryCode = normalizeCountry(geo ? geo.country : 'UN');

  console.log(`👤 Yeni Bağlantı: ${socket.id.slice(0,6)}... (IP: ${userIP}, Ülke: ${countryCode})`);

  const dbUserId = socket.handshake.query.dbUserId; 
  let currentLikes = 0; let isRegistered = false;

  if (dbUserId && mongoose.Types.ObjectId.isValid(dbUserId)) {
    const dbUser = await User.findById(dbUserId);
    if (dbUser) { currentLikes = dbUser.likes; isRegistered = true;
  socket.emit('update_my_likes', { likes: dbUser.likes });}
  }

  userDetails.set(socket.id, { id: socket.id, dbId: dbUserId || null, ip: userIP, country: countryCode, status: 'IDLE', likes: currentLikes, isRegistered, myGender: 'male' });

  // --- WEBRTC SIGNALING FORWARDERS (offer/answer/ice_candidate) ---
function getVerifiedPartnerId(socket, to) {
  const partnerId = to || activeMatches.get(socket.id);
  if (!partnerId) return null;

  // Güvenlik: gerçekten şu an eşleşik mi?
  if (activeMatches.get(partnerId) !== socket.id) return null;
  return partnerId;
}

socket.on('offer', ({ offer, to, user }) => {
  const partnerId = getVerifiedPartnerId(socket, to);
  if (!partnerId || !offer) return;
  io.to(partnerId).emit('offer', { from: socket.id, offer, user });
});

socket.on('answer', ({ answer, to, user }) => {
  const partnerId = getVerifiedPartnerId(socket, to);
  if (!partnerId || !answer) return;
  io.to(partnerId).emit('answer', { from: socket.id, answer, user });
});

socket.on('ice_candidate', ({ candidate, to }) => {
  const partnerId = getVerifiedPartnerId(socket, to);
  if (!partnerId || !candidate) return;
  io.to(partnerId).emit('ice_candidate', { from: socket.id, candidate });
});

socket.on('camera_state', ({ to, isOff }) => {
  const partnerId = getVerifiedPartnerId(socket, to);
  if (!partnerId) return;
  io.to(partnerId).emit('camera_state', { from: socket.id, isOff: Boolean(isOff) });
});


  // --- GÜNCELLENMİŞ EŞLEŞME (MATCH) MANTIĞI ---
  socket.on('find_partner', async ({ myGender, searchGender, selectedCountry }) => {
    const normalizedSelectedCountry = normalizeCountry(selectedCountry || 'all');
    const normalizedSearchGender = String(searchGender || 'all');
    
    // 1. Kullanıcının kendi ülkesini bul (Karşı tarafın filtresini kontrol etmek için gerekli)
    const u = userDetails.get(socket.id);
    const myCountryCode = normalizeCountry(u ? u.country : 'UN');

    console.log(`🔍 [${socket.id.slice(0,6)}] Eşleşme arıyor... (Kendi: ${myGender} - ${myCountryCode} | Aradığı: ${searchGender} - ${normalizedSelectedCountry})`);
    
    const existingPartner = activeMatches.get(socket.id);
    if (existingPartner) {
        console.log(`⚠️ GÜVENLİK: [${socket.id.slice(0,6)}] yeni arama yaptı ama eski eşleşmesi askıda kalmış. Temizleniyor...`);
        io.to(existingPartner).emit('partner_left_auto_next');
        activeMatches.delete(socket.id);
        activeMatches.delete(existingPartner);
        if (global.liveMatches) global.liveMatches.delete(getMatchId(socket.id, existingPartner));
    }

    globalQueue = globalQueue.filter(item => item.id !== socket.id);
    if (u) { u.status = 'SEARCHING'; u.myGender = myGender; }

    const myHasAnyFilter = normalizedSearchGender !== 'all' || normalizedSelectedCountry !== 'all';
    const partnerHasAnyFilter = (p) => {
      const pSearchGender = String(p.searchGender || 'all');
      const pSelectedCountry = normalizeCountry(p.selectedCountry || 'all');
      return pSearchGender !== 'all' || pSelectedCountry !== 'all';
    };

    const getCandidatePriority = (p) => {
      const pHasAnyFilter = partnerHasAnyFilter(p);
      const pCountryCode = normalizeCountry(p.countryCode || 'UN');
      const sameCountry = pCountryCode === myCountryCode;

      // 1) Filtre kullananlar önce filtreli havuzdan eşleşsin.
      if (myHasAnyFilter) {
        return pHasAnyFilter ? 0 : 1;
      }

      // 2) Filtre kullanmayanlar: önce kendi ülkesinden, sonra global.
      if (!pHasAnyFilter && sameCountry) return 0;
      if (!pHasAnyFilter) return 1;
      return 2;
    };

    const tryMatch = () => {
      let bestIndex = -1;
      let bestPriority = Number.POSITIVE_INFINITY;

      globalQueue.forEach((p, idx) => {
        if (p.id === socket.id) return;

        const pSearchGender = String(p.searchGender || 'all');
        const pSelectedCountry = normalizeCountry(p.selectedCountry || 'all');
        const pCountryCode = normalizeCountry(p.countryCode || 'UN');

        const genderMatch =
          (normalizedSearchGender === 'all' || normalizedSearchGender === p.myGender) &&
          (pSearchGender === 'all' || pSearchGender === myGender);

        // Filtreli tarafta hedef ülke, karşı tarafın gerçek ülke koduyla kontrol edilir.
        const countryMatch =
          (normalizedSelectedCountry === 'all' || normalizedSelectedCountry === pCountryCode) &&
          (pSelectedCountry === 'all' || pSelectedCountry === myCountryCode);

        if (!genderMatch || !countryMatch) return;

        const priority = getCandidatePriority(p);
        if (priority < bestPriority) {
          bestPriority = priority;
          bestIndex = idx;
        }
      });

      const partnerIndex = bestIndex;

      if (partnerIndex !== -1) {
        const partner = globalQueue[partnerIndex];
        globalQueue.splice(partnerIndex, 1); // Eşleşeni kuyruktan çıkar
        
        activeMatches.set(socket.id, partner.id);
        activeMatches.set(partner.id, socket.id);
        
        const myDetails = userDetails.get(socket.id);
        const pDetails = userDetails.get(partner.id);
        if (myDetails) myDetails.status = 'BUSY';
        if (pDetails) pDetails.status = 'BUSY';

        const matchId = getMatchId(socket.id, partner.id);
        global.liveMatches.set(matchId, {
            id: matchId,
            user1: { id: socket.id, country: myCountryCode, ip: userIP },
            user2: { id: partner.id, country: partner.countryCode, ip: pDetails ? pDetails.ip : 'N/A' },
            startTime: new Date()
        });

        console.log(`🎉 EŞLEŞME BAŞARILI: [${socket.id.slice(0,6)}] ❤️ [${partner.id.slice(0,6)}]`);

        io.to(socket.id).emit('partner_found', { partnerId: partner.id, initiator: true, country: partner.countryCode, partnerGender: partner.myGender, partnerLikes: pDetails ? pDetails.likes : 0 });
        io.to(partner.id).emit('partner_found', { partnerId: socket.id, initiator: false, country: myCountryCode, partnerGender: myGender, partnerLikes: myDetails ? myDetails.likes : 0 });
        return true;
      }
      return false;
    };

    if (!tryMatch()) {
      // Eşleşme bulunamazsa, kendi ülkesi (countryCode) ve aradığı filtrelerle (selectedCountry) birlikte kuyruğa girer
      globalQueue.push({ id: socket.id, myGender, searchGender: normalizedSearchGender, countryCode: myCountryCode, selectedCountry: normalizedSelectedCountry });
      console.log(`⏳ [${socket.id.slice(0,6)}] Kuyruğa eklendi. Kuyrukta bekleyen: ${globalQueue.length} kişi`);
    }
  });

  
  socket.on('next_user', () => {
  const partnerId = activeMatches.get(socket.id);
  
  // Süreyi hesaplamak için match verisini çekiyoruz
  const matchId = getMatchId(socket.id, partnerId);
  const match = global.liveMatches.get(matchId);

  if (match && partnerId) {
    const duration = (new Date() - match.startTime) / 1000;
    const myDetails = userDetails.get(socket.id);
    const pDetails = userDetails.get(partnerId);

    // 2 dakikadan fazlaysa her iki kayıtlı kullanıcıya puan ver
    if (duration > 120) {
      if (myDetails?.dbId) updateTrustScore(myDetails.dbId, 5);
      if (pDetails?.dbId) updateTrustScore(pDetails.dbId, 5);
    }

    console.log(`⏭️ [${socket.id.slice(0,6)}] NEXT dedi.`);
    io.to(partnerId).emit('partner_left_auto_next');
    activeMatches.delete(socket.id);
    activeMatches.delete(partnerId);
    global.liveMatches.delete(matchId);
    
    const p = userDetails.get(partnerId);
    if (p) p.status = 'SEARCHING';
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
    io.to(targetId).emit('receive_like', { 
        newLikes: partner.likes, 
        senderSessionLikes: currentSessionLikes,
        isForMe: true // <--- Bu bayrak sayesinde Frontend kimin beğeni aldığını anlar
    });

    updateTrustScore(partner.dbId, 2);
    
  });

  socket.on('report_user', async ({ reportedId, screenshot }) => {
    const reported = userDetails.get(reportedId);
    const reportedUser = userDetails.get(reportedId);
    if (reported) {
        await new Report({ reporterId: socket.id, reportedId, reportedIP: reported.ip, screenshot, date: new Date() }).save();
        reported.reports = (reported.reports || 0) + 1;
        console.log(`⚠️ KULLANICI RAPORLANDI: [${reportedId}]`);
    }

    if (reportedUser && reportedUser.dbId) {
      updateTrustScore(reportedUser.dbId, -15);
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
  
  try {
    // 1. Ban süresini hesapla (24 Saat)
    const expireDate = new Date();
    expireDate.setHours(expireDate.getHours() + 24);

    // 2. Ban kaydını oluştur
    await new Ban({ 
      ip, 
      reason: reason || "Kurallara Aykırı Davranış", 
      expireAt: expireDate 
    }).save();

    if (reportedId) {
      // 3. Güven Skorunu Ağır Şekilde Düşür (-50 Puan)
      const targetUser = userDetails.get(reportedId);
      if (targetUser && targetUser.dbId) {
        // updateTrustScore fonksiyonunu burada tetikliyoruz
        await updateTrustScore(targetUser.dbId, -50);
        console.log(`⚖️ Ban sonucu ${targetUser.id} için puan düşürüldü.`);
      }

      // 4. Kişiye banlandığını bildir (Frontend'deki sayaç ekranı için)
      io.to(reportedId).emit('account_banned', { 
        reason: reason || "Topluluk kurallarını ihlal ettiniz.",
        expireAt: expireDate
      });
      
      // 5. Bağlantıyı kopar (Mesajın gitmesi için 1.5 saniye bekleme süresi)
      const s = io.sockets.sockets.get(reportedId);
      if (s) {
        setTimeout(() => {
          s.disconnect();
        }, 1500);
      } 
    }

    res.json({ success: true });

  } catch (err) {
    console.error("❌ Banlama işlemi sırasında hata:", err);
    res.status(500).json({ error: "İşlem başarısız." });
  }
});


app.post('/api/admin/kill-match', (req, res) => {
    const { matchId, user1Id, user2Id } = req.body;
    io.to(user1Id).emit('partner_left_auto_next'); io.to(user2Id).emit('partner_left_auto_next');
    if (global.liveMatches) global.liveMatches.delete(matchId);
    res.json({ success: true });
});

// Tüm Kayıtlı Kullanıcıları Listele (Admin)
// Düşük trustScore en üstte olacak şekilde sırala (1: artan, -1: azalan)
app.get('/api/admin/all-users', async (req, res) => {
  try {
    const users = await User.find().sort({ trustScore: 1, createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Kullanıcılar getirilemedi" });
  }
});

// Kullanıcı Güncelleme (Role, Status, TrustScore vb.)
app.post('/api/admin/update-user', async (req, res) => {
  const { userId, updateData } = req.body;
  try {
    await User.findByIdAndUpdate(userId, updateData);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Güncelleme hatası" });
  }
});

// Güven Skoru Otomasyonu (Örnek: Like alınca artar)
// Bu mantığı mevcut socket.on('like_partner') içine de entegre edebilirsin

async function updateTrustScore(userId, change) {
  console.log(`🔍 Skor Güncelleme İsteği: ID=${userId}, Değişim=${change}`); // Bunu ekle
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        console.log("❌ Geçersiz ID veya dbId bulunamadı.");
        return;
    }
  
  try {
    const user = await User.findById(userId);
    if (user) {
      // Skoru 0 ile 100 arasında tutalım
      let newScore = (user.trustScore || 100) + change;
      newScore = Math.max(0, Math.min(100, newScore));
      
      await User.findByIdAndUpdate(userId, { trustScore: newScore });
      console.log(`⚖️ Güven Skoru Güncellendi: ${user.name} (${newScore})`);
    }
  } catch (err) {
    console.error("Güven skoru güncelleme hatası:", err);
  }
}

const PORT = process.env.PORT || 5001;
server.listen(PORT, "0.0.0.0", () => console.log(`🚀 Sunucu ${PORT} portunda yayında.`));
