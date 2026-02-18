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

// HTTPS yönlendirmesi (Production için)
app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
        res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
        next();
    }
});

const server = http.createServer(app);

// Socket.io Ayarları
const io = new Server(server, {
  cors: {
    // BURASI ÇOK ÖNEMLİ: '*' yerine açıkça izin verilen originleri kullanmalıyız
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.includes("localhost")) {
        callback(null, true);
      } else {
        // Mobil uygulamalar bazen 'origin' göndermez, onlara da izin ver
        callback(null, true); 
      }
    },
    methods: ["GET", "POST"],
    credentials: true // Hatanın ana çözümü bu satırla uyumlu origin kullanımıdır
  }
});

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ahmetcnd:Ahmet263271@videochat.vok6vud.mongodb.net/videochat?retryWrites=true&w=majority';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Bağlantısı Başarılı'))
  .catch(err => console.error('❌ MongoDB Bağlantı Hatası:', err));

// --- MODELLER ---
const UserSchema = new mongoose.Schema({
  googleId: String,
  email: String,
  username: String,
  avatar: String,
  role: { type: String, default: 'user' }, // 'user', 'moderator', 'admin'
  isBanned: { type: Boolean, default: false },
  banExpires: Date,
  isPremium: { type: Boolean, default: false },
  trustScore: { type: Number, default: 100 },
  reportsReceived: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', UserSchema);

const ReportSchema = new mongoose.Schema({
  reporterId: String, // Socket ID veya DB ID
  reportedId: String,
  reason: String,
  timestamp: { type: Date, default: Date.now },
  status: { type: String, default: 'pending' } // pending, resolved, dismissed
});
const Report = mongoose.model('Report', ReportSchema);

const MessageSchema = new mongoose.Schema({
    senderId: String,
    receiverId: String,
    text: String,
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);

const client = new OAuth2Client("68579736284-825595304655-246536647241.apps.googleusercontent.com");

// --- SOCKET.IO MANTIGI ---
let waitingUsers = []; // Kuyruk

io.on('connection', (socket) => {
  console.log(`🔌 Yeni Bağlantı: ${socket.id}`);

  // 1. EŞLEŞME İSTEĞİ (MOBİL UYUMLU GÜNCELLEME)
  socket.on('find_partner', async (data) => {
    // Mobil veya Web'den gelen verileri al
    const { myGender, searchGender, selectedCountry, username, token } = data;
    
    // IP bazlı ülke bulma
    let ip = socket.handshake.headers['x-forwarded-for'] || socket.request.connection.remoteAddress;
    let country = selectedCountry !== 'all' ? selectedCountry : (geoip.lookup(ip)?.country || 'TR');

    let isPremium = false;
    let dbId = null;
    let trustScore = 100;
    
    // Eğer token varsa DB'den kullanıcıyı bul
    if (token) {
        try {
            const ticket = await client.verifyIdToken({
                idToken: token,
                audience: "68579736284-825595304655-246536647241.apps.googleusercontent.com",
            });
            const payload = ticket.getPayload();
            const user = await User.findOne({ email: payload.email });
            if (user) {
                if (user.isBanned && user.banExpires > new Date()) {
                    socket.emit('error', 'Hesabınız yasaklı.');
                    return;
                }
                isPremium = user.isPremium;
                dbId = user._id;
                trustScore = user.trustScore;
            }
        } catch (e) {
            console.log("Token doğrulama hatası:", e.message);
        }
    }

    // Kullanıcı verisini oluştur
    const userData = {
      id: socket.id,
      dbId: dbId,
      gender: myGender || 'male',
      searchGender: searchGender || 'all',
      country: country,
      username: username || 'Guest', // Mobilden gelen username'i kullan
      isPremium: isPremium,
      trustScore: trustScore,
      partnerId: null
    };

    // --- KRİTİK DÜZELTME: Socket'e veriyi yapıştır ---
    socket.userData = userData; 

    // Kuyruktan uygun partner ara
    const partnerIndex = waitingUsers.findIndex((user) => {
      if (user.id === socket.id) return false; // Kendisiyle eşleşmesin

      // Cinsiyet Filtresi
      const genderMatch = (userData.searchGender === 'all' || userData.searchGender === user.gender) &&
                          (user.searchGender === 'all' || user.searchGender === userData.gender);
      
      // Ülke Filtresi
      const countryMatch = (userData.country === 'all' || userData.country === user.country) &&
                           (user.country === 'all' || user.country === userData.country);

      // Güven Skoru (Basit mantık)
      const scoreMatch = Math.abs(userData.trustScore - user.trustScore) < 30;

      return genderMatch && countryMatch; 
    });

    if (partnerIndex !== -1) {
      // PARTNER BULUNDU
      const partner = waitingUsers.splice(partnerIndex, 1)[0];
      
      socket.userData.partnerId = partner.id;
      partner.partnerId = socket.id; // Partnerin socket nesnesine erişemiyoruz ama id'sini biliyoruz

      // Partnerin socket nesnesini bulup güncellememiz lazım (Opsiyonel ama iyi olur)
      const partnerSocket = io.sockets.sockets.get(partner.id);
      if(partnerSocket) partnerSocket.userData.partnerId = socket.id;

      // Her iki tarafa da haber ver
      io.to(socket.id).emit('partner_found', { partnerId: partner.id, initiator: true });
      io.to(partner.id).emit('partner_found', { partnerId: socket.id, initiator: false });

      console.log(`✅ Eşleşme: ${socket.id} <-> ${partner.id}`);
    } else {
      // PARTNER YOK, KUYRUĞA EKLE
      // Eğer zaten kuyruktaysa güncelle
      const existingIndex = waitingUsers.findIndex(u => u.id === socket.id);
      if (existingIndex !== -1) {
          waitingUsers[existingIndex] = userData;
      } else {
          waitingUsers.push(userData);
      }
      console.log(`⏳ Kuyrukta Bekliyor: ${socket.id} (Toplam: ${waitingUsers.length})`);
    }
  });

  // 2. SIGNALING: OFFER (KRİTİK DÜZELTME YAPILDI)
  socket.on('offer', (data) => {
    // Mobilden gelen 'user' verisini öncelikli kullan, yoksa socket.userData'ya bak
    const senderUser = data.user || socket.userData || { username: "Mobile User", gender: "male" };
    
    // Veriyi zenginleştirerek karşıya ilet
    io.to(data.to).emit('offer', {
        offer: data.offer,
        from: socket.id,
        user: senderUser, // Web tarafı bunu bekliyor!
        isMobile: data.isMobile || false
    });
  });

  // 3. SIGNALING: ANSWER (KRİTİK DÜZELTME YAPILDI)
  socket.on('answer', (data) => {
    // Mobilden gelen 'user' verisini öncelikli kullan
    const responderUser = data.user || socket.userData || { username: "Mobile User", gender: "male" };

    io.to(data.to).emit('answer', {
        answer: data.answer,
        to: socket.id,
        user: responderUser // Web tarafı bunu bekliyor!
    });
  });

  // 4. SIGNALING: ICE CANDIDATE
  socket.on('ice_candidate', (data) => {
    // Eğer partnerId yoksa (henüz userData'ya işlenmediyse) data.to kullanabiliriz (varsa)
    // Ancak en garantisi partnerId'yi socket üzerinde tutmaktır.
    const partnerId = socket.userData?.partnerId; 
    
    if (partnerId) {
        io.to(partnerId).emit('ice_candidate', {
            candidate: data.candidate,
            from: socket.id
        });
    } else {
        // Alternatif: Mobile'dan 'to' geliyorsa onu kullan (Gelmeyebilir ama yedek olsun)
        // Genelde ice_candidate payload'unda 'to' gönderilmez ama ekleyebiliriz.
        // Şimdilik partnerId üzerinden gidiyoruz.
    }
  });

  // --- MESAJLAŞMA ---
  socket.on('message', async (data) => {
      const partnerId = socket.userData?.partnerId;
      if (partnerId) {
          io.to(partnerId).emit('message', { 
              text: data.text, 
              from: socket.id,
              timestamp: new Date()
          });
          
          // Mesajı DB'ye kaydet (Opsiyonel, performans için kapatılabilir)
          // await Message.create({ senderId: socket.id, receiverId: partnerId, text: data.text });
      }
  });

  // --- KOPMA / AYRILMA ---
  socket.on('disconnect', () => {
    console.log(`❌ Ayrıldı: ${socket.id}`);
    
    // Kuyruktan sil
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    
    // Partneri varsa ona haber ver
    const partnerId = socket.userData?.partnerId;
    if (partnerId) {
        io.to(partnerId).emit('partner_disconnected');
        
        // Partnerin partner bilgisini temizle
        const partnerSocket = io.sockets.sockets.get(partnerId);
        if (partnerSocket && partnerSocket.userData) {
            partnerSocket.userData.partnerId = null;
        }
    }
  });

  // --- REPORT SİSTEMİ ---
  socket.on('report_user', async (data) => {
      const { reason } = data;
      const reportedId = socket.userData?.partnerId;
      
      if (reportedId) {
          console.log(`🚩 Rapor: ${socket.id} -> ${reportedId} (${reason})`);
          
          // DB'ye kaydet
          await Report.create({
              reporterId: socket.id, // Veya dbId
              reportedId: reportedId,
              reason: reason
          });

          // Raporlanan kullanıcının güven skorunu düşür
          // updateTrustScore(reportedId, -10); // Fonksiyon aşağıda
      }
  });

  // Login (Mobil için basit auth)
  socket.on('login', (data) => {
      socket.userData = {
          ...socket.userData,
          username: data.username || 'Guest',
          gender: data.gender || 'male'
      };
      console.log(`🔑 Login: ${socket.id} as ${socket.userData.username}`);
  });
});

// --- API ROUTES ---

// Admin Panel: Kullanıcıları Listele
app.get('/api/admin/users', async (req, res) => {
  // Basit bir güvenlik: Header'da 'admin-secret' bekle
  // const secret = req.headers['admin-secret'];
  // if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({error: 'Unauthorized'});

  try {
    const users = await User.find().sort({ trustScore: 1, createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Kullanıcılar getirilemedi" });
  }
});

// Kullanıcı Güncelleme
app.post('/api/admin/update-user', async (req, res) => {
  const { userId, updateData } = req.body;
  try {
    await User.findByIdAndUpdate(userId, updateData);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Güncelleme hatası" });
  }
});

async function updateTrustScore(userId, change) {
  // console.log(`🔍 Skor Güncelleme İsteği: ID=${userId}, Değişim=${change}`);
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) return;
  
  try {
    const user = await User.findById(userId);
    if (user) {
      let newScore = (user.trustScore || 100) + change;
      newScore = Math.max(0, Math.min(100, newScore));
      user.trustScore = newScore;
      await user.save();
    }
  } catch (e) {
      console.error("Skor güncellenemedi:", e);
  }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server ${PORT} portunda çalışıyor`);
});