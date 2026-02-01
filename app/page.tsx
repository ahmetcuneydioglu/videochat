"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

if (typeof window !== "undefined" && typeof (window as any).global === "undefined") {
  (window as any).global = window;
}

// HTTPS üzerinden bağlandığından emin ol
// localhost yerine bilgisayarının yerel IP adresini yazmalısın
const socket = io("https://videochat-1qxi.onrender.com", {
  transports: ["websocket"]
});

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const peerRef = useRef<Peer.Instance | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isBanned, setIsBanned] = useState(false);
  const [showModal, setShowModal] = useState(true);
  const [myGender, setMyGender] = useState<string | null>(null);
  const [searchGender, setSearchGender] = useState("all");
  const [onlySameCountry, setOnlySameCountry] = useState(false);
  const [partnerCountry, setPartnerCountry] = useState<string | null>(null);
  
  const [isSearching, setIsSearching] = useState(false);
  const [waitingStatus, setWaitingStatus] = useState("Eşleşme aranıyor...");
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ sender: string, text: string }[]>([]);
  const [inputText, setInputText] = useState("");
  const userName = "Ben";

  const [recentPartners, setRecentPartners] = useState<{id: string, screenshot: string}[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);

  // Mount kontrolü - Hydration hatalarını önlemek için şart
  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Partner değiştiğinde videoyu mobilde oynatmak için tetikleyici
  useEffect(() => {
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
      remoteVideoRef.current.play().catch(e => console.error("Video oynatma hatası:", e));
    }
  }, [partnerId]);

  useEffect(() => {
    async function startCamera() {
      if (streamRef.current) return;
      try {
        // navigator.mediaDevices kontrolü (Güvenli bağlam/SSL kontrolü)
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error("Kamera erişimi için HTTPS veya localhost gereklidir.");
            return;
        }
        const userStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = userStream;
        if (localVideoRef.current) localVideoRef.current.srcObject = userStream;
      } catch (err) { console.error("Kamera başlatılamadı:", err); }
    }
    
    if (isMounted) startCamera();

    socket.on("banned", () => setIsBanned(true));
    socket.on("waiting_msg", (msg) => setWaitingStatus(msg));

    socket.on("partner_found", (data) => {
      if (partnerId && remoteVideoRef.current) captureAndSavePartner(partnerId);
      setMessages([]);
      setPartnerId(data.partnerId);
      setPartnerCountry(data.country);
      setIsSearching(false);
      initiatePeer(data.partnerId, data.initiator);
    });

    socket.on("partner_disconnected", () => {
      if (peerRef.current) peerRef.current.destroy();
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      if (partnerId) captureAndSavePartner(partnerId);
      setPartnerId(null);
      setPartnerCountry(null);
    });

    socket.on("signal", (data) => {
      if (peerRef.current && !(peerRef.current as any).destroyed) {
        peerRef.current.signal(data.signal);
      }
    });

    return () => {
      socket.off("banned");
      socket.off("waiting_msg");
      socket.off("partner_found");
      socket.off("partner_disconnected");
      socket.off("signal");
    };
  }, [partnerId, isMounted]);

  const captureAndSavePartner = (id: string) => {
    if (!remoteVideoRef.current || !remoteVideoRef.current.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = 160; canvas.height = 120;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(remoteVideoRef.current, 0, 0, canvas.width, canvas.height);
    const snap = canvas.toDataURL("image/jpeg", 0.4);

    setRecentPartners(prev => {
      if (prev.find(p => p.id === id)) return prev;
      return [{ id, screenshot: snap }, ...prev].slice(0, 3);
    });
  };

  function initiatePeer(targetId: string, initiator: boolean) {
    if (!streamRef.current) return;
    const peer = new Peer({
      initiator: initiator,
      trickle: false,
      stream: streamRef.current,
    });

    peer.on("signal", (data) => socket.emit("signal", { to: targetId, signal: data }));
    peer.on("stream", (remStream) => {
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remStream;
    });
    peer.on("data", (data) => {
      const msg = new TextDecoder().decode(data);
      setMessages((prev) => [...prev, { sender: "Yabancı", text: msg }]);
    });
    peerRef.current = peer;
  }

  const handleStart = () => {
    if (!myGender) return alert("Cinsiyet seçin!");
    setShowModal(false);
    handleNext();
  };

  const handleNext = () => {
    if (partnerId) captureAndSavePartner(partnerId);
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setPartnerId(null);
    setPartnerCountry(null);
    setIsSearching(true);
    socket.emit("find_partner", { myGender, searchGender, onlySameCountry });
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && peerRef.current) {
      peerRef.current.send(inputText.trim());
      setMessages((prev) => [...prev, { sender: userName, text: inputText.trim() }]);
      setInputText("");
    }
  };

  if (isBanned) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-white uppercase font-black italic">
      <h1 className="text-4xl mb-4">Erişim Engellendi</h1>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans overflow-hidden">
      
      {/* Rapor Modalı */}
      {showReportModal && (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-4">
          <h2 className="text-2xl font-black mb-10 italic uppercase tracking-tighter">Kötüye Kullanımı Bildir</h2>
          <div className="flex gap-5 mb-12 flex-wrap justify-center">
            {recentPartners.length > 0 ? recentPartners.map((p, i) => (
              <div key={i} className="group relative">
                <div 
                  onClick={() => {
                    socket.emit("report_user", { targetId: p.id, screenshot: p.screenshot });
                    alert("Kullanıcı raporlandı.");
                    setRecentPartners(prev => prev.filter(item => item.id !== p.id));
                    if (recentPartners.length === 1) setShowReportModal(false);
                  }}
                  className="w-36 h-48 bg-zinc-900 rounded-[30px] overflow-hidden border-2 border-zinc-800 hover:border-red-600 cursor-pointer shadow-2xl relative"
                >
                  <img src={p.screenshot} className="w-full h-full object-cover" alt="partner" />
                </div>
              </div>
            )) : <p className="text-zinc-600 font-bold uppercase">Geçmiş Yok</p>}
          </div>
          <button onClick={() => setShowReportModal(false)} className="bg-zinc-800 px-12 py-4 rounded-2xl font-black uppercase text-xs">Kapat</button>
        </div>
      )}

      {/* Giriş Modalı */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[40px] max-w-md w-full">
            <h2 className="text-3xl font-black mb-8 italic text-center uppercase tracking-tighter">Ayarlar</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setMyGender("male")} className={`py-4 rounded-2xl font-bold ${myGender === "male" ? "bg-blue-600" : "bg-zinc-800"}`}>ERKEK</button>
                <button onClick={() => setMyGender("female")} className={`py-4 rounded-2xl font-bold ${myGender === "female" ? "bg-pink-600" : "bg-zinc-800"}`}>KADIN</button>
              </div>
              
              {/* Hydration Hatası Çözümü (Select) */}
              {isMounted ? (
                  <select value={searchGender} onChange={(e) => setSearchGender(e.target.value)} className="w-full bg-zinc-800 p-4 rounded-2xl font-bold outline-none border border-zinc-700">
                    <option value="all">HERKES</option>
                    <option value="male">ERKEKLER</option>
                    <option value="female">KADINLAR</option>
                  </select>
              ) : <div className="w-full h-[58px] bg-zinc-800 rounded-2xl animate-pulse" />}

              <button onClick={() => setOnlySameCountry(!onlySameCountry)} className={`w-full py-4 rounded-2xl font-black text-[10px] tracking-widest border-2 ${onlySameCountry ? "border-green-500 text-green-500 bg-green-500/5" : "border-zinc-800 text-zinc-500"}`}>
                {onlySameCountry ? "✓ YEREL MOD" : "KÜRESEL MOD"}
              </button>
              <button onClick={handleStart} className="w-full bg-blue-600 py-5 rounded-3xl font-black text-xl shadow-xl">BAŞLAT</button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col md:flex-row p-4 gap-4 max-w-7xl mx-auto w-full overflow-hidden">
        <div className="flex-[3] grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative bg-zinc-900 rounded-[35px] overflow-hidden border border-zinc-800 shadow-2xl">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute top-4 left-4 bg-black/40 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest backdrop-blur-md">Sen</div>
          </div>

          <div className="relative bg-zinc-900 rounded-[35px] overflow-hidden border border-zinc-800 shadow-2xl flex items-center justify-center">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            {partnerId && (
              <button onClick={() => setShowReportModal(true)} className="absolute top-4 right-4 bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white px-4 py-2 rounded-xl text-[10px] font-black border border-red-600/30 uppercase">Bildir</button>
            )}
            {isSearching && (
              <div className="absolute inset-0 bg-zinc-950/90 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
                <p className="text-[10px] font-black text-blue-500 tracking-[0.4em] uppercase animate-pulse">{waitingStatus}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 bg-zinc-900/50 rounded-[35px] border border-zinc-800 flex flex-col overflow-hidden backdrop-blur-md shadow-2xl">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.sender === userName ? "items-end" : "items-start"}`}>
                <div className={`px-4 py-2 rounded-2xl text-[13px] font-medium ${msg.sender === userName ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-300"}`}>{msg.text}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Hydration Hatası Çözümü (Form & Input) */}
          <div className="p-4 bg-zinc-950/50">
            {isMounted ? (
              <form onSubmit={sendMessage}>
                <input 
                  value={inputText} 
                  onChange={(e) => setInputText(e.target.value)} 
                  type="text" 
                  placeholder="Mesaj yaz..." 
                  className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl outline-none text-xs focus:border-blue-600 transition-all" 
                />
              </form>
            ) : <div className="w-full h-[50px] bg-zinc-900 rounded-2xl animate-pulse" />}
          </div>
        </div>
      </main>

      <footer className="p-8 flex justify-center bg-zinc-950">
        <button onClick={handleNext} disabled={isSearching} className="bg-white text-black px-24 py-5 rounded-[28px] font-black text-xl hover:bg-zinc-200 transition-all disabled:bg-zinc-800 uppercase tracking-tighter shadow-2xl">
          {isSearching ? "Bekleyin" : "Sıradaki"}
        </button>
      </footer>
    </div>
  );
}