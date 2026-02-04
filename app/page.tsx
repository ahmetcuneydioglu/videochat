"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

if (typeof window !== "undefined" && typeof (window as any).global === "undefined") {
  (window as any).global = window;
}

const socket = io("https://videochat-1qxi.onrender.com/", { transports: ["websocket"], secure: true });

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const peerRef = useRef<Peer.Instance | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const [showModal, setShowModal] = useState(true);
  const [myGender, setMyGender] = useState<string | null>(null);
  const [searchGender, setSearchGender] = useState("all");
  const [onlySameCountry, setOnlySameCountry] = useState(false);
  const [partnerCountry, setPartnerCountry] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ sender: string, text: string }[]>([]);
  const [inputText, setInputText] = useState("");
  
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Mesajlar gelince otomatik kaydır
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isMobileChatOpen]);

  useEffect(() => {
    async function startCamera() {
      try {
        const userStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        streamRef.current = userStream;
        if (localVideoRef.current) localVideoRef.current.srcObject = userStream;
      } catch (err) { console.error("Kamera hatası:", err); }
    }
    if (isMounted) startCamera();

    socket.on("partner_found", (data) => {
      setMessages([]); 
      setPartnerId(data.partnerId); 
      setPartnerCountry(data.country);
      setIsSearching(false); 
      initiatePeer(data.partnerId, data.initiator);
    });

    socket.on("partner_disconnected", () => {
      if (peerRef.current) peerRef.current.destroy();
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      setPartnerId(null); 
      setPartnerCountry(null); 
      setIsMobileChatOpen(false);
    });

    socket.on("signal", (data) => {
      if (peerRef.current && !(peerRef.current as any).destroyed) {
        peerRef.current.signal(data.signal);
      }
    });

    return () => {
      socket.off("partner_found");
      socket.off("partner_disconnected");
      socket.off("signal");
    };
  }, [isMounted, partnerId]);

  function initiatePeer(targetId: string, initiator: boolean) {
    if (!streamRef.current) return;
    
    // Peer nesnesini oluştururken Data Channel'ı açık tut
    const peer = new Peer({ 
      initiator, 
      trickle: false, 
      stream: streamRef.current,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } 
    });

    peer.on("signal", (data) => socket.emit("signal", { to: targetId, signal: data }));
    
    peer.on("stream", (remStream) => { 
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remStream; 
    });

    // MESAJ ALMA BURADA TETİKLENİR
    peer.on("data", (data) => {
      const msg = new TextDecoder().decode(data);
      setMessages((prev) => [...prev, { sender: "Yabancı", text: msg }]);
    });

    peerRef.current = peer;
  }

  const handleNext = () => {
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setPartnerId(null); 
    setIsSearching(true); 
    setIsMobileChatOpen(false);
    socket.emit("find_partner", { myGender, searchGender, onlySameCountry });
  };

  const handleReport = () => {
    if (partnerId) {
        const canvas = document.createElement("canvas");
        canvas.width = 160; canvas.height = 120;
        const ctx = canvas.getContext("2d");
        if (remoteVideoRef.current) ctx?.drawImage(remoteVideoRef.current, 0, 0, canvas.width, canvas.height);
        socket.emit("report_user", { targetId: partnerId, screenshot: canvas.toDataURL("image/jpeg", 0.5) });
        alert("Raporlandı.");
        handleNext();
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && peerRef.current && (peerRef.current as any).connected) {
      peerRef.current.send(inputText.trim());
      setMessages((prev) => [...prev, { sender: "Ben", text: inputText.trim() }]);
      setInputText("");
    }
  };

  // Swipe İşlemleri
  const onTouchStart = (e: React.TouchEvent) => {
    if (isMobileChatOpen) return;
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => (touchEndX.current = e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current || isMobileChatOpen) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 70 && !isSearching) handleNext();
  };

  if (!isMounted) return null;

  return (
    <div 
      className="fixed inset-0 bg-black text-white flex flex-col font-sans overflow-hidden touch-none"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* ÜST BAR (WEB) */}
      <header className="hidden md:flex h-12 border-b border-zinc-800 items-center justify-between px-4 bg-zinc-900/50 backdrop-blur-md z-[100]">
        <h1 className="text-lg font-black italic tracking-tighter text-blue-500 uppercase">OMEGPT</h1>
        <div className="flex items-center gap-2">
           {partnerCountry && <span className="text-[9px] font-bold bg-zinc-800 px-2 py-1 rounded-full">🌍 {partnerCountry}</span>}
           <button onClick={handleReport} className="bg-red-600/20 text-red-500 border border-red-500/20 px-3 py-1 rounded-lg text-[10px] font-black uppercase">BİLDİR</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* KAMERALAR */}
        <div className="flex-1 flex flex-col md:w-[450px] lg:w-[500px] h-full bg-black md:border-r border-zinc-800 relative">
          
          {/* Yabancı Video */}
          <div className="flex-1 relative overflow-hidden bg-zinc-900 border-b border-white/5">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            
            {/* Mobil Overlay */}
            <div className="md:hidden absolute top-4 left-4 z-50">
                <h1 className="text-xl font-black italic tracking-tighter text-blue-500 bg-black/30 px-2 py-1 rounded">OMEGPT</h1>
                {partnerCountry && <div className="mt-1 text-[10px] font-bold bg-black/60 px-2 py-1 rounded-full border border-white/10 w-fit">🌍 {partnerCountry}</div>}
            </div>

            {partnerId && (
              <button onClick={handleReport} className="md:hidden absolute top-4 right-4 w-10 h-10 bg-red-600/40 backdrop-blur-md rounded-full flex items-center justify-center border border-red-500/20 z-50 pointer-events-auto">🚩</button>
            )}

            {isSearching && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-[60]">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-[9px] font-black text-blue-500 animate-pulse uppercase">ARANIYOR...</p>
              </div>
            )}
          </div>

          {/* Senin Videon */}
          <div className="flex-1 relative overflow-hidden bg-zinc-900">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute top-4 left-4 bg-black/40 px-2 py-1 rounded text-[8px] font-bold uppercase z-20">Sen</div>

            {/* SAĞ ALT MESAJ İKONU */}
            <div className="md:hidden absolute bottom-6 right-6 z-[70] pointer-events-auto">
                {partnerId && !isMobileChatOpen && (
                    <button 
                        onClick={(e) => { e.stopPropagation(); setIsMobileChatOpen(true); }}
                        className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)] border-2 border-white/20 active:scale-90 transition-transform"
                    >
                        <span className="text-3xl text-white">💬</span>
                    </button>
                )}
            </div>

            {/* MESAJ ÖNİZLEME (Kameranın üstünde) */}
            {!isMobileChatOpen && (
                <div className="md:hidden absolute bottom-6 left-4 z-40 space-y-2 pointer-events-none">
                    {messages.slice(-2).map((m, i) => (
                        <div key={i} className="bg-black/60 backdrop-blur-md px-3 py-2 rounded-2xl text-[12px] border border-white/10 max-w-[220px] animate-in slide-in-from-left-2 shadow-lg">
                            <b className={m.sender === "Ben" ? "text-blue-400" : "text-pink-400"}>{m.sender}:</b> {m.text}
                        </div>
                    ))}
                </div>
            )}
          </div>
        </div>

        {/* WEB CHAT (SAĞ PANEL) */}
        <div className="hidden md:flex w-[400px] flex-col bg-white border-l border-zinc-200">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className="flex gap-2 text-sm">
                <b className={msg.sender === "Ben" ? "text-blue-600" : "text-red-600"}>{msg.sender}:</b>
                <span className="text-zinc-800">{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-4 bg-zinc-50 border-t flex items-center gap-3">
            <button onClick={handleNext} className="bg-black text-white px-6 py-3 rounded-xl font-bold uppercase text-xs">Next</button>
            <form onSubmit={sendMessage} className="flex-1 flex gap-2">
                <input value={inputText} onChange={(e) => setInputText(e.target.value)} className="flex-1 border border-zinc-300 p-3 rounded-xl text-black outline-none focus:border-blue-500" placeholder="Mesaj yaz..." />
                <button type="submit" className="bg-blue-600 text-white px-5 rounded-xl font-bold">GÖNDER</button>
            </form>
          </div>
        </div>

        {/* --- MOBİL CHAT MODALI (CHATRANDOM STİLİ) --- */}
        {isMobileChatOpen && (
            <div className="md:hidden fixed inset-0 z-[100] flex flex-col bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                {/* Boşluğa tıklayınca kapatma */}
                <div className="flex-1" onClick={() => setIsMobileChatOpen(false)}></div>

                <div className="bg-zinc-950 w-full rounded-t-[30px] flex flex-col border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] h-[60%] animate-in slide-in-from-bottom duration-300">
                    <div className="p-4 flex justify-between items-center border-b border-white/5">
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-[11px] font-black text-zinc-400 uppercase tracking-widest">Canlı Sohbet</span>
                        </div>
                        <button onClick={() => setIsMobileChatOpen(false)} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center text-white text-lg">✕</button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                        {messages.length === 0 && <p className="text-center text-zinc-600 text-[10px] mt-10 italic">Henüz mesaj yok. İlk adımı sen at!</p>}
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.sender === "Ben" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[13px] shadow-sm ${m.sender === "Ben" ? "bg-blue-600 text-white rounded-tr-none" : "bg-zinc-800 text-zinc-200 rounded-tl-none"}`}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="p-4 bg-zinc-900/50 border-t border-white/5 safe-area-pb">
                        <form onSubmit={sendMessage} className="flex gap-2 bg-white/5 p-1.5 rounded-2xl border border-white/10 focus-within:border-blue-500/50 transition-colors">
                            <input 
                                autoFocus
                                value={inputText} 
                                onChange={(e) => setInputText(e.target.value)} 
                                placeholder="Mesajınızı yazın..." 
                                className="flex-1 bg-transparent px-4 py-3 text-sm outline-none text-white" 
                            />
                            <button type="submit" className="bg-blue-600 text-white px-6 rounded-xl text-xs font-black uppercase shadow-lg shadow-blue-600/20 active:scale-95">GÖNDER</button>
                        </form>
                    </div>
                </div>
            </div>
        )}
      </main>

      {/* GİRİŞ MODALI */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[200] flex items-center justify-center p-6 text-center">
            <div className="max-w-xs w-full space-y-6">
                <h2 className="text-3xl font-black italic tracking-tighter text-blue-500 uppercase">OMEGPT</h2>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setMyGender("male")} className={`py-4 rounded-2xl font-bold border-2 transition-all ${myGender === "male" ? "bg-blue-600 border-blue-400 scale-95" : "bg-zinc-900 border-zinc-800 opacity-60"}`}>ERKEK</button>
                    <button onClick={() => setMyGender("female")} className={`py-4 rounded-2xl font-bold border-2 transition-all ${myGender === "female" ? "bg-pink-600 border-pink-400 scale-95" : "bg-zinc-900 border-zinc-800 opacity-60"}`}>KADIN</button>
                </div>
                <div className="space-y-3">
                    <select value={searchGender} onChange={(e) => setSearchGender(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl font-bold text-sm outline-none appearance-none">
                        <option value="all">HERKESLE EŞLEŞ</option>
                        <option value="male">ERKEKLERLE EŞLEŞ</option>
                        <option value="female">KADINLARLA EŞLEŞ</option>
                    </select>
                </div>
                <button onClick={() => { if(!myGender) return alert("Cinsiyet seçin!"); setShowModal(false); handleNext(); }} className="w-full bg-white text-black py-5 rounded-[30px] font-black text-xl uppercase shadow-2xl active:bg-blue-500 active:text-white transition-all">BAŞLAT</button>
            </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
        @keyframes swipe { 0% { transform: translateX(50px); opacity: 0; } 50% { opacity: 1; } 100% { transform: translateX(-50px); opacity: 0; } }
        .animate-in { animation-duration: 0.3s; animation-fill-mode: both; }
        .slide-in-from-bottom { animation-name: slideInBottom; }
        .slide-in-from-left-2 { animation-name: slideInLeft; }
        .fade-in { animation-name: fadeIn; }
        @keyframes slideInBottom { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideInLeft { from { transform: translateX(-15px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .safe-area-pb { padding-bottom: env(safe-area-inset-bottom); }
      `}</style>
    </div>
  );
}