"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";
import { countries as rawCountries } from 'countries-list';
import { 
  Video, VideoOff, Mic, MicOff, RefreshCw, 
  User, Flag, Settings, MessageCircle, X, 
  Play, Square, SkipForward, Globe, Check, Heart, ShieldAlert, LogIn,
  Mars, Venus 
} from 'lucide-react';

import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

if (typeof window !== "undefined" && typeof (window as any).global === "undefined") {
  (window as any).global = window;
}

// Socket bağlantısını component dışında tanımlıyoruz (Singleton)
const socket = io("https://videochat-1qxi.onrender.com", {
  transports: ["polling", "websocket"], // Önce polling ile el sıkış, sonra websocket'e geç
  withCredentials: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
  autoConnect: false,
  auth: (cb) => {
    if (typeof window === "undefined") {
      cb({});
      return;
    }

    const accessToken = localStorage.getItem("accessToken");
    cb(accessToken ? { token: accessToken } : {});
  }
});

const GOOGLE_CLIENT_ID = "18397104529-p1kna8b71s0n5b6lv1oatk2vdrofp6c2.apps.googleusercontent.com";

interface ReportItem {
  id: string;
  country: string;
  flag: string;
  screenshot: string;
}

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  
  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mobileChatEndRef = useRef<HTMLDivElement>(null);
  const peerRef = useRef<Peer.Instance | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // State Ref Pattern (Socket dinleyicilerinde güncel state'e erişmek için)
  const isActiveRef = useRef(false);

  // States
  const [reportHistory, setReportHistory] = useState<ReportItem[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [showModal, setShowModal] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [showGenderFilter, setShowGenderFilter] = useState(false);
  const [showCountryFilter, setShowCountryFilter] = useState(false);
  const [showLoginRequired, setShowLoginRequired] = useState(false); 
  const [sessionLikes, setSessionLikes] = useState(0); 
  const [partnerSessionLikes, setPartnerSessionLikes] = useState(0);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [myTotalLikes, setMyTotalLikes] = useState(0);
  // Diğer state'lerin arasına ekle
  const [banDetails, setBanDetails] = useState<{ reason: string; expireAt: string } | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("");
    
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [myGender, setMyGender] = useState<string | null>(null);
  const [partnerGender, setPartnerGender] = useState<string | null>(null);
  
  const [searchGender, setSearchGender] = useState("all"); 
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  const [partnerCountry, setPartnerCountry] = useState<string | null>(null);
  const [partnerFlag, setPartnerFlag] = useState<string | null>(null);
  const [partnerLikes, setPartnerLikes] = useState(0); 
  const [isSearching, setIsSearching] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ sender: string, text: string }[]>([]);
  const [inputText, setInputText] = useState("");
  const [isMobileInputActive, setIsMobileInputActive] = useState(false);
  const [matchNotification, setMatchNotification] = useState<string | null>(null);
  const [userCountry, setUserCountry] = useState<string>("tr"); 

  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  
  const [hasLiked, setHasLiked] = useState(false); 
  const [flyingHearts, setFlyingHearts] = useState<{ id: number; left: number; delay: number; color: string }[]>([]);

  // State güncellendiğinde Ref'i de güncelle (Socket için kritik)
  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  const getFlagEmoji = (countryCode: string) => {
    if (countryCode === "all" || countryCode === "UN") return "🌐";
    return countryCode.toUpperCase().replace(/./g, (char) => String.fromCodePoint(char.charCodeAt(0) + 127397));
  };

  const allCountries = useMemo(() => {
    const list = Object.entries(rawCountries).map(([code, data]) => ({
      id: code,
      name: (data as any).name,
      flag: getFlagEmoji(code)
    }));
    return [{ id: "all", name: "All Countries", flag: "🌐" }, ...list.sort((a, b) => a.name.localeCompare(b.name))];
  }, []);

  const filteredCountries = useMemo(() => 
    allCountries.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())), 
    [searchTerm, allCountries]
  );

  useEffect(() => {
    const fetchUserCountry = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.country_code) {
          setUserCountry(data.country_code.toLowerCase());
        }
      } catch (error) {
        console.error("Kendi ülke bilgim alınamadı:", error);
      }
    };
    fetchUserCountry();
  }, []);

  useEffect(() => {
    setIsMounted(true);
    const storedId = localStorage.getItem("dbUserId");
    const storedName = localStorage.getItem("userName"); 
    const storedAvatar = localStorage.getItem("userAvatar"); 
    const storedAccessToken = localStorage.getItem("accessToken");
    if (storedId) setDbUserId(storedId);
    if (storedName) setUserName(storedName);
    if (storedAvatar) setUserAvatar(storedAvatar); 
    if (storedAccessToken) setAccessToken(storedAccessToken);
    
    const setHeight = () => document.documentElement.style.setProperty('--vv-height', `${window.innerHeight}px`);
    setHeight();
    window.addEventListener('resize', setHeight);
    return () => window.removeEventListener('resize', setHeight);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    if (accessToken) {
      socket.auth = { token: accessToken };
    } else {
      socket.auth = {};
    }

    if (socket.connected) {
      socket.disconnect();
    }

    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, [isMounted, accessToken]);

  useEffect(() => {
    mobileChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // SOCKET EVENTS
  useEffect(() => {
    if (!socket) return;

        // 1. Anlık Banlanma Durumu
        socket.on('account_banned', (data) => {
            setBanDetails(data);
        });

        // 2. Sayfa Yenilendiğinde Sunucudan Gelen "Giremezsin" Cevabı
    socket.on('connection_refused', (data) => {
        setBanDetails(data);
    });

    socket.on("connect", () => {
      console.log("🔌 Web socket connected:", socket.id);
    });

    socket.on("connect_error", (error) => {
      console.error("❌ Socket connect error:", error.message);
    });

    socket.on('partner_left_auto_next', () => {
        console.log("Partner ayrıldı, otomatik olarak bir sonrakine geçiliyor...");
        if (peerRef.current) {
            peerRef.current.destroy();
            peerRef.current = null;
        }
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        handleNext(); 
    });

    socket.on("partner_found", (data) => {
        if (!isActiveRef.current) return;
        
        setMessages([]); 
        setPartnerId(data.partnerId); 
        setPartnerGender(data.partnerGender || 'male'); 
        setPartnerLikes(data.partnerLikes || 0); 
        setHasLiked(false); 
        
        const countryCode = (data.country || "UN").toUpperCase();
        const countryObj = allCountries.find(c => c.id === countryCode);
        setPartnerCountry(countryObj ? countryObj.name : "Global");
        setPartnerFlag(countryObj ? countryObj.flag : "🌐");
        
        setIsSearching(false); 
        initiatePeer(data.partnerId, data.initiator);
        setMatchNotification(`Matched with ${countryObj?.name || 'Global'}`);
        setTimeout(() => setMatchNotification(null), 4000);
    });

    socket.on('update_my_likes', (data) => {
      setMyTotalLikes(data.likes);
      });

    socket.on("receive_like", (data) => {
      if (data.isForMe) { 
        setMyTotalLikes(data.newLikes);
      } else {
        setPartnerLikes(data.newLikes);
      }

      if (data.senderSessionLikes) {
        setPartnerSessionLikes(data.senderSessionLikes);
      }
      
      setMatchNotification("Someone loved your vibe! ❤️");
      triggerHeartAnimation(); 
      setTimeout(() => setMatchNotification(null), 3000);
    });

    socket.on("partner_disconnected", () => {
      cleanUpPeer();
      if (isActiveRef.current) setTimeout(() => handleNext(), 1000);
    });

    socket.on("signal", (data) => {
        if (peerRef.current) peerRef.current.signal(data.signal);
    });

    // YENİ EKLENEN: SOCKET.IO MESAJ DİNLEYİCİSİ
    const handleIncomingMessage = (data: { senderId: string, text: string }) => {
        setMessages(prev => [...prev, { sender: "Stranger", text: data.text }]);
    };
    socket.on("chat_message", handleIncomingMessage);

    return () => {
        socket.off('partner_left_auto_next');
        socket.off("partner_found"); 
        socket.off("partner_disconnected"); 
        socket.off("signal"); 
        socket.off("receive_like");
        socket.off("connect");
        socket.off("connect_error");
        socket.off("chat_message", handleIncomingMessage); // Cleanup
    };
  }, [allCountries]); 


  // Ban Süresi Geri Sayım Sayacı
  useEffect(() => {
    if (!banDetails) return;

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const end = new Date(banDetails.expireAt).getTime();
      const distance = end - now;

      if (distance < 0) {
        clearInterval(interval);
        window.location.reload(); 
        return;
      }

      const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeRemaining(`${hours}sa ${minutes}dk ${seconds}sn`);
    }, 1000);

    return () => clearInterval(interval);
  }, [banDetails]);

  const startMedia = async (mode: "user" | "environment" = facingMode) => {
    try {
      if (streamRef.current && streamRef.current.active) {
        return; 
      }
      const newStream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            facingMode: mode,
            width: { ideal: 640 },  
            height: { ideal: 480 }, 
            frameRate: { ideal: 30, max: 30 }
          }, 
          audio: true 
        });
      
      streamRef.current = newStream;
      if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
    } catch (err) { 
      console.error("Media error:", err); 
    }
  };

  const getRandomHeartColor = () => {
    const colors = ["text-blue-500", "text-yellow-400", "text-purple-500", "text-pink-500", "text-red-500"];
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const triggerHeartAnimation = () => {
    const newHearts = Array.from({ length: 5 }).map((_, i) => ({
      id: Date.now() + i,
      left: Math.random() * 80 + 10,
      delay: Math.random() * 0.5,
      color: getRandomHeartColor() 
    }));
    setFlyingHearts(prev => [...prev, ...newHearts]);
    setTimeout(() => {
      setFlyingHearts(prev => prev.filter(heart => !newHearts.find(nh => nh.id === heart.id)));
    }, 2500);
  };

  const captureAndAddToHistory = () => {
    if (partnerId && remoteVideoRef.current && remoteVideoRef.current.readyState === 4) {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = remoteVideoRef.current.videoWidth;
            canvas.height = remoteVideoRef.current.videoHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(remoteVideoRef.current, 0, 0);
                const screenshot = canvas.toDataURL("image/jpeg", 0.4);
                if (screenshot.length < 1000) return;
                const newEntry = { 
                  id: partnerId, 
                  country: partnerCountry || "Unknown", 
                  flag: partnerFlag || "🌐", 
                  screenshot 
                };
                setReportHistory(prev => {
                    if (prev.some(p => p.id === partnerId)) return prev;
                    return [newEntry, ...prev].slice(0, 3);
                });
            }
        } catch (e) {
            console.error("Ekran görüntüsü alınamadı:", e);
        }
    }
  };

  const cleanUpPeer = () => {
    captureAndAddToHistory();
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setPartnerId(null);
    setPartnerCountry(null);
    setPartnerFlag(null);
    setPartnerGender(null);
    setPartnerLikes(0);
    setHasLiked(false);
    setSessionLikes(0); 
    setPartnerSessionLikes(0);
  };

  // 🔥 iOS için H264 önceliklendirme
function preferH264(sdp: string) {
  const lines = sdp.split('\r\n');
  const mLineIndex = lines.findIndex(l => l.startsWith('m=video'));
  if (mLineIndex === -1) return sdp;

  const h264Line = lines.find(l => l.toLowerCase().includes('h264'));
  if (!h264Line) return sdp;

  const payload = h264Line.split(' ')[0].split(':')[1];
  const mLineParts = lines[mLineIndex].split(' ');

  const newLine = [
    ...mLineParts.slice(0, 3),
    payload,
    ...mLineParts.slice(3).filter(p => p !== payload),
  ].join(' ');

  lines[mLineIndex] = newLine;
  return lines.join('\r\n');
}


        function initiatePeer(targetId: string, initiator: boolean) {
            if (!streamRef.current) {
                console.error("❌ HATA: Kamera/Mikrofon akışı bulunamadı. Peer başlatılamaz.");
                return;
            }
            
            console.log(`🔗 Peer başlatılıyor... Hedef ID: ${targetId}, Başlatan Ben miyim?: ${initiator}`);

            const peer = new Peer({ 
                initiator, 
                trickle: true, 
                stream: streamRef.current,
                config: { 
                    iceServers: [
                        {
                            urls: "stun:stun.relay.metered.ca:80",
                          },
                          {
                            urls: "turn:global.relay.metered.ca:80",
                            username: "bfb4db94fc1c17517e4df2dc",
                            credential: "dGFFGnHjjO0mv4ld",
                          },
                          {
                            urls: "turn:global.relay.metered.ca:80?transport=tcp",
                            username: "bfb4db94fc1c17517e4df2dc",
                            credential: "dGFFGnHjjO0mv4ld",
                          },
                          {
                            urls: "turn:global.relay.metered.ca:443",
                            username: "bfb4db94fc1c17517e4df2dc",
                            credential: "dGFFGnHjjO0mv4ld",
                          },
                          {
                            urls: "turns:global.relay.metered.ca:443?transport=tcp",
                            username: "bfb4db94fc1c17517e4df2dc",
                            credential: "dGFFGnHjjO0mv4ld",
                          }
                    ] 
                }
            });

            peer.on("signal", (data: any) => {
                console.log(`📡 Sinyal gönderiliyor (Hedef: ${targetId}, Tip: ${data.type})`);

                if ((data.type === "offer" || data.type === "answer") && data.sdp) {
                    data.sdp = preferH264(data.sdp);
                }

                socket.emit("signal", { to: targetId, signal: data });
            });

          peer.on("stream", (remStream) => { 
              console.log("✅ Karşı tarafın video akışı (Stream) başarıyla alındı.");
              if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remStream; 
          });

          // ESKİ DATA DİNLEYİCİSİ İPTAL EDİLDİ: Mesajlar artık socket üzerinden geçecek.
          // peer.on("data", (data) => {
          //    setMessages(prev => [...prev, { sender: "Stranger", text: new TextDecoder().decode(data) }]);
          // });

          peer.on("connect", () => {
              console.log("🟢 WebRTC Bağlantısı başarıyla kuruldu! Görüntülü sohbet başladı.");
          });

          peer.on("error", (err) => {
              console.error("❌ WebRTC Bağlantı Hatası:", err);
              cleanUpPeer();
              handleNext();
          });

          peerRef.current = peer;
        }

        const handleNext = () => {
          if (!isActiveRef.current) return;
          cleanUpPeer();
          setIsSearching(true);
          socket.emit("next_user"); 
          socket.emit("find_partner", { myGender, searchGender, selectedCountry });
  };


  const handleLike = () => {
    triggerHeartAnimation();
    const updatedLikes = sessionLikes + 1; 
    setSessionLikes(updatedLikes);
    if (partnerId) {
      const shouldIncrease = dbUserId ? !hasLiked : false;
      socket.emit("like_partner", { 
        targetId: partnerId, 
        increaseCounter: shouldIncrease,
        currentSessionLikes: updatedLikes 
      });
      if (!hasLiked && dbUserId) {
        setHasLiked(true);
      }
    }
  };

  const handleReport = () => {
    captureAndAddToHistory();
    setShowReportModal(true);
  };

  const sendFinalReport = (targetUser: ReportItem) => {
    if (socket) {
      socket.emit("report_user", {
        reportedId: targetUser.id,
        screenshot: targetUser.screenshot
      });
      alert("Kullanıcı başarıyla bildirildi ve incelenmek üzere işaretlendi.");
      setShowReportModal(false);
      if (targetUser.id === partnerId) handleNext();
    }
  };

  const toggleActive = () => {
    const nextState = !isActive;
    setIsActive(nextState);
    if (nextState) {
        setIsSearching(true);
        startMedia();
        socket.emit("find_partner", { myGender, searchGender, selectedCountry });
    } else { 
        cleanUpPeer(); 
        setIsSearching(false); 
        socket.emit("stop_search"); 
    }
  };

  // YENİDEN YAZILAN GÖNDERME FONKSİYONU
  const sendMessage = (e: any) => {
    e.preventDefault();
    if (inputText.trim() && partnerId) {
      // 1. Socket.io üzerinden "chat_message" adıyla ilet
      socket.emit("chat_message", { to: partnerId, text: inputText.trim() });
      
      // 2. Kendi ekranına ekle
      setMessages(prev => [...prev, { sender: "Me", text: inputText.trim() }]);
      setInputText("");
    }
  };

  const toggleCamera = () => { 
    if (streamRef.current) { 
      const track = streamRef.current.getVideoTracks()[0]; 
      track.enabled = !cameraOn; 
      setCameraOn(!cameraOn); 
    } 
  };
  
  const toggleMic = () => { 
    if (streamRef.current) { 
      const track = streamRef.current.getAudioTracks()[0]; 
      track.enabled = !micOn; 
      setMicOn(!micOn); 
    } 
  };


        // --- BAN EKRANI (Araya Giren Katman) ---
        if (banDetails) {
          return (
            <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center p-6 text-center select-none">
              <div className="bg-[#121214] border-2 border-red-600/50 p-8 rounded-[40px] max-w-md w-full shadow-[0_0_100px_rgba(220,38,38,0.3)] animate-in zoom-in-95 duration-300 relative overflow-hidden">
                
                {/* Arka plan efekti */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 via-orange-600 to-red-600 animate-pulse"></div>
                
                <div className="mb-6 flex justify-center">
                  <div className="w-24 h-24 bg-red-600/20 rounded-full flex items-center justify-center animate-bounce">
                    <ShieldAlert size={48} className="text-red-500" />
                  </div>
                </div>

                <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">ERİŞİM ENGELLENDİ</h1>
                <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest mb-8">Topluluk kurallarını ihlal ettiniz</p>

                <div className="bg-red-900/10 border border-red-500/20 p-4 rounded-2xl mb-6">
                  <p className="text-[10px] text-red-400 font-black uppercase mb-1">Sebep</p>
                  <p className="text-sm text-white font-medium">{banDetails.reason}</p>
                </div>

                <div className="mb-8">
                  <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest mb-2">Yasağın Kalkmasına Kalan Süre</p>
                  <div className="text-4xl font-black text-white font-mono tracking-widest tabular-nums bg-black/40 py-4 rounded-2xl border border-white/5">
                    {timeRemaining || "Hesaplanıyor..."}
                  </div>
                </div>

                <button 
                  onClick={() => window.location.reload()}
                  className="w-full bg-white text-black py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-zinc-200 transition-colors active:scale-95"
                >
                  Tekrar Kontrol Et
                </button>
              </div>
            </div>
          );
        }

  if (!isMounted) return null;

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <div className="fixed inset-0 w-full bg-[#050505] text-white flex flex-col font-sans overflow-hidden select-none h-[100dvh]">
        
        {showLoginRequired && (
          <div className="fixed inset-0 z-[1100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-2xl">
            <div className="bg-[#121214] border border-blue-500/20 w-full max-w-sm rounded-[40px] p-8 shadow-2xl text-center relative animate-in zoom-in-95 duration-300">
              <button onClick={() => setShowLoginRequired(false)} className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors"><X size={24}/></button>
              <div className="w-20 h-20 bg-blue-600/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <LogIn size={32} className="text-blue-500" />
              </div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white mb-2">Premium Feature</h3>
              <p className="text-xs text-zinc-400 font-bold uppercase tracking-widest mb-8 leading-relaxed text-center">
                Login with Google to use <span className="text-blue-500">filters</span> and collect <span className="text-pink-500">hearts</span> ❤️
              </p>
              <div className="flex justify-center scale-110 mb-4">
                <GoogleLogin
                  onSuccess={async (credentialResponse) => {
                    try {
                      const res = await fetch("https://videochat-1qxi.onrender.com/api/auth/social-login", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ token: credentialResponse.credential }) 
                      });
                      const responseData = await res.json();
                      const userData = responseData.user || responseData;
                      const nextAccessToken =
                        responseData.accessToken ||
                        responseData.token ||
                        responseData.jwt ||
                        null;

                      if (!res.ok || !userData?._id || !nextAccessToken) {
                        throw new Error(responseData?.error || "Login failed");
                      }

                      setDbUserId(userData._id);
                      setUserName(userData.name); 
                      setUserAvatar(userData.avatar); 
                      setAccessToken(nextAccessToken);
                      localStorage.setItem("dbUserId", userData._id);
                      localStorage.setItem("userName", userData.name); 
                      localStorage.setItem("userAvatar", userData.avatar);
                      localStorage.setItem("accessToken", nextAccessToken);
                      setShowLoginRequired(false);
                      alert(`Welcome ${userData.name}!`);
                    } catch (error) {
                      console.error("Google login error:", error);
                      alert("Login failed. Please try again.");
                    }
                  }}
                  onError={() => console.log('Login Failed')}
                  theme="filled_blue"
                  shape="pill"
                />
              </div>
            </div>
          </div>
        )}

        {showCountryFilter && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <div className="bg-[#121214] border border-white/10 w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-blue-500 font-bold uppercase text-xs tracking-widest">Region Selection</h3>
                <button onClick={() => setShowCountryFilter(false)}><X size={20}/></button>
              </div>
              <div className="p-4">
                <input type="text" placeholder="Search country..." className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 mb-4 outline-none text-xs focus:ring-1 ring-blue-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                <div className="max-h-[300px] overflow-y-auto no-scrollbar space-y-1">
                  {filteredCountries.map(c => (
                    <button key={c.id} onClick={() => { setSelectedCountry(c.id); setShowCountryFilter(false); handleNext(); }} className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${selectedCountry === c.id ? 'bg-blue-600/20 text-blue-500' : 'hover:bg-white/5 text-zinc-400'}`}>
                      <div className="flex items-center gap-3"><span>{c.flag}</span> <span className="text-sm">{c.name}</span></div>
                      {selectedCountry === c.id && <Check size={16}/>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {showGenderFilter && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <div className="bg-[#121214] border border-white/10 w-full max-w-xs rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95">
              <div className="flex items-center justify-between mb-6 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Gender Filter <button onClick={() => setShowGenderFilter(false)}><X size={20}/></button></div>
              {['all', 'female', 'male'].map((opt) => (
                <button key={opt} onClick={() => { setSearchGender(opt); setShowGenderFilter(false); handleNext(); }} className={`w-full flex items-center justify-between p-5 rounded-2xl mb-1 transition-all ${searchGender === opt ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20' : 'hover:bg-white/5 text-zinc-400'}`}>
                  <span className="text-xs font-bold uppercase tracking-widest">{opt === 'all' ? 'Everyone' : opt + 's'}</span>
                  {searchGender === opt && <div className="w-2 h-2 bg-blue-500 rounded-full"></div>}
                </button>
              ))}
            </div>
          </div>
        )}

        {showOptions && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <div className="bg-[#121214] border border-white/10 w-full max-w-xs rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95">
              <div className="flex items-center justify-between mb-8">
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Device Settings</span>
                <button onClick={() => setShowOptions(false)}><X size={20}/></button>
              </div>
              <div className="space-y-4">
                <button onClick={toggleCamera} className={`w-full flex items-center justify-between p-5 rounded-2xl transition-all ${cameraOn ? 'bg-blue-600/10 text-blue-400' : 'bg-red-500/10 text-red-500'}`}>
                  <div className="flex items-center gap-4">{cameraOn ? <Video size={20}/> : <VideoOff size={20}/>} <span className="text-xs font-bold uppercase tracking-widest">Camera</span></div>
                </button>
                <button onClick={toggleMic} className={`w-full flex items-center justify-between p-5 rounded-2xl transition-all ${micOn ? 'bg-blue-600/10 text-blue-400' : 'bg-red-500/10 text-red-500'}`}>
                  <div className="flex items-center gap-4">{micOn ? <Mic size={20}/> : <MicOff size={20}/>} <span className="text-xs font-bold uppercase tracking-widest">Microphone</span></div>
                </button>
                <button onClick={() => { startMedia(facingMode === "user" ? "environment" : "user"); setFacingMode(facingMode === "user" ? "environment" : "user"); setShowOptions(false); }} className="w-full flex items-center gap-4 p-5 rounded-2xl hover:bg-white/5 text-zinc-400">
                  <RefreshCw size={20}/> <span className="text-xs font-bold uppercase tracking-widest">Switch Camera</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative h-full">
          {/* SOL TARAF (MOBİLDE TAM EKRAN, DESKTOPTA SOL YARI) */}
          <div className="flex-1 flex flex-col md:max-w-[50%] h-full bg-black relative">
            
            {/* 1. KUTU: KARŞI TARAF KAMERASI (Mobilde ÜST YARI - h-1/2) */}
            <div className="relative w-full h-1/2 bg-zinc-900 overflow-hidden border-b border-white/5">
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              
              {flyingHearts.map((heart) => (
                <div key={heart.id} className="absolute bottom-10 pointer-events-none animate-fly-up-fade z-[100]" style={{ left: `${heart.left}%`, animationDelay: `${heart.delay}s` }}>
                  <Heart size={44} className={`${heart.color} fill-current drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]`} />
                </div>
              ))}

              <div className="absolute top-0 left-0 z-[120] flex flex-col gap-0">
                {!isSearching && isActive && partnerId && (
                  <div className="relative group">
                    <div className="flex items-center gap-1 bg-zinc-950 backdrop-blur-3xl border-r border-b border-white/10 pl-1 pr-4 py-1 rounded-br-[32px] shadow-2xl animate-in slide-in-from-top-10 duration-500">
                      <div className="w-9 h-9 flex items-center justify-center bg-white/5 rounded-2xl text-xl shrink-0">
                        {partnerFlag}
                      </div>
                      <div className="flex flex-col justify-center gap-0.5">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]"></div>
                          <span className="text-[9px] font-black text-white uppercase tracking-tight leading-none">{partnerCountry}</span>
                        </div>
                        <div onClick={handleLike} className="flex items-center gap-1.5 bg-pink-500/20 px-2 py-0.5 rounded-xl cursor-pointer hover:bg-pink-500/30 transition-all border border-pink-500/10">
                          <Heart size={8} className="text-pink-500 fill-pink-500" />
                          <span className="text-xm font-black text-pink-500 tabular-nums leading-none">{partnerLikes}</span>
                        </div>
                      </div>
                      <div className="h-6 w-[1px] bg-white/10 mx-0.5"></div>
                      <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${partnerGender === 'female' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        <span className="text-lg font-bold">{partnerGender === 'female' ? '♀' : '♂'}</span>
                      </div>
                    </div>
                    {partnerSessionLikes > 0 && (
                      <div className="absolute -bottom-10 left-2 animate-bounce bg-pink-600 px-3 py-1.5 rounded-full border border-white/20 shadow-[0_0_20px_rgba(219,39,119,0.6)] z-[200]">
                        <span className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2"><Heart size={12} className="fill-white animate-pulse" />{partnerSessionLikes}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* REPORT MODALI BURADA - SADECE ÜST KAMERADA AÇILIR */}
              {showReportModal && (
                <div className="absolute inset-0 z-[1200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                  <div className="w-[90%] max-w-[300px] bg-[#121214] border border-white/10 rounded-[30px] p-5 shadow-2xl relative overflow-hidden">
                    <div className="text-center mb-4">
                      <h3 className="text-lg font-black italic tracking-tighter text-white uppercase italic">Kötüye Kullanımı Bildir</h3>
                      <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Şikayet etmek istediğiniz kişiyi seçin</p>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-4">
                      {reportHistory.map((item, index) => (
                        <div key={index} className="relative aspect-[3/4] rounded-xl overflow-hidden border border-white/10 hover:border-red-500 active:scale-95 transition-all shadow-lg cursor-pointer group" onClick={() => sendFinalReport(item)}>
                          <img src={item.screenshot} className="w-full h-full object-cover" alt="History" />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1 text-center"><span className="text-[8px] font-bold">{item.flag}</span></div>
                          <div className="absolute inset-0 flex items-center justify-center bg-red-600/60 opacity-0 group-hover:opacity-100 transition-opacity"><ShieldAlert size={20} className="text-white drop-shadow-lg" /></div>
                        </div>
                      ))}
                      {reportHistory.length === 0 && (<p className="col-span-3 text-center text-[10px] text-zinc-500 py-4">Bildirilecek geçmiş kullanıcı yok.</p>)}
                    </div>

                    <div className="space-y-2">
                      <button onClick={() => setShowReportModal(false)} className="w-full py-3 rounded-xl bg-white/5 text-zinc-400 font-black uppercase text-[10px] tracking-[0.2em] hover:bg-white/10 active:scale-95 transition-all">Vazgeç</button>
                    </div>
                  </div>
                </div>
              )}

              {userAvatar && !showModal && (
                <div 
                  onClick={() => setShowProfileModal(true)}
                  className={`absolute top-[45px] ml-0.5 ${partnerSessionLikes > 0 ? 'mt-10' : 'mt-2'} cursor-pointer transition-all duration-300 flex items-center gap-2 bg-black/40 backdrop-blur-xl border border-white/10 p-1 rounded-full w-fit hover:bg-white/5 active:scale-95 animate-in fade-in slide-in-from-left-4 z-[60]`}
                >
                  <img src={userAvatar} alt="You" className="w-8 h-8 rounded-full border-2 border-blue-500/40 object-cover" onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${userName}&background=0D8ABC&color=fff`)} />
                  {/* <span className="text-[9px] font-black pr-3 text-white uppercase tracking-widest">PROFIL</span> */}
                </div>
              )}

              {/* Stranger Butonlar */}
              {!isSearching && isActive && partnerId && (
                <div className="absolute bottom-8 md:bottom-6 right-1.5 flex flex-col gap-1 z-[70]">
                  <button onClick={handleReport} className="w-10 h-10 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center text-zinc-400 hover:text-red-500 transition-all active:scale-90"><ShieldAlert size={24} /></button>
                  <button onClick={handleLike} className="w-10 h-10 bg-pink-600/20 backdrop-blur-2xl border border-pink-500/30 rounded-full flex items-center justify-center text-pink-500 shadow-2xl shadow-pink-500/20 active:scale-90 transition-all group">
                    <Heart size={26} className="group-hover:fill-pink-500 transition-all" />
                    {sessionLikes > 0 && (<div className="absolute -top-2 -right-1 bg-pink-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-lg animate-in zoom-in duration-200">{sessionLikes}</div>)}
                  </button>
                </div>
              )}
              
              {!isActive && !showModal && (
                <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-xl">
                  <button 
                    onClick={() => {
                      setIsActive(true);
                      setIsSearching(true);
                      startMedia();
                      if (socket) {
                        socket.emit("find_partner", { 
                          myGender: myGender, 
                          searchGender: searchGender, 
                          selectedCountry: selectedCountry 
                        });
                      }
                    }} 
                    className="bg-blue-600 text-white px-10 py-5 rounded-[24px] font-black uppercase text-xs flex items-center gap-3 active:scale-95 transition-transform"
                  >
                    <Play size={20} fill="currentColor"/> Start Chat
                  </button>
                </div>
              )}
              {isSearching && isActive && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md text-center">
                  <div className="w-10 h-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Searching...</p>
                </div>
              )}
              <div className="absolute top-2 right-6 z-50"><h1 className="text-xl font-black italic text-blue-500 tracking-tighter">OMEGPT</h1></div>
            </div>

            {/* 2. KUTU: SENİN KAMERAN (Mobilde ALT YARI - h-1/2) */}
            <div className="relative w-full h-1/2 bg-zinc-900 overflow-hidden">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              
              {!showModal && (
                <div className="absolute right-1 top-6 flex flex-col gap-3 z-[80]">
                  <button onClick={() => setShowOptions(true)} className="w-10 h-10 bg-black/20 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-center text-white shadow-2xl active:scale-90 transition-all"><Settings size={26}/></button>
                  <button onClick={() => dbUserId ? setShowGenderFilter(true) : setShowLoginRequired(true)} className="w-10 h-10 bg-black/20 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-center text-white shadow-2xl active:scale-90 transition-all"><User size={26}/></button>
                  <button onClick={() => dbUserId ? setShowCountryFilter(true) : setShowLoginRequired(true)} className="w-10 h-10 bg-black/20 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-center text-white shadow-2xl active:scale-90 transition-all overflow-hidden group">
                    <span className="text-2xl group-active:scale-110 transition-transform">
                      {selectedCountry && selectedCountry !== "all" ? getFlagEmoji(selectedCountry) : getFlagEmoji(userCountry)}
                    </span>
                  </button>
                </div>
              )}

              <div className="md:hidden absolute bottom-28 left-6 right-20 z-40 flex flex-col justify-end max-h-[180px] overflow-y-auto no-scrollbar pointer-events-none">
                  {messages.map((m, i) => (
                      <div key={i} className={`px-3 py-1.5 rounded-xl text-[10px] mb-1.5 w-fit max-w-[90%] backdrop-blur-md border border-white/10 ${m.sender === "Me" ? "bg-blue-600/70 text-white" : "bg-zinc-800/80 text-zinc-200"}`}>
                          <span className="font-bold opacity-40 mr-1 text-[8px] uppercase">{m.sender}</span>
                          <p className="inline leading-tight">{m.text}</p>
                      </div>
                  ))}
                  <div ref={mobileChatEndRef} />
              </div>

             {/* ALT KONTROL BARI */}
            {!showModal && (
              <div className="md:hidden absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-black via-black/40 to-transparent flex items-center justify-between px-5 z-[100] pb-4">
                <button onClick={toggleActive} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all active:scale-90 shadow-lg ${isActive ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                  {isActive ? <Square size={26} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                </button>
                <button onClick={() => handleNext()} disabled={!isActive} className="bg-blue-600 text-white px-8 py-3 rounded-[20px] font-black text-sm uppercase tracking-[0.2em] disabled:opacity-30 flex items-center gap-3 active:scale-95 transition-all shadow-[0_0_30px_rgba(37,99,235,0.4)]">
                  <SkipForward size={20} fill="currentColor" /> NEXT
                </button>
                <button onClick={() => setIsMobileInputActive(!isMobileInputActive)} disabled={!isActive || !partnerId} className={`w-10 h-10 rounded-2xl flex items-center justify-center active:scale-90 shadow-lg ${isMobileInputActive ? 'bg-blue-600 text-white' : 'bg-white/5 text-white'}`}>
                  <MessageCircle size={22} />
                </button>
              </div>
            )}

              {isMobileInputActive && isActive && (
                <div className="md:hidden absolute bottom-20 left-6 right-6 z-[110] animate-in slide-in-from-bottom-2 duration-200">
                  <form onSubmit={sendMessage} className="flex bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 p-1.5 rounded-2xl shadow-2xl">
                    <input autoFocus value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type a message..." className="flex-1 bg-transparent px-4 py-2 text-xs outline-none text-white w-full" />
                    <button type="submit" className="bg-blue-600 text-white w-10 h-10 rounded-xl flex items-center justify-center active:scale-95"><SkipForward size={18} className="rotate-[-90deg]" /></button>
                  </form>
                </div>
              )}
            </div>
          </div>

          <div className="hidden md:flex flex-1 flex-col bg-[#080808] border-l border-white/5 relative z-20">
            {/* ...DESKTOP CHAT KISMI AYNI... */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between font-black text-zinc-500 uppercase tracking-[0.3em] text-[10px]">Interaction Area
              {!showModal && (
                  <button onClick={toggleActive} className={`flex items-center gap-2 px-4 py-2 rounded-full text-[9px] transition-all ${isActive ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}>
                      {isActive ? <Square size={10} fill="currentColor"/> : <Play size={12} fill="currentColor"/>} {isActive ? 'Stop' : 'Start'}
                  </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.sender === "Me" ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[11px] leading-relaxed ${msg.sender === "Me" ? "bg-blue-600 text-white" : "bg-zinc-800/60 border border-white/5 text-zinc-100"}`}>
                    <span className="text-[8px] font-black opacity-30 block mb-0.5 uppercase tracking-tighter">{msg.sender}</span> {msg.text}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="p-6 bg-zinc-950/50 border-t border-white/5 flex gap-4">
              <button onClick={() => handleNext()} disabled={!isActive} className="h-12 px-6 rounded-2xl bg-zinc-100 text-black font-black uppercase text-xs active:scale-95 transition-all">Next</button>
              <form onSubmit={sendMessage} className="flex-1 flex gap-2">
                <input value={inputText} onChange={(e) => setInputText(e.target.value)} disabled={!isActive} className="flex-1 bg-white/5 border border-white/10 p-3 rounded-2xl text-white outline-none text-xs focus:ring-1 ring-blue-500" placeholder="Type message..." />
                <button type="submit" disabled={!isActive} className="h-12 w-12 flex items-center justify-center rounded-2xl bg-blue-600 text-white active:scale-95 transition-all"><SkipForward size={18} className="rotate-[-90deg]"/></button>
              </form>
            </div>
          </div>
        </main>

        {showModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/85 backdrop-blur-2xl">
              <div className="relative max-w-sm w-full bg-[#111113] border border-white/10 p-10 rounded-[48px] text-center space-y-10 shadow-2xl">
                  <div className="space-y-3">
                    <h2 className="text-5xl font-black italic tracking-tighter text-blue-500 uppercase drop-shadow-2xl">OMEGPT</h2>
                    <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.4em]">Premium Network</p>
                  </div>
                  
                  <div className="bg-white/5 p-6 rounded-3xl border border-white/10 mb-6">
                    {userName ? (
                      <div className="space-y-2 animate-in fade-in zoom-in-95 duration-500">
                        <div className="flex justify-center mb-2">
                            <img src={userAvatar || ""} alt="User Avatar" className="w-16 h-16 rounded-full border-2 border-blue-500/50 object-cover shadow-lg shadow-blue-500/20" onError={(e) => (e.currentTarget.src = "https://ui-avatars.com/api/?name=" + userName + "&background=0D8ABC&color=fff")} />
                        </div>
                        <p className="text-xs text-zinc-300 font-medium tracking-wide leading-none">Hoş geldin,</p>
                        <h3 className="text-xl font-black text-white uppercase tracking-tight">{userName}!</h3>
                        <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.2em] pt-2 border-t border-white/5">
                          Cinsiyetini seç ve <span className="text-blue-500 text-sm">başla</span>
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-zinc-400 font-bold uppercase tracking-[0.2em] leading-relaxed text-center">
                        Select your gender to <br /><span className="text-blue-500 text-sm">start chatting</span> instantly
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                      {/* ERKEK BUTONU (3D STYLE) */}
                      <button onClick={() => setMyGender("male")} className={`relative overflow-hidden flex flex-col items-center gap-3 py-8 rounded-[32px] font-bold border-2 transition-all active:scale-95 ${myGender === "male" ? "bg-blue-600/10 border-blue-500 text-blue-500 shadow-lg shadow-blue-500/20" : "bg-black/20 border-white/5 text-zinc-500 hover:bg-white/5"}`}>
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${myGender === "male" ? "bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.5)] scale-110" : "bg-zinc-800"}`}>
                              <Mars size={32} strokeWidth={2.5} />
                          </div>
                          <span className="text-[10px] uppercase font-black tracking-widest">Male</span>
                          {myGender === "male" && <div className="absolute inset-0 border-2 border-blue-500 rounded-[32px] animate-pulse"></div>}
                      </button>

                      {/* KADIN BUTONU (3D STYLE) */}
                      <button onClick={() => setMyGender("female")} className={`relative overflow-hidden flex flex-col items-center gap-3 py-8 rounded-[32px] font-bold border-2 transition-all active:scale-95 ${myGender === "female" ? "bg-pink-600/10 border-pink-500 text-pink-500 shadow-lg shadow-pink-500/20" : "bg-black/20 border-white/5 text-zinc-500 hover:bg-white/5"}`}>
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${myGender === "female" ? "bg-pink-500 text-white shadow-[0_0_20px_rgba(236,72,153,0.5)] scale-110" : "bg-zinc-800"}`}>
                              <Venus size={32} strokeWidth={2.5} />
                          </div>
                          <span className="text-[10px] uppercase font-black tracking-widest">Female</span>
                          {myGender === "female" && <div className="absolute inset-0 border-2 border-pink-500 rounded-[32px] animate-pulse"></div>}
                      </button>
                  </div>

                    <button 
                      onClick={() => { 
                        if(!myGender) return alert("Select gender!"); 
                        
                        setShowModal(false); 
                        setIsActive(true); 
                        setIsSearching(true); 
                        startMedia();

                        if (socket) {
                          socket.emit("find_partner", { 
                            myGender: myGender, 
                            searchGender: searchGender, 
                            selectedCountry: selectedCountry 
                          });
                        }
                      }} 
                      className="w-full bg-zinc-100 text-black py-5 rounded-[24px] font-black text-lg hover:bg-blue-600 hover:text-white transition-all active:scale-95 uppercase"
                    >
                      Let&apos;s Go 🚀
                    </button> 
             </div>
          </div>
        )}

        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap');
          html, body { font-family: 'Inter', sans-serif; background: #000; color: white; overflow: hidden; }
          .no-scrollbar::-webkit-scrollbar { display: none; }
          @keyframes fly-up-fade {
            0% { transform: translateY(0) scale(0.8) rotate(0deg); opacity: 0; }
            10% { opacity: 1; transform: translateY(-20px) scale(1.2) rotate(-10deg); }
            100% { transform: translateY(-300px) scale(0.5) rotate(20deg); opacity: 0; }
          }
          .animate-fly-up-fade { animation: fly-up-fade 2.5s ease-out forwards; }
          @keyframes swipe-left { 0%, 100% { transform: translateX(0); opacity: 0.8; } 50% { transform: translateX(-15px); opacity: 1; } }
          .animate-swipe-left { animation: swipe-left 1.5s infinite ease-in-out; }
        `}</style>
      </div>

      {/* KULLANICI PROFİL MODALI */}
        {showProfileModal && (
          <div className="fixed inset-0 z-[1200] flex items-center justify-center p-6 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-300">
            <div className="bg-[#121214] border border-white/10 w-full max-w-sm rounded-[40px] p-8 shadow-2xl relative overflow-hidden text-center">
              <button onClick={() => setShowProfileModal(false)} className="absolute top-6 right-6 text-zinc-500 hover:text-white transition-colors">
                <X size={24}/>
              </button>

              <div className="relative w-24 h-24 mx-auto mb-4">
                <img 
                  src={userAvatar || ""} 
                  className="w-full h-full rounded-full border-4 border-blue-600/20 object-cover shadow-2xl" 
                  alt="Profile"
                  onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${userName}&background=0D8ABC&color=fff`)}
                />
                <div className="absolute bottom-0 right-0 bg-green-500 w-6 h-6 rounded-full border-4 border-[#121214]"></div>
              </div>
              <h3 className="text-2xl font-black uppercase italic tracking-tighter text-white mb-1">{userName}</h3>
              <span className="text-[10px] text-blue-500 font-bold uppercase tracking-[0.3em] block mb-8">OMEGPT Network</span>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Beğeniler</p>
                  <p className="text-xl font-black text-pink-500 flex items-center justify-center gap-2">
                    <Heart size={16} fill="currentColor"/> {myTotalLikes || 0}
                  </p>
                </div>
                <div className="bg-white/5 p-4 rounded-3xl border border-white/5">
                  <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-1">Güven Skoru</p>
                  <p className="text-xl font-black text-blue-400">100/100</p>
                </div>
              </div>

              <div className="space-y-2 mb-8">
                <div 
                  onClick={() => {
                    localStorage.clear();
                    setAccessToken(null);
                    window.location.reload();
                  }}
                  className="flex items-center justify-between p-4 bg-red-600/10 rounded-2xl hover:bg-red-600/20 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-4 text-red-500">
                    <LogIn size={18} className="rotate-180"/>
                    <span className="text-xs font-bold uppercase tracking-widest">Çıkış Yap</span>
                  </div>
                  <SkipForward size={14} className="text-red-500/50"/>
                </div>
              </div>

              <p className="text-[9px] text-zinc-700 uppercase font-bold tracking-widest leading-relaxed">
                Platform kurallarına uyduğunuz için <br/> teşekkür ederiz.
              </p>
            </div>
          </div>
        )}

    </GoogleOAuthProvider>
  );
}
