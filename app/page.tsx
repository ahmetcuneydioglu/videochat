"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

if (typeof window !== "undefined" && typeof (window as any).global === "undefined") {
  (window as any).global = window;
}

const socket = io("https://videochat-1qxi.onrender.com/", {
  transports: ["websocket"],
  secure: true
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

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
      remoteVideoRef.current.play().catch(e => console.error("Video oynatma hatası:", e));
    }
  }, [partnerId]);

  useEffect(() => {
    async function startCamera() {
      if (streamRef.current) return;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
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
      socket.off("banned"); socket.off("waiting_msg"); socket.off("partner_found");
      socket.off("partner_disconnected"); socket.off("signal");
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
    const peer = new Peer({ initiator, trickle: false, stream: streamRef.current });
    peer.on("signal", (data) => socket.emit("signal", { to: targetId, signal: data }));
    peer.on("stream", (remStream) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remStream; });
    peer.on("data", (data) => {
      const msg = new TextDecoder().decode(data);
      setMessages((prev) => [...prev, { sender: "Yabancı", text: msg }]);
    });
    peerRef.current = peer;
  }

  const handleStart = () => { if (!myGender) return alert("Cinsiyet seçin!"); setShowModal(false); handleNext(); };
  const handleNext = () => {
    if (partnerId) captureAndSavePartner(partnerId);
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setPartnerId(null); setPartnerCountry(null); setIsSearching(true);
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

  if (isBanned) return <div className="min-h-screen bg-black flex items-center justify-center text-white"><h1>Erişim Engellendi</h1></div>;

  return (
    <div className="h-screen bg-[#121212] text-white flex flex-col font-sans overflow-hidden">
      
      {/* Üst Bar */}
      <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-md">
        <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
            <h1 className="text-xl font-black italic tracking-tighter">VIDEOCHAT</h1>
        </div>
        <div className="flex items-center gap-4">
           {partnerCountry && <span className="text-[10px] font-bold bg-zinc-800 px-3 py-1 rounded-full uppercase text-zinc-400">🌍 {partnerCountry}</span>}
           <button onClick={() => setShowReportModal(true)} className="text-[10px] font-black text-red-500 hover:bg-red-500/10 px-3 py-1 rounded-lg border border-red-500/20 uppercase transition-all">Bildir</button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        
        {/* SOL: DİKEY KAMERALAR */}
        <div className="w-[320px] md:w-[420px] lg:w-[480px] flex flex-col gap-1 p-1 bg-black border-r border-zinc-800">
          {/* Partner */}
          <div className="flex-1 relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800 shadow-inner">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest backdrop-blur-sm">Yabancı</div>
            {isSearching && (
              <div className="absolute inset-0 bg-zinc-950/95 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-[9px] font-black text-blue-500 tracking-[0.3em] uppercase animate-pulse">{waitingStatus}</p>
              </div>
            )}
          </div>
          {/* Sen */}
          <div className="flex-1 relative bg-zinc-900 rounded-xl overflow-hidden border border-zinc-800">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-[9px] font-bold uppercase tracking-widest backdrop-blur-sm">Sen</div>
          </div>
        </div>

        {/* SAĞ: CHAT ALANI (BEYAZ TEMA) */}
        <div className="flex-1 flex flex-col bg-white text-black relative">
          <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
            <div className="text-center text-[10px] text-zinc-400 font-bold uppercase tracking-widest border-b border-zinc-100 pb-4 mb-4">
              Sohbet odasına bağlandınız
            </div>
            {messages.map((msg, idx) => (
              <div key={idx} className="flex gap-2 items-start leading-tight">
                <span className={`font-black text-[13px] uppercase min-w-[60px] ${msg.sender === userName ? "text-blue-600" : "text-red-600"}`}>
                  {msg.sender}:
                </span>
                <span className="text-[14px] font-medium text-zinc-800">{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Alt Kontroller */}
          <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex items-center gap-3">
            <button 
              onClick={handleNext} 
              disabled={isSearching}
              className="bg-zinc-900 text-white px-8 py-4 rounded-xl font-black text-sm hover:bg-black transition-all uppercase tracking-tighter disabled:opacity-50"
            >
              {isSearching ? "..." : "SIRADAKİ"}
            </button>
            
            {isMounted ? (
              <form onSubmit={sendMessage} className="flex-1 flex gap-2">
                <input 
                  value={inputText} 
                  onChange={(e) => setInputText(e.target.value)} 
                  type="text" 
                  placeholder="Mesaj gönder..." 
                  className="flex-1 bg-white border border-zinc-300 p-4 rounded-xl outline-none text-sm focus:border-blue-500 transition-all shadow-sm" 
                />
                <button type="submit" className="bg-blue-600 text-white px-6 py-4 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-md">GÖNDER</button>
              </form>
            ) : <div className="flex-1 h-[56px] bg-zinc-100 rounded-xl animate-pulse" />}
          </div>
        </div>
      </main>

      {/* Rapor Modalı */}
      {showReportModal && (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-4">
          <h2 className="text-xl font-black mb-8 italic uppercase tracking-tighter">Kötüye Kullanımı Bildir</h2>
          <div className="flex gap-4 mb-10">
            {recentPartners.map((p, i) => (
              <div key={i} onClick={() => { socket.emit("report_user", { targetId: p.id, screenshot: p.screenshot }); alert("Raporlandı"); setShowReportModal(false); }}
                className="w-28 h-36 bg-zinc-900 rounded-2xl overflow-hidden border-2 border-zinc-800 hover:border-red-600 cursor-pointer shadow-2xl">
                <img src={p.screenshot} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
          <button onClick={() => setShowReportModal(false)} className="bg-zinc-800 px-10 py-3 rounded-xl font-black uppercase text-[10px]">İptal</button>
        </div>
      )}

      {/* Ayarlar Modalı */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[100] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-[40px] max-w-sm w-full shadow-2xl">
            <h2 className="text-2xl font-black mb-8 italic text-center uppercase tracking-tighter">Sohbet Ayarları</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setMyGender("male")} className={`py-4 rounded-2xl font-bold transition-all ${myGender === "male" ? "bg-blue-600 shadow-lg shadow-blue-600/20" : "bg-zinc-800"}`}>ERKEK</button>
                <button onClick={() => setMyGender("female")} className={`py-4 rounded-2xl font-bold transition-all ${myGender === "female" ? "bg-pink-600 shadow-lg shadow-pink-600/20" : "bg-zinc-800"}`}>KADIN</button>
              </div>
              {isMounted && (
                <select value={searchGender} onChange={(e) => setSearchGender(e.target.value)} className="w-full bg-zinc-800 p-4 rounded-2xl font-bold outline-none border border-zinc-700">
                  <option value="all">HERKES</option>
                  <option value="male">ERKEKLER</option>
                  <option value="female">KADINLAR</option>
                </select>
              )}
              <button onClick={() => setOnlySameCountry(!onlySameCountry)} className={`w-full py-3 rounded-2xl font-black text-[9px] tracking-widest border-2 transition-all ${onlySameCountry ? "border-green-500 text-green-500 bg-green-500/5" : "border-zinc-800 text-zinc-600"}`}>
                {onlySameCountry ? "✓ KENDİ ÜLKEM" : "DÜNYA GENELİ"}
              </button>
              <button onClick={handleStart} className="w-full bg-blue-600 py-5 rounded-3xl font-black text-xl shadow-xl hover:bg-blue-500 transition-all">BAŞLAT</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}