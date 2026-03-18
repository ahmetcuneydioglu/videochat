const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const http = require('http'); 
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const geoip = require('geoip-lite');
const { OAuth2Client } = require('google-auth-library');
const User = require('./models/User');
const MatchHistory = require('./models/MatchHistory');
const Follow = require('./models/Follow');
const Purchase = require('./models/Purchase');
const { signAccessToken } = require('./utils/jwt');
const { requireAuth, requireSelfOrAdmin } = require('./middlewares/auth');
const { requireAdmin } = require('./middlewares/admin');
const { authRateLimit, userActionRateLimit, adminRateLimit } = require('./middlewares/rateLimit');
const { socketAuthMiddleware } = require('./middlewares/socketAuth');
const { consumeSocketEvent } = require('./utils/socketRateLimiter');
const { followSchema, updateProfileSchema, getUserStatusSchema } = require('./utils/validators');
const { verifyPurchaseWithStore } = require('./services/purchaseVerification');
const { ALLOWED_ORIGINS, GOOGLE_CLIENT_IDS, MONGODB_URI, PORT, NODE_ENV } = require('./config/env');

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = ALLOWED_ORIGINS;

app.get('/healthz', (req, res) => {
  res.status(200).json({ ok: true });
});

app.use(helmet());
app.use(cors({ 
  origin: allowedOrigins, 
  credentials: true 
}));

app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') !== 'https' && NODE_ENV === 'production') {
        res.redirect(`https://${req.header('host')}${req.url}`);
    } else {
        next();
    }
});

const server = http.createServer(app);

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Bağlantısı Başarılı'))
  .catch(err => console.error('❌ MongoDB Bağlantı Hatası:', err));

// Ban şemasına expireAt eklendi
const BanSchema = new mongoose.Schema({ 
  ip: String, 
  reason: String, 
  date: { type: Date, default: Date.now },
  expireAt: { type: Date } // Ban bitiş süresi
});
const Ban = mongoose.model('Ban', BanSchema);

const Report = mongoose.model('Report', new mongoose.Schema({ reporterId: String, reportedId: String, reportedIP: String, screenshot: String, date: { type: Date, default: Date.now } }));
const Log = mongoose.model('Log', new mongoose.Schema({ userId: String, userIP: String, action: String, targetId: String, duration: Number, date: { type: Date, default: Date.now } }));

// --- MESAJ ŞEMASI ---
const MessageSchema = new mongoose.Schema({
  senderId: String,       // Socket ID veya DB User ID
  receiverId: String,     // Socket ID veya DB User ID
  text: String,           // Mesaj İçeriği
  timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);
// -----------------------------------

let globalQueue = [];
const activeMatches = new Map();
const userDetails = new Map();
const pendingPrivateCalls = new Map();
const matchmakingReservations = new Set();
const connectedUsers = new Map();
const socketToDbUser = new Map();
const onlineUsers = new Map();

if (!global.liveMatches) global.liveMatches = new Map();

const client = new OAuth2Client();

app.post('/api/auth/social-login', authRateLimit, async (req, res) => {
  const { token } = req.body;
  try {
    if (!token || !GOOGLE_CLIENT_IDS.length) {
      return res.status(400).json({ error: 'Eksik doğrulama yapılandırması' });
    }
    const ticket = await client.verifyIdToken({ 
      idToken: token, 
      audience: GOOGLE_CLIENT_IDS
    });
    
    const payload = ticket.getPayload();
    const requestIp = getClientIp(req.headers['x-forwarded-for'] || req.socket.remoteAddress);
    const geo = geoip.lookup(requestIp);
    const country = normalizeCountry(geo ? geo.country : 'UN');
    const countryFlag = countryCodeToFlag(country);
    let user = await User.findOne({ googleId: payload['sub'] });
    
    if (!user) {
      user = new User({ 
        googleId: payload['sub'], 
        email: payload['email'], 
        name: payload['name'], 
        avatar: payload['picture'], 
        country,
        countryFlag,
        isRegistered: true 
      });
    } else {
      user.email = payload['email'];
      user.name = payload['name'];
      user.avatar = payload['picture'];
      user.country = country;
      user.countryFlag = countryFlag;
      user.isRegistered = true;
    }

    user.lastLoginDate = new Date();
    user.lastSeen = new Date();
    await user.save();
    const accessToken = signAccessToken(user);
    
    res.json({ user, accessToken });
    
  } catch (err) {
    console.error("❌ Google Login Doğrulama Hatası:", err); 
    res.status(500).json({ error: "Giriş başarısız" });
  }
});

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["polling", "websocket"]
});
io.use(socketAuthMiddleware);

const getMatchId = (id1, id2) => [id1, id2].sort().join('_');
const normalizeCountry = (code) => {
  if (!code) return 'UN';
  const normalized = String(code).toUpperCase();
  return normalized === 'ALL' ? 'all' : normalized;
};
const countryCodeToFlag = (code) => {
  const normalized = normalizeCountry(code);
  if (!/^[A-Z]{2}$/.test(normalized)) return null;
  return String.fromCodePoint(...[...normalized].map((char) => 127397 + char.charCodeAt(0)));
};
const getClientIp = (sourceIp) => {
  let userIP = sourceIp || '';
  if (userIP.includes(',')) userIP = userIP.split(',')[0].trim();
  if (userIP === '::1' || userIP === '127.0.0.1') userIP = '176.234.224.0';
  return userIP;
};
const isValidObjectId = (id) =>
  Boolean(id) &&
  id !== "null" &&
  id !== "undefined" &&
  mongoose.Types.ObjectId.isValid(id);
const getConnectedSocketsByDbId = (dbId) =>
  connectedUsers.has(String(dbId)) ? [connectedUsers.get(String(dbId))] : [];
const getDbIdBySocketId = (socketId) => socketToDbUser.get(socketId) || null;
const isSocketBusy = (socketId) => activeMatches.has(socketId);
const isSocketReservedForMatch = (socketId) => matchmakingReservations.has(socketId);
const getUserPresenceStatus = (userId) => onlineUsers.get(String(userId))?.status || 'offline';
async function notifyMatchedUsersStatusChange(userId, status) {
  if (!isValidObjectId(userId)) return;

  try {
    const [asUser1, asUser2] = await Promise.all([
      MatchHistory.distinct('user2', { user1: userId }),
      MatchHistory.distinct('user1', { user2: userId })
    ]);

    const matchedUserIds = [...new Set([...asUser1, ...asUser2].map((id) => String(id)))];

    matchedUserIds.forEach((matchedUserId) => {
      const matchedSocketId = connectedUsers.get(matchedUserId);
      if (!matchedSocketId) return;

      io.to(matchedSocketId).emit('user_status_changed', {
        userId: String(userId),
        status
      });
    });
  } catch (err) {
    console.error('❌ Matched user status broadcast error:', err);
  }
}
async function setUserPresenceStatus(userId, status, socketId = null) {
  if (!isValidObjectId(userId)) return;

  const currentEntry = onlineUsers.get(String(userId));
  if (!currentEntry) {
    const resolvedSocketId = socketId || connectedUsers.get(String(userId));
    if (!resolvedSocketId) return;
    onlineUsers.set(String(userId), { socketId: resolvedSocketId, status });
    return notifyMatchedUsersStatusChange(String(userId), status);
  }

  const nextSocketId = socketId || currentEntry.socketId;
  const statusChanged = currentEntry.status !== status;
  onlineUsers.set(String(userId), { socketId: nextSocketId, status });

  if (statusChanged) {
    await notifyMatchedUsersStatusChange(String(userId), status);
  }
}
async function markUsersOnlineAfterCall(...userIds) {
  await Promise.all(
    userIds
      .filter((userId) => isValidObjectId(userId))
      .map((userId) => setUserPresenceStatus(String(userId), 'online'))
  );
}
function emitSearchStarted(socketId) {
  if (!socketId) return;
  io.to(socketId).emit('search_started', {
    status: 'searching',
    queued: false,
    autoResumed: true
  });
}
const clearPendingPrivateCall = (socketId) => {
  const pendingCall = pendingPrivateCalls.get(socketId);
  if (!pendingCall) return null;

  pendingPrivateCalls.delete(socketId);
  if (pendingCall.partnerSocketId) {
    pendingPrivateCalls.delete(pendingCall.partnerSocketId);
  }

  return pendingCall;
};
const createLiveMatchRecord = ({ socketId, partnerSocketId, initiatorCountry, partnerCountry }) => {
  const initiatorDetails = userDetails.get(socketId);
  const partnerDetails = userDetails.get(partnerSocketId);
  const matchId = getMatchId(socketId, partnerSocketId);

  activeMatches.set(socketId, partnerSocketId);
  activeMatches.set(partnerSocketId, socketId);

  if (initiatorDetails) initiatorDetails.status = 'BUSY';
  if (partnerDetails) partnerDetails.status = 'BUSY';

  global.liveMatches.set(matchId, {
    id: matchId,
    user1: {
      id: socketId,
      dbId: initiatorDetails?.dbId || null,
      country: initiatorCountry,
      countryFlag: initiatorDetails?.countryFlag || countryCodeToFlag(initiatorCountry),
      ip: initiatorDetails?.ip || 'N/A'
    },
    user2: {
      id: partnerSocketId,
      dbId: partnerDetails?.dbId || null,
      country: partnerCountry,
      countryFlag: partnerDetails?.countryFlag || countryCodeToFlag(partnerCountry),
      ip: partnerDetails?.ip || 'N/A'
    },
    startTime: new Date(),
    historySaved: false
  });

  return {
    matchId,
    initiatorDetails,
    partnerDetails
  };
};

function sendPushNotification(userId, message) {
  console.log(`📲 Push placeholder -> ${userId}: ${message}`);
}

async function saveMatchHistoryIfEligible(socketId) {
  const partnerId = activeMatches.get(socketId);
  if (!partnerId) {
    console.log(`ℹ️ Match history skipped for [${socketId.slice(0,6)}]: No active partner.`);
    return;
  }

  const matchId = getMatchId(socketId, partnerId);
  const match = global.liveMatches.get(matchId);
  if (!match || !match.startTime) {
    console.log(`ℹ️ Match history skipped for [${socketId.slice(0,6)}]: Live match not found.`);
    return;
  }

  if (match.historySaved) {
    console.log(`ℹ️ Match history skipped for [${socketId.slice(0,6)}]: Already saved.`);
    return;
  }

  const duration = Math.floor((Date.now() - new Date(match.startTime).getTime()) / 1000);
  if (duration <= 5) {
    console.log(`ℹ️ Match history skipped for [${socketId.slice(0,6)}]: Duration too short (${duration}s).`);
    return;
  }

  const myDbId = match.user1?.id === socketId ? match.user1?.dbId : match.user2?.dbId;
  const partnerDbId = match.user1?.id === socketId ? match.user2?.dbId : match.user1?.dbId;

  if (!isValidObjectId(myDbId) || !isValidObjectId(partnerDbId)) {
    console.log(`ℹ️ Match history skipped for [${socketId.slice(0,6)}]: Missing DB ID.`, {
      myDbId,
      partnerDbId,
      matchId
    });
    return;
  }

  if (String(myDbId) === String(partnerDbId)) {
    console.log(`ℹ️ Match history skipped for [${socketId.slice(0,6)}]: Same DB ID on both sides.`);
    return;
  }

  try {
    await MatchHistory.create({
      user1: myDbId,
      user2: partnerDbId,
      duration
    });
    match.historySaved = true;
    console.log(`✅ Match history saved: ${matchId} (${duration}s)`);
  } catch (err) {
    console.error("❌ Match history kaydedilemedi:", err);
  }
}

io.on('connection', async (socket) => {
  let userIP = getClientIp(socket.handshake.headers['x-forwarded-for'] || socket.handshake.address);
  
  const activeBan = await Ban.findOne({ 
    ip: userIP, 
    expireAt: { $gt: new Date() } 
  });

  if (activeBan) {
      console.log(`🚫 Yasaklı Kullanıcı Engellendi: ${userIP} (Bitiş: ${activeBan.expireAt})`);
      socket.emit('connection_refused', { 
        reason: activeBan.reason, 
        expireAt: activeBan.expireAt 
      });
      return socket.disconnect();
  }

  const geo = geoip.lookup(userIP);
  const countryCode = normalizeCountry(geo ? geo.country : 'UN');
  const countryFlag = countryCodeToFlag(countryCode);

  console.log(`👤 Yeni Bağlantı: ${socket.id.slice(0,6)}... (IP: ${userIP}, Ülke: ${countryCode})`);

  const dbUserId = socket.data.auth?.userId;
  let currentLikes = 0; let isRegistered = false;
  let connectedUserName = 'Someone you follow';

  const dbUser = socket.data.user;
  if (dbUser && mongoose.Types.ObjectId.isValid(dbUserId)) {
    dbUser.country = countryCode;
    dbUser.countryFlag = countryFlag;
    dbUser.lastSeen = new Date();
    await dbUser.save();
    currentLikes = dbUser.likes;
    isRegistered = true;
    connectedUserName = dbUser.name || connectedUserName;
    socket.emit('update_my_likes', { likes: dbUser.likes });
  }

  userDetails.set(socket.id, {
    id: socket.id,
    dbId: dbUserId || null,
    ip: userIP,
    country: countryCode,
    countryFlag,
    status: 'IDLE',
    likes: currentLikes,
    isRegistered,
    myGender: 'male'
  });

  if (isValidObjectId(dbUserId)) {
    connectedUsers.set(String(dbUserId), socket.id);
    socketToDbUser.set(socket.id, String(dbUserId));
    setUserPresenceStatus(String(dbUserId), 'online', socket.id);
  }

  socket.on('get_user_status', async (requestedUserIds = [], callback) => {
    try {
      const validatedUserIds = getUserStatusSchema.parse(requestedUserIds);
      const statuses = validatedUserIds
        .map((requestedUserId) => String(requestedUserId))
        .map((requestedUserId) => ({
          userId: requestedUserId,
          status: getUserPresenceStatus(requestedUserId)
        }));

      if (typeof callback === 'function') {
        return callback(statuses);
      }

      socket.emit('user_status_response', statuses);
    } catch (err) {
      console.error('❌ get_user_status error:', err);

      if (typeof callback === 'function') {
        return callback([]);
      }

      socket.emit('user_status_response', []);
    }
  });

  if (isValidObjectId(dbUserId)) {
    try {
      const followerLinks = await Follow.find({ following: dbUserId }).select('follower');

      for (const link of followerLinks) {
        const followerId = String(link.follower);
        const followerSocketIds = getConnectedSocketsByDbId(followerId);

        if (followerSocketIds.length === 0) {
          sendPushNotification(followerId, `${connectedUserName} is active now.`);
          continue;
        }

        followerSocketIds.forEach((followerSocketId) => {
          io.to(followerSocketId).emit('partner_online', {
            userId: dbUserId,
            name: connectedUserName
          });
        });
      }
    } catch (err) {
      console.error('❌ Follower online notification hatası:', err);
    }
  }

  // --- WEBRTC SIGNALING FORWARDERS ---
  function getVerifiedPartnerId(socket, to) {
    const partnerId = to || activeMatches.get(socket.id);
    if (!partnerId) return null;
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

  socket.on('private_call_request', async (payload = {}) => {
    if (!consumeSocketEvent(socket, 'private_call_request', { limit: 5, windowMs: 60_000 })) {
      return socket.emit('error_message', { type: 'RATE_LIMIT', message: 'Çok fazla özel arama isteği gönderildi.' });
    }
    const me = userDetails.get(socket.id);
    const { callerId, targetUserId, targetId } = payload;
    const normalizedCallerId = callerId ? String(callerId) : null;
    const normalizedTargetUserId = targetUserId ? String(targetUserId) : (targetId ? String(targetId) : null);
    const finalCallerId = normalizedCallerId || getDbIdBySocketId(socket.id);

    console.log("Private Call Request from:", finalCallerId, "to:", normalizedTargetUserId);
    console.log("Active Sockets (userDetails keys):", Array.from(userDetails.keys()));
    console.log("Connected Users (dbId -> socketId):", Array.from(connectedUsers.entries()));

    if (!me) {
      console.log("private_call_request -> target_unavailable: Caller socket not found in userDetails");
      return socket.emit('target_unavailable');
    }

    if (!isValidObjectId(finalCallerId) || !isValidObjectId(normalizedTargetUserId)) {
      console.log("private_call_request -> target_unavailable: Invalid callerId or targetUserId", {
        callerId: finalCallerId,
        targetUserId: normalizedTargetUserId
      });
      return socket.emit('target_unavailable');
    }

    if (me.dbId && String(me.dbId) !== finalCallerId) {
      console.log("private_call_request -> target_unavailable: callerId does not match socket dbId", {
        socketDbId: me.dbId,
        callerId: finalCallerId
      });
      return socket.emit('target_unavailable');
    }

    if (pendingPrivateCalls.has(socket.id)) {
      console.log("private_call_request -> target_unavailable: Caller already has a pending private call");
      return socket.emit('target_unavailable');
    }

    const targetSocketId = connectedUsers.get(normalizedTargetUserId) || userDetails.get(normalizedTargetUserId);
    console.log("private_call_request -> target socket lookup:", {
      targetUserId: normalizedTargetUserId,
      targetSocketId
    });

    if (!targetSocketId) {
      console.log("private_call_request -> target_unavailable: Target socket not found for dbId", normalizedTargetUserId);
      return socket.emit('target_unavailable');
    }

    if (pendingPrivateCalls.has(targetSocketId)) {
      console.log("private_call_request -> target_unavailable: Target already has a pending private call", {
        targetSocketId
      });
      return socket.emit('target_unavailable');
    }

    const targetDetails = userDetails.get(targetSocketId);
    if (!targetDetails) {
      console.log("private_call_request -> target_unavailable: Target socket details missing", {
        targetSocketId
      });
      return socket.emit('target_unavailable');
    }

    if (isSocketBusy(targetSocketId) || String(targetDetails.status).toUpperCase() === 'BUSY') {
      console.log("private_call_request -> target_is_busy: Target already in a live match or marked busy", {
        targetSocketId,
        targetStatus: targetDetails.status
      });
      return socket.emit('target_is_busy');
    }

    if (!isValidObjectId(targetDetails.dbId)) {
      console.log("private_call_request -> target_unavailable: Target dbId invalid", {
        targetSocketId,
        targetDbId: targetDetails.dbId
      });
      return socket.emit('target_unavailable');
    }

    try {
      const callerUser = await User.findById(finalCallerId);
      if (!callerUser) {
        console.log("private_call_request -> target_unavailable: Caller user not found in DB", {
          callerId: finalCallerId
        });
        return socket.emit('target_unavailable');
      }

      if (!callerUser || (callerUser.gems || 0) < 50) {
        console.log("private_call_request -> insufficient_gems", {
          callerId: finalCallerId,
          gems: callerUser ? callerUser.gems : null
        });
        return socket.emit('insufficient_gems', {
          message: 'Private call için 50 Gem gerekli.'
        });
      }

      pendingPrivateCalls.set(socket.id, {
        type: 'outgoing',
        partnerSocketId: targetSocketId,
        callerDbId: finalCallerId,
        targetDbId: normalizedTargetUserId
      });

      pendingPrivateCalls.set(targetSocketId, {
        type: 'incoming',
        partnerSocketId: socket.id,
        callerDbId: finalCallerId,
        targetDbId: normalizedTargetUserId
      });

      console.log("private_call_request -> incoming_private_call emitted", {
        callerSocketId: socket.id,
        targetSocketId,
        callerId: finalCallerId,
        targetUserId: normalizedTargetUserId
      });

      io.to(targetSocketId).emit('incoming_private_call', {
        callerName: callerUser.name || 'Stranger',
        callerAvatar: callerUser.avatar || null,
        callerId: finalCallerId
      });
    } catch (err) {
      console.error('❌ Private call request hatası:', err);
      socket.emit('target_unavailable');
    }
  });

  socket.on('private_call_accepted', async ({ callerId }) => {
    const pendingCall = pendingPrivateCalls.get(socket.id);
    if (!pendingCall || pendingCall.type !== 'incoming') return;
    if (callerId && String(pendingCall.callerDbId) !== String(callerId)) return;

    const callerSocketId = pendingCall.partnerSocketId;
    const callerDetails = userDetails.get(callerSocketId);
    const targetDetails = userDetails.get(socket.id);

    if (!callerDetails || !targetDetails || isSocketBusy(callerSocketId) || isSocketBusy(socket.id)) {
      clearPendingPrivateCall(socket.id);
      return io.to(callerSocketId).emit('target_unavailable');
    }

    try {
      let callerUser = isValidObjectId(callerDetails.dbId) ? await User.findById(callerDetails.dbId) : null;
      if (!callerUser || (callerUser.gems || 0) < 50) {
        console.log("private_call_accepted -> insufficient_gems", {
          callerDbId: callerDetails.dbId,
          gems: callerUser ? callerUser.gems : null
        });
        clearPendingPrivateCall(socket.id);
        io.to(callerSocketId).emit('insufficient_gems', {
          message: 'Private call için 50 Gem gerekli.'
        });
        return socket.emit('call_rejected');
      }

      callerUser.gems -= 50;
      await callerUser.save();
      if (callerDetails) {
        callerDetails.gems = callerUser.gems;
      }
      io.to(callerSocketId).emit('gems_updated', { gems: callerUser.gems });

      clearPendingPrivateCall(socket.id);

      globalQueue = globalQueue.filter((item) => item.id !== callerSocketId && item.id !== socket.id);

      const {
        matchId,
        initiatorDetails: callerMatchDetails,
        partnerDetails: targetMatchDetails
      } = createLiveMatchRecord({
        socketId: callerSocketId,
        partnerSocketId: socket.id,
        initiatorCountry: normalizeCountry(callerDetails.country || 'UN'),
        partnerCountry: normalizeCountry(targetDetails.country || 'UN')
      });

      await Promise.all([
        setUserPresenceStatus(String(callerDetails.dbId), 'busy', callerSocketId),
        setUserPresenceStatus(String(targetDetails.dbId), 'busy', socket.id)
      ]);

      console.log(`📞 Private call accepted: ${matchId}`);

      let targetUser = isValidObjectId(targetDetails.dbId) ? await User.findById(targetDetails.dbId) : null;

      io.to(callerSocketId).emit('partner_found', {
        partnerId: socket.id,
        initiator: true,
        country: normalizeCountry(targetDetails.country || 'UN'),
        partnerGender: targetDetails.myGender || 'male',
        partnerLikes: targetMatchDetails ? targetMatchDetails.likes : 0,
        partnerName: targetUser ? targetUser.name : 'Stranger',
        partnerAvatar: targetUser ? targetUser.avatar : null,
        myNewGems: callerUser ? callerUser.gems : 0,
        privateCall: true
      });

      io.to(socket.id).emit('partner_found', {
        partnerId: callerSocketId,
        initiator: false,
        country: normalizeCountry(callerDetails.country || 'UN'),
        partnerGender: callerDetails.myGender || 'male',
        partnerLikes: callerMatchDetails ? callerMatchDetails.likes : 0,
        partnerName: callerUser ? callerUser.name : 'Stranger',
        partnerAvatar: callerUser ? callerUser.avatar : null,
        myNewGems: targetUser ? targetUser.gems : 0,
        privateCall: true
      });
    } catch (err) {
      console.error('❌ Private call acceptance hatası:', err);
      clearPendingPrivateCall(socket.id);
      io.to(callerSocketId).emit('target_unavailable');
    }
  });

  socket.on('private_call_rejected', ({ callerId }) => {
    const pendingCall = pendingPrivateCalls.get(socket.id);
    if (!pendingCall || pendingCall.type !== 'incoming') return;
    if (callerId && String(pendingCall.callerDbId) !== String(callerId)) return;

    const callerSocketId = pendingCall.partnerSocketId;
    clearPendingPrivateCall(socket.id);
    io.to(callerSocketId).emit('call_rejected');
  });

  socket.on('cancel_private_call', (payload = {}) => {
    const { targetId, targetUserId, callerId } = payload;
    const finalTargetId = targetId ? String(targetId) : (targetUserId ? String(targetUserId) : null);
    const finalCallerId = callerId ? String(callerId) : getDbIdBySocketId(socket.id);

    console.log(`[Private Call] Cancelled by ${finalCallerId} for ${finalTargetId}`);

    const targetSocketId =
      (finalTargetId ? connectedUsers.get(String(finalTargetId)) : null) ||
      (finalTargetId ? getConnectedSocketsByDbId(String(finalTargetId))[0] : null);

    if (!targetSocketId) {
      return;
    }

    clearPendingPrivateCall(socket.id);

    io.to(targetSocketId).emit('private_call_cancelled', {
      callerId: finalCallerId
    });
  });

  socket.on('call_ended', async () => {
    const myDbId = getDbIdBySocketId(socket.id) || userDetails.get(socket.id)?.dbId;
    const partnerSocketId = activeMatches.get(socket.id);
    const partnerDbId = partnerSocketId
      ? getDbIdBySocketId(partnerSocketId) || userDetails.get(partnerSocketId)?.dbId
      : null;

    await markUsersOnlineAfterCall(myDbId, partnerDbId);
  });

  // --- EŞLEŞME (MATCH) MANTIĞI DÜZELTİLDİ ---
  socket.on('find_partner', async (payload = {}, callback) => {
      const { myGender, searchGender, selectedCountry } = payload;
      const respond = (response) => {
        if (typeof callback === 'function') {
          try {
            callback(response);
          } catch (err) {
            console.error('❌ find_partner callback error:', err);
          }
        }
      };

      if (!consumeSocketEvent(socket, 'find_partner', { limit: 12, windowMs: 60_000 })) {
        respond({ ok: false, code: 'RATE_LIMIT', message: 'Çok sık eşleşme aranıyor.' });
        return socket.emit('error_message', { type: 'RATE_LIMIT', message: 'Çok sık eşleşme aranıyor.' });
      }
      
      const normalizedSelectedCountry = normalizeCountry(selectedCountry || 'all');
      const normalizedSearchGender = String(searchGender || 'all');
      
      const u = userDetails.get(socket.id);
      if (!u) {
        respond({ ok: false, code: 'USER_NOT_FOUND', message: 'Kullanıcı bağlantısı bulunamadı.' });
        return;
      }

      // GEÇERLİ ID KONTROL FONKSİYONU
      const isValidId = isValidObjectId;
      
      const myCountryCode = normalizeCountry(u.country ? u.country : 'UN');

      // --- 1. ADIM: SADECE ÖN KONTROL (Tahsilat Yapma) ---
      let totalCost = 0;
      if (normalizedSearchGender === 'female') totalCost += 8;
      if (normalizedSelectedCountry !== 'all') totalCost += 4;

      if (totalCost > 0) {
          if (!isValidId(u.dbId)) {
              respond({ ok: false, code: 'AUTH_REQUIRED', message: 'Filtre kullanmak için giriş yapmalısın!' });
              return socket.emit('error_message', { 
                  type: 'AUTH_REQUIRED', 
                  message: 'Filtre kullanmak için giriş yapmalısın!' 
              });
          }

          try {
              const dbUser = await User.findById(u.dbId);
              if (!dbUser || dbUser.gems < totalCost) {
                  respond({ ok: false, code: 'INSUFFICIENT_GEMS', message: `Yetersiz bakiye! Bu eşleşme için ${totalCost} Gem gerekiyor.` });
                  return socket.emit('error_message', { 
                      type: 'INSUFFICIENT_GEMS', 
                      message: `Yetersiz bakiye! Bu eşleşme için ${totalCost} Gem gerekiyor.` 
                  });
              }
          } catch (err) {
              console.error("❌ Bakiye kontrol hatası:", err);
              respond({ ok: false, code: 'BALANCE_CHECK_FAILED', message: 'Bakiye kontrolü yapılamadı.' });
              return;
          }
      }

      console.log(`🔍 [${socket.id.slice(0,6)}] Eşleşme arıyor... (Kendi: ${myGender} | Filtre: ${normalizedSearchGender} - ${normalizedSelectedCountry})`);
      console.log(`🧾 [${socket.id.slice(0,6)}] Queue before match attempt:`, globalQueue.map((item) => ({
        id: item.id,
        myGender: item.myGender,
        searchGender: item.searchGender,
        countryCode: item.countryCode,
        selectedCountry: item.selectedCountry,
        dbId: item.dbId || null
      })));
      
      const existingPartner = activeMatches.get(socket.id);
      if (existingPartner) {
          io.to(existingPartner).emit('partner_left_auto_next');
          activeMatches.delete(socket.id);
          activeMatches.delete(existingPartner);
          if (global.liveMatches) global.liveMatches.delete(getMatchId(socket.id, existingPartner));
          const displacedDetails = userDetails.get(existingPartner);
          if (displacedDetails) displacedDetails.status = 'SEARCHING';
          emitSearchStarted(existingPartner);
      }

      if (isSocketReservedForMatch(socket.id)) {
        respond({ ok: false, code: 'MATCH_IN_PROGRESS', message: 'Eşleşme zaten işleniyor.' });
        return;
      }

      globalQueue = globalQueue.filter(item => item.id !== socket.id);
      u.status = 'SEARCHING'; 
      u.myGender = myGender;
      u.searchGender = normalizedSearchGender;
      u.selectedCountry = normalizedSelectedCountry;

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
        if (myHasAnyFilter) return pHasAnyFilter ? 0 : 1;
        if (!pHasAnyFilter && sameCountry) return 0;
        if (!pHasAnyFilter) return 1;
        return 2;
      };

      const tryMatch = async () => {
        let bestIndex = -1;
        let bestPriority = Number.POSITIVE_INFINITY;

        globalQueue.forEach((p, idx) => {
          if (p.id === socket.id) return;
          if (isSocketBusy(p.id) || isSocketReservedForMatch(p.id)) {
            console.log(`🚫 [${socket.id.slice(0,6)}] Candidate skipped because busy/reserved`, {
              candidateSocketId: p.id,
              busy: isSocketBusy(p.id),
              reserved: isSocketReservedForMatch(p.id)
            });
            return;
          }

          const pSearchGender = String(p.searchGender || 'all');
          const pSelectedCountry = normalizeCountry(p.selectedCountry || 'all');
          const pCountryCode = normalizeCountry(p.countryCode || 'UN');

          const genderMatch =
            (normalizedSearchGender === 'all' || normalizedSearchGender === p.myGender) &&
            (pSearchGender === 'all' || pSearchGender === myGender);

          const countryMatch =
            (normalizedSelectedCountry === 'all' || normalizedSelectedCountry === pCountryCode) &&
            (pSelectedCountry === 'all' || pSelectedCountry === myCountryCode);

          if (!genderMatch || !countryMatch) {
            console.log(`🚫 [${socket.id.slice(0,6)}] Candidate rejected`, {
              candidateSocketId: p.id,
              candidateDbId: p.dbId || null,
              myGender,
              mySearchGender: normalizedSearchGender,
              myCountryCode,
              mySelectedCountry: normalizedSelectedCountry,
              candidateGender: p.myGender,
              candidateSearchGender: pSearchGender,
              candidateCountryCode: pCountryCode,
              candidateSelectedCountry: pSelectedCountry,
              genderMatch,
              countryMatch
            });
            return;
          }

          const priority = getCandidatePriority(p);
          console.log(`✅ [${socket.id.slice(0,6)}] Candidate accepted`, {
            candidateSocketId: p.id,
            candidateDbId: p.dbId || null,
            priority
          });
          if (priority < bestPriority) {
            bestPriority = priority;
            bestIndex = idx;
          }
        });

        if (bestIndex !== -1) {
          const partner = globalQueue[bestIndex];
          globalQueue.splice(bestIndex, 1);
          matchmakingReservations.add(socket.id);
          matchmakingReservations.add(partner.id);
          
          // --- YARDIMCI FONKSİYON: Kullanıcıdan Gem Tahsil Et ---
          const chargeGems = async (userId, cost, userSocketId) => {
              if (cost > 0 && isValidId(userId)) {
                  try {
                      const dbUser = await User.findById(userId);
                      if (dbUser && dbUser.gems >= cost) {
                          dbUser.gems -= cost;
                          await dbUser.save();
                          io.to(userSocketId).emit('update_my_likes', { gems: dbUser.gems });
                          console.log(`💎 [${userSocketId.slice(0,6)}] ${cost} Gem tahsil edildi. Kalan: ${dbUser.gems}`);
                      }
                  } catch (err) {
                      console.error("❌ Tahsilat hatası:", err);
                  }
              }
          };

          // --- 2. ADIM: GERÇEK TAHSİLAT NOKTASI (Eşleşme Kesinleşti) ---
          // Arayan ve bulunan kişiden (eğer filtreleri varsa) tahsilat yap
          await chargeGems(u.dbId, totalCost, socket.id);
          await chargeGems(partner.dbId, partner.totalCost || 0, partner.id);

          try {
            const {
              matchId,
              initiatorDetails: myDetails,
              partnerDetails: pDetails
            } = createLiveMatchRecord({
              socketId: socket.id,
              partnerSocketId: partner.id,
              initiatorCountry: myCountryCode,
              partnerCountry: partner.countryCode
            });

            await Promise.all([
              setUserPresenceStatus(String(myDetails?.dbId || u.dbId), 'busy', socket.id),
              setUserPresenceStatus(String(pDetails?.dbId || partner.dbId), 'busy', partner.id)
            ]);

            console.log(`🎯 Live match created: ${matchId}`, {
              user1DbId: myDetails?.dbId || u.dbId || null,
              user2DbId: pDetails?.dbId || partner.dbId || null
            });

            let myDbUser = isValidId(u.dbId) ? await User.findById(u.dbId) : null;
            let pDbUser = isValidId(partner.dbId) ? await User.findById(partner.dbId) : null;

            io.to(socket.id).emit('partner_found', { 
                partnerId: partner.id, 
                initiator: true, 
                country: partner.countryCode, 
                partnerGender: partner.myGender, 
                partnerLikes: pDetails ? pDetails.likes : 0,
                partnerName: pDbUser ? pDbUser.name : "Stranger",
                partnerAvatar: pDbUser ? pDbUser.avatar : null,
                myNewGems: myDbUser ? myDbUser.gems : 0
            });

            io.to(partner.id).emit('partner_found', { 
                partnerId: socket.id, 
                initiator: false, 
                country: myCountryCode, 
                partnerGender: myGender, 
                partnerLikes: myDetails ? myDetails.likes : 0,
                partnerName: myDbUser ? myDbUser.name : "Stranger",
                partnerAvatar: myDbUser ? myDbUser.avatar : null,
                myNewGems: pDbUser ? pDbUser.gems : 0 
            });

            respond({ ok: true, status: 'matched' });

            return true;
          } finally {
            matchmakingReservations.delete(socket.id);
            matchmakingReservations.delete(partner.id);
          }
        }
        return false;
      };

      if (!(await tryMatch())) {
        // Kuyruğa eklerken kimin ne kadar borcu olduğunu kaydet
        globalQueue.push({ 
          id: socket.id, 
          myGender, 
          searchGender: normalizedSearchGender, 
          countryCode: myCountryCode, 
          selectedCountry: normalizedSelectedCountry,
          dbId: u.dbId,       
          totalCost: totalCost 
        });
        console.log(`⏳ [${socket.id.slice(0,6)}] Kuyruğa eklendi. (Gems henüz düşülmedi)`);
        console.log(`📦 Queue after enqueue:`, globalQueue.map((item) => ({
          id: item.id,
          myGender: item.myGender,
          searchGender: item.searchGender,
          countryCode: item.countryCode,
          selectedCountry: item.selectedCountry,
          dbId: item.dbId || null
        })));
        socket.emit('search_started', {
          status: 'searching',
          queued: true
        });
        respond({ ok: true, status: 'searching', queued: true });
      }
  });

  socket.on('next_user', async () => {
    const partnerId = activeMatches.get(socket.id);
    const matchId = getMatchId(socket.id, partnerId);
    const match = global.liveMatches.get(matchId);

    if (match && partnerId) {
      const duration = (new Date() - match.startTime) / 1000;
      const myDetails = userDetails.get(socket.id);
      const pDetails = userDetails.get(partnerId);

      if (duration > 120) {
        if (myDetails?.dbId) updateTrustScore(myDetails.dbId, 5);
        if (pDetails?.dbId) updateTrustScore(pDetails.dbId, 5);
      }

      await saveMatchHistoryIfEligible(socket.id);
      await markUsersOnlineAfterCall(myDetails?.dbId, pDetails?.dbId);

      console.log(`⏭️ [${socket.id.slice(0,6)}] NEXT dedi.`);
      io.to(partnerId).emit('partner_left_auto_next');
      activeMatches.delete(socket.id);
      activeMatches.delete(partnerId);
      global.liveMatches.delete(matchId);
      
      const p = userDetails.get(partnerId);
      if (p) p.status = 'SEARCHING';
      emitSearchStarted(partnerId);
    }
  });

  socket.on('stop_search', async () => {
    console.log(`⏹️ [${socket.id.slice(0,6)}] Aramayı tamamen durdurdu.`);
    matchmakingReservations.delete(socket.id);
    globalQueue = globalQueue.filter(u => u.id !== socket.id);
    const u = userDetails.get(socket.id);
    if (u) u.status = 'IDLE';
    const partnerId = activeMatches.get(socket.id);
    if (partnerId) {
        const partnerDetails = userDetails.get(partnerId);
        await saveMatchHistoryIfEligible(socket.id);
        await markUsersOnlineAfterCall(u?.dbId, partnerDetails?.dbId);
        io.to(partnerId).emit('partner_left_auto_next');
        activeMatches.delete(socket.id);
        activeMatches.delete(partnerId);
        if (global.liveMatches) global.liveMatches.delete(getMatchId(socket.id, partnerId));
        emitSearchStarted(partnerId);
    }
  });

  socket.on('signal', (data) => {
    io.to(data.to).emit('signal', { from: socket.id, signal: data.signal });
  });

  socket.on('chat_message', async (data) => {
    if (!consumeSocketEvent(socket, 'chat_message', { limit: 30, windowMs: 60_000 })) {
        return socket.emit('error_message', { type: 'RATE_LIMIT', message: 'Çok fazla mesaj gönderildi.' });
    }
    const { to, text } = data;
    const partnerId = getVerifiedPartnerId(socket, to);
    const sanitizedText = typeof text === 'string' ? text.trim().slice(0, 500) : '';
    
    if (!partnerId || !sanitizedText) {
        console.log(`⚠️ Mesaj reddedildi: [${socket.id}] -> [${to || 'Bilinmiyor'}]`);
        return;
    }

    try {
        const newMessage = new Message({
            senderId: socket.id,
            receiverId: partnerId,
            text: sanitizedText,
            timestamp: new Date()
        });
        await newMessage.save();

        console.log(`💬 Mesaj iletiliyor: [${socket.id}] -> [${partnerId}]`);
        io.to(partnerId).emit('chat_message', { 
            senderId: socket.id, 
            text: sanitizedText, 
            timestamp: newMessage.timestamp 
        });
    } catch (err) {
        console.error("❌ Mesaj kaydedilirken hata oluştu:", err);
    }
  });

  socket.on('disconnect', async () => {
    console.log(`❌ Bağlantı Koptu: [${socket.id.slice(0,6)}]`);
    matchmakingReservations.delete(socket.id);
    const pendingCall = clearPendingPrivateCall(socket.id);
    if (pendingCall?.partnerSocketId) {
      io.to(pendingCall.partnerSocketId).emit('target_unavailable');
    }
    const disconnectedDbId = getDbIdBySocketId(socket.id);
    const partnerId = activeMatches.get(socket.id);
    const partnerDbId = partnerId
      ? getDbIdBySocketId(partnerId) || userDetails.get(partnerId)?.dbId
      : null;
    await markUsersOnlineAfterCall(partnerDbId);
    if (disconnectedDbId && connectedUsers.get(disconnectedDbId) === socket.id) {
      connectedUsers.delete(disconnectedDbId);
    }
    if (disconnectedDbId && onlineUsers.get(disconnectedDbId)?.socketId === socket.id) {
      onlineUsers.delete(disconnectedDbId);
      notifyMatchedUsersStatusChange(disconnectedDbId, 'offline');
    }
    socketToDbUser.delete(socket.id);
    await saveMatchHistoryIfEligible(socket.id);
    if (partnerId) {
      const pd = userDetails.get(partnerId);
      if (pd) pd.status = 'SEARCHING';
      io.to(partnerId).emit('partner_left_auto_next');
      activeMatches.delete(partnerId);
      if (global.liveMatches) global.liveMatches.delete(getMatchId(socket.id, partnerId));
      emitSearchStarted(partnerId);
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
        isForMe: true 
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

// --- YENİ EKLENEN: GÜNLÜK ÖDÜL VE MAĞAZA API'LERİ ---
const isSameDay = (d1, d2) => {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};

const isYesterday = (d1, d2) => {
  const yesterday = new Date(d1);
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(yesterday, d2);
};

app.post('/api/store/status', requireAuth, userActionRateLimit, async (req, res) => {
  const dbUserId = req.auth.userId;
  if (!dbUserId || !mongoose.Types.ObjectId.isValid(dbUserId)) return res.status(400).json({error: "Geçersiz ID"});
  
  try {
    const user = await User.findById(dbUserId);
    if (!user) return res.status(404).json({error: "Kullanıcı bulunamadı"});

    const now = new Date();
    let streak = user.dailyStreak || 0;
    let canClaim = false;

    if (user.lastClaimedDate) {
       if (isSameDay(now, user.lastClaimedDate)) {
           canClaim = false; // Bugün zaten almış
       } else if (isYesterday(now, user.lastClaimedDate)) {
           canClaim = true; // Dün almış, bugün alabilir (seri devam ediyor)
       } else {
           canClaim = true; // Çok önceden almış, seri sıfırlandı
           streak = 0; 
       }
    } else {
        canClaim = true; // Daha önce hiç almamış
        streak = 0;
    }

    // Kullanıcının login gününü güncelle (opsiyonel)
    user.lastLoginDate = now;
    await user.save();

    res.json({
        gems: user.gems || 0,
        dailyStreak: streak,
        canClaim: canClaim
    });

  } catch (err) {
    res.status(500).json({error: "Sunucu hatası"});
  }
});

app.post('/api/store/claim', requireAuth, userActionRateLimit, async (req, res) => {
  const dbUserId = req.auth.userId;
  if (!dbUserId || !mongoose.Types.ObjectId.isValid(dbUserId)) return res.status(400).json({error: "Geçersiz ID"});

  try {
    const user = await User.findById(dbUserId);
    if (!user) return res.status(404).json({error: "Kullanıcı bulunamadı"});

    const now = new Date();
    const rewards = [5, 10, 15, 20, 25, 30, 50]; // 1. günden 7. güne verilecek taşlar

    if (user.lastClaimedDate && isSameDay(now, user.lastClaimedDate)) {
        return res.status(400).json({error: "Bugünkü ödülünü zaten aldın."});
    }

    if (user.lastClaimedDate && isYesterday(now, user.lastClaimedDate)) {
        user.dailyStreak += 1;
        if (user.dailyStreak > 7) user.dailyStreak = 1; // 7 Günü doldurursa başa sarar
    } else {
        user.dailyStreak = 1; // Dün almadıysa seri bozulmuştur
    }

    const rewardAmount = rewards[user.dailyStreak - 1] || 5;
    user.gems = (user.gems || 0) + rewardAmount;
    user.lastClaimedDate = now;

    await user.save();

    res.json({
        success: true,
        gems: user.gems,
        dailyStreak: user.dailyStreak,
        rewardAmount: rewardAmount
    });

  } catch (err) {
    res.status(500).json({error: "Sunucu hatası"});
  }
});


// 1. Ürün ve Taş miktarlarını tanımla
const GEM_PACKAGES = {
  "com.omegpt.gem120": 120,
  "com.omegpt.gem400": 400,
  "com.omegpt.gem820": 820,
  "com.omegpt.gem1700": 1700,
  "com.omegpt.gem4500": 4500,
  "com.omegpt.gem10000": 10000
};

// 2. Satın Alma Doğrulama API'sı
app.post('/api/store/verify-purchase', requireAuth, userActionRateLimit, async (req, res) => {
  const { productId, transactionId, receiptData, platform } = req.body;
  const dbUserId = req.auth.userId;

  console.log(`🛒 Satın Alma Talebi: User:${dbUserId}, Product:${productId}, Tx:${transactionId}, Platform:${platform}`);

  try {
    const gemAmount = GEM_PACKAGES[productId];
    if (!gemAmount) {
      return res.status(400).json({ error: "Geçersiz Product ID!" });
    }

    if (!transactionId || typeof transactionId !== 'string' || !receiptData || typeof receiptData !== 'string' || !platform) {
      return res.status(400).json({ error: "Geçersiz işlem bilgisi." });
    }

    const alreadyProcessed = await Purchase.findOne({ transactionId });
    if (alreadyProcessed) {
      return res.status(409).json({ error: 'Bu satın alma daha önce işlendi.' });
    }

    const verification = await verifyPurchaseWithStore({
      platform,
      productId,
      transactionId,
      receiptData,
    });

    if (!verification.isValid) {
      return res.status(400).json({
        error: 'Satın alma doğrulanamadı.',
        reason: verification.reason || 'UNKNOWN_PURCHASE_VERIFICATION_ERROR',
      });
    }

    const user = await User.findById(dbUserId);
    if (!user) {
      return res.status(404).json({ error: "Kullanıcı veritabanında bulunamadı." });
    }

    user.gems = (user.gems || 0) + gemAmount;
    await user.save();
    await Purchase.create({
      userId: user._id,
      platform,
      productId,
      transactionId,
      creditedAmount: gemAmount,
      rawPayload: verification.rawPayload || { platform, productId, transactionId },
    });

    console.log(`✅ Başarılı: ${user.name} kullanıcısına ${gemAmount} taş eklendi.`);

    res.json({ 
      success: true, 
      newBalance: user.gems,
      message: `${gemAmount} taş hesabınıza tanımlandı.`
    });

  } catch (err) {
    console.error("Store Hatası:", err);
    res.status(500).json({ error: "İşlem sırasında sunucu hatası oluştu." });
  }
});


// --------------------------------------------------

// --- ADMIN API ---
app.get('/api/admin/active-users', requireAuth, requireAdmin, adminRateLimit, (req, res) => res.json(Array.from(userDetails.values())));
app.get('/api/reports', requireAuth, requireAdmin, adminRateLimit, async (req, res) => res.json(await Report.find().sort({ date: -1 }).limit(50)));
app.delete('/api/reports/:id', requireAuth, requireAdmin, adminRateLimit, async (req, res) => { await Report.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.get('/api/bans', requireAuth, requireAdmin, adminRateLimit, async (req, res) => {
  const activeBans = await Ban.find({ expireAt: { $gt: new Date() } });
  res.json(activeBans);
});

app.delete('/api/bans/:ip', requireAuth, requireAdmin, adminRateLimit, async (req, res) => { await Ban.findOneAndDelete({ ip: req.params.ip }); res.json({ success: true }); });
app.get('/api/admin/stats', requireAuth, requireAdmin, adminRateLimit, async (req, res) => {
  const totalActiveBans = await Ban.countDocuments({ expireAt: { $gt: new Date() } });
  res.json({ activeUsers: userDetails.size, totalBans: totalActiveBans, pendingReports: await Report.countDocuments(), totalMatchesToday: 0 });
});
app.get('/api/admin/active-matches', requireAuth, requireAdmin, adminRateLimit, (req, res) => res.json(global.liveMatches ? Array.from(global.liveMatches.values()) : []));

app.post('/api/users/follow', requireAuth, userActionRateLimit, async (req, res) => {
  console.log('FOLLOW req.body:', req.body);

  try {
    const parsed = followSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Geçersiz takip isteği' });
    }

    const { followingId } = parsed.data;
    const userId = req.auth.userId;
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(followingId)
    ) {
      return res.status(400).json({ error: "Geçersiz kullanıcı ID formatı" });
    }

    const followerObjectId = new mongoose.Types.ObjectId(userId);
    const followingObjectId = new mongoose.Types.ObjectId(followingId);

    if (String(followerObjectId) === String(followingObjectId)) {
      return res.status(400).json({ error: 'Kullanıcı kendini takip edemez' });
    }

    const existingFollow = await Follow.findOne({
      follower: followerObjectId,
      following: followingObjectId
    });

    if (existingFollow) {
      await Follow.deleteOne({ _id: existingFollow._id });
      await Promise.all([
        User.findByIdAndUpdate(followerObjectId, { $inc: { followingCount: -1 } }),
        User.findByIdAndUpdate(followingObjectId, { $inc: { followersCount: -1 } })
      ]);
      return res.json({ message: "Unfollowed", isFollowing: false });
    }

    await Follow.create({
      follower: followerObjectId,
      following: followingObjectId
    });

    await Promise.all([
      User.findByIdAndUpdate(followerObjectId, { $inc: { followingCount: 1 } }),
      User.findByIdAndUpdate(followingObjectId, { $inc: { followersCount: 1 } })
    ]);

    return res.json({ message: "Followed", isFollowing: true });
  } catch (err) {
    console.error('❌ Follow toggle hatası:', err);
    return res.status(500).json({ error: 'Takip durumu güncellenemedi' });
  }
});

app.post('/api/users/update-profile', requireAuth, userActionRateLimit, async (req, res) => {
  const resolvedId = req.auth.userId;

  try {
    const parsedResult = updateProfileSchema.safeParse(req.body);
    if (!parsedResult.success) {
      return res.status(400).json({ error: 'Geçersiz profil verisi' });
    }

    const parsed = parsedResult.data;
    const updateData = {};

    if (typeof parsed.name === 'string' && parsed.name.trim()) {
      updateData.name = parsed.name.trim().slice(0, 40);
    }
    if (typeof parsed.bio === 'string') {
      updateData.bio = parsed.bio.slice(0, 150);
    }
    if (Array.isArray(parsed.interests)) {
      updateData.interests = parsed.interests;
    }
    if (Array.isArray(parsed.photos)) {
      updateData.photos = parsed.photos;
    }
    if (typeof parsed.avatarBase64 === 'string' && parsed.avatarBase64.length > 0) {
      updateData.avatar = parsed.avatarBase64.startsWith('data:image')
        ? parsed.avatarBase64
        : `data:image/jpeg;base64,${parsed.avatarBase64}`;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'Güncellenecek alan bulunamadı' });
    }

    const updatedUser = await User.findByIdAndUpdate(resolvedId, updateData, { new: true });

    if (!updatedUser) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
    }

    return res.json(updatedUser);
  } catch (err) {
    console.error('❌ Profil güncelleme hatası:', err);
    return res.status(500).json({ error: 'Profil güncellenemedi' });
  }
});


app.get('/api/users/:userId/following', requireAuth, requireSelfOrAdmin('params', 'userId'), userActionRateLimit, async (req, res) => {
  const { userId } = req.params;

  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Geçersiz kullanıcı ID formatı' });
    }

    const followingRecords = await Follow.find({ follower: userId })
      .populate('following', 'name avatar country countryFlag');

    const followingUsers = followingRecords
      .map((record) => record.following)
      .filter(Boolean)
      .map((user) => ({
        id: user._id,
        name: user.name || 'Stranger',
        avatar: user.avatar || null,
        country: user.country || null,
        countryFlag: user.countryFlag || null,
        isOnline: getConnectedSocketsByDbId(user._id).length > 0,
        isFollowing: true
      }));

    res.json(followingUsers);
  } catch (err) {
    console.error('❌ Following listesi getirilemedi:', err);
    res.status(500).json({ error: 'Takip edilen kullanıcılar getirilemedi' });
  }
});

app.get('/api/users/:userId/history', requireAuth, requireSelfOrAdmin('params', 'userId'), userActionRateLimit, async (req, res) => {
  const { userId } = req.params;

  if (!isValidObjectId(userId)) {
    return res.status(400).json({ error: "Geçersiz kullanıcı ID" });
  }

  try {
    console.log(`📜 Fetching match history for user: ${userId}`);

    const matches = await MatchHistory.find({
      $or: [{ user1: userId }, { user2: userId }]
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate('user1', 'name avatar country countryFlag')
      .populate('user2', 'name avatar country countryFlag');

    const partnerIds = matches
      .map((match) => {
        const isRequesterUser1 = String(match.user1?._id) === String(userId);
        const partner = isRequesterUser1 ? match.user2 : match.user1;
        return partner?._id ? String(partner._id) : null;
      })
      .filter(Boolean);

    const followingLinks = await Follow.find({
      follower: userId,
      following: { $in: partnerIds }
    }).select('following');

    const followingSet = new Set(followingLinks.map((item) => String(item.following)));

    const history = matches.map((match) => {
      const isRequesterUser1 = String(match.user1?._id) === String(userId);
      const partner = isRequesterUser1 ? match.user2 : match.user1;

      return {
        id: match._id,
        duration: match.duration,
        createdAt: match.createdAt,
        partner: partner ? {
          id: partner._id,
          name: partner.name || "Stranger",
          avatar: partner.avatar || null,
          country: partner.country || null,
          countryFlag: partner.countryFlag || null
        } : null,
        isFollowing: partner ? followingSet.has(String(partner._id)) : false
      };
    });

    console.log("Found raw match documents:", matches.length);
    console.log("Found matches count:", history.length);

    res.json(history);
  } catch (err) {
    console.error("❌ Match history getirilemedi:", err);
    res.status(500).json({ error: "Eşleşme geçmişi getirilemedi" });
  }
});

app.post('/api/ban-user', requireAuth, requireAdmin, adminRateLimit, async (req, res) => {
  const { ip, reportedId, reason } = req.body;
  
  try {
    const expireDate = new Date();
    expireDate.setHours(expireDate.getHours() + 24);

    await new Ban({ 
      ip, 
      reason: reason || "Kurallara Aykırı Davranış", 
      expireAt: expireDate 
    }).save();

    if (reportedId) {
      const targetUser = userDetails.get(reportedId);
      if (targetUser && targetUser.dbId) {
        await updateTrustScore(targetUser.dbId, -50);
        console.log(`⚖️ Ban sonucu ${targetUser.id} için puan düşürüldü.`);
      }

      io.to(reportedId).emit('account_banned', { 
        reason: reason || "Topluluk kurallarını ihlal ettiniz.",
        expireAt: expireDate
      });
      
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


app.post('/api/admin/kill-match', requireAuth, requireAdmin, adminRateLimit, (req, res) => {
    const { matchId, user1Id, user2Id } = req.body;
    io.to(user1Id).emit('partner_left_auto_next'); io.to(user2Id).emit('partner_left_auto_next');
    if (global.liveMatches) global.liveMatches.delete(matchId);
    res.json({ success: true });
});

app.get('/api/admin/all-users', requireAuth, requireAdmin, adminRateLimit, async (req, res) => {
  try {
    const users = await User.find().sort({ trustScore: 1, createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Kullanıcılar getirilemedi" });
  }
});

app.post('/api/admin/update-user', requireAuth, requireAdmin, adminRateLimit, async (req, res) => {
  const { userId, updateData } = req.body;
  try {
    await User.findByIdAndUpdate(userId, updateData);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Güncelleme hatası" });
  }
});

async function updateTrustScore(userId, change) {
  console.log(`🔍 Skor Güncelleme İsteği: ID=${userId}, Değişim=${change}`);
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        console.log("❌ Geçersiz ID veya dbId bulunamadı.");
        return;
    }
  
  try {
    const user = await User.findById(userId);
    if (user) {
      let newScore = (user.trustScore || 100) + change;
      newScore = Math.max(0, Math.min(100, newScore));
      
      await User.findByIdAndUpdate(userId, { trustScore: newScore });
      console.log(`⚖️ Güven Skoru Güncellendi: ${user.name} (${newScore})`);
    }
  } catch (err) {
    console.error("Güven skoru güncelleme hatası:", err);
  }
}

server.listen(PORT, "0.0.0.0", () => console.log(`🚀 Sunucu ${PORT} portunda yayında.`));
