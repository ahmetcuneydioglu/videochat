"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

// Global window fix
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
  const [showSwipeHint, setShowSwipeHint] = useState(false);

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
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      const hasSwiped = localStorage.getItem("hasSwipedBefore");
      if (!hasSwiped) setShowSwipeHint(true);
    }
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
        chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
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
      setMessages([]); setPartnerId(data.partnerId); setPartnerCountry(data.country);
      setIsSearching(false); initiatePeer(data.partnerId, data.initiator);
    });
    socket.on("partner_disconnected", () => {
      if (peerRef.current) peerRef.current.destroy();
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      setPartnerId(null); setPartnerCountry(null); setIsMobileChatOpen(false);
    });
    socket.on("signal", (data) => {
      if (peerRef.current && !(peerRef.current as any).destroyed) peerRef.current.signal(data.signal);
    });
    return () => { socket.off("partner_found"); socket.off("partner_disconnected"); socket.off("signal"); };
  }, [isMounted, partnerId]);

  const onTouchStart = (e: React.TouchEvent) => {
    if (isMobileChatOpen) return; // Chat açıkken swipe'ı engelle (Next kazalarını önler)
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => (touchEndX.current = e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current || isMobileChatOpen) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 50 && !isSearching) {
      handleNext();
    }
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

  const handleNext = () => {
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setPartnerId(null); setIsSearching(true); setIsMobileChatOpen(false);
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
    if (inputText.trim() && peerRef.current) {
      peerRef.current.send(inputText.trim());
      setMessages((prev) => [...prev, { sender: "Ben", text: inputText.trim() }]);
      setInputText("");
    }
  };

  if (!isMounted) return null;

  return (
    <div 
      className="fixed inset-0 bg-black text-white flex flex-col font-sans overflow-hidden touch-none"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* HEADER (Web) */}
      <header className="hidden md:flex h-12 border-b border-zinc-800 items-center justify-between px-4 bg-zinc-900/50 backdrop-blur-md z-50">
        <h1 className="text-lg font-black italic tracking-tighter text-blue-500 uppercase">OMEGPT</h1>
        <div className="flex items-center gap-2">
           {partnerCountry && <span className="text-[9px] font-bold bg-zinc-800 px-2 py-1 rounded-full">🌍 {partnerCountry}</span>}
           <button onClick={handleReport} className="bg-red-600/20 text-red-500 border border-red-500/20 px-3 py-1 rounded-lg text-[10px] font-black uppercase">BİLDİR</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <div className="flex-1 flex flex-col md:w-[450px] lg:w-[500px] bg-black md:border-r border-zinc-800 relative z-10">
          
          {/* ÜST VİDEO: Yabancı */}
          <div className="flex-1 relative bg-zinc-900 overflow-hidden">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute top-4 left-4 z-50 md:hidden">
                <h1 className="text-xl font-black italic text-blue-500 mb-1">OMEGPT</h1>
                {partnerCountry && <span className="text-[10px] font-bold bg-black/60 px-2 py-1 rounded-full">🌍 {partnerCountry}</span>}
            </div>
            {partnerId && (
              <button onClick={handleReport} className="md:hidden absolute top-4 right-4 w-10 h-10 bg-red-600/40 backdrop-blur-md rounded-full flex items-center justify-center border border-red-500/20 z-50 pointer-events-auto">🚩</button>
            )}
          </div>

          {/* ALT VİDEO: Sen */}
          <div className="flex-1 relative bg-zinc-900 overflow-hidden border-t border-white/5">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            
            {/* MOBİL MESAJ İKONU (Chatrandom Tarzı) */}
            <div className="md:hidden absolute bottom-6 right-6 z-[60] pointer-events-auto">
                {partnerId && !isMobileChatOpen && (
                    <button onClick={() => setIsMobileChatOpen(true)} className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-2xl border-2 border-white/20">
                        <span className="text-2xl">💬</span>
                    </button>
                )}
            </div>

            {/* MESAJ ÖNİZLEME (Ekranda Duran Baloncuklar) */}
            {!isMobileChatOpen && (
                <div className="md:hidden absolute bottom-6 left-4 z-40 space-y-2 pointer-events-none">
                    {messages.slice(-2).map((m, i) => (
                        <div key={i} className="bg-black/60 backdrop-blur-md px-3 py-2 rounded-2xl text-[12px] border border-white/10 max-w-[220px] animate-in slide-in-from-left-2">
                            <b className={m.sender === "Ben" ? "text-blue-400" : "text-pink-400"}>{m.sender}:</b> {m.text}
                        </div>
                    ))}
                </div>
            )}
          </div>
        </div>

        {/* WEB CHAT (Değişmedi) */}
        <div className="hidden md:flex flex-1 flex-col bg-white">
          <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-white">
            {messages.map((msg, idx) => (
              <div key={idx} className="flex gap-2 text-black">
                <b className={msg.sender === "Ben" ? "text-blue-600" : "text-red-600"}>{msg.sender}:</b>
                <span>{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-4 bg-zinc-50 border-t flex items-center gap-4">
            <button onClick={handleNext} className="bg-black text-white px-8 py-3 rounded-xl font-bold">NEXT</button>
            <form onSubmit={sendMessage} className="flex-1 flex gap-2">
                <input value={inputText} onChange={(e) => setInputText(e.target.value)} className="flex-1 border p-3 rounded-xl text-black outline-none" />
                <button type="submit" className="bg-blue-600 text-white px-6 rounded-xl">GÖNDER</button>
            </form>
          </div>
        </div>

        {/* --- CHATRANDOM TARZI MOBİL MODAL --- */}
        {isMobileChatOpen && (
            <div className="md:hidden fixed inset-0 z-[100] flex flex-col bg-black/80 backdrop-blur-sm pointer-events-auto">
                {/* Üstte Kapatma Alanı (Boşluğa tıklayınca kapanır) */}
                <div className="flex-1" onClick={() => setIsMobileChatOpen(false)}></div>

                {/* Mesaj Listesi ve Input Alanı */}
                <div className="bg-zinc-900 w-full rounded-t-[30px] flex flex-col max-h-[60%] border-t border-white/10 animate-in slide-in-from-bottom duration-300">
                    <div className="p-4 flex justify-between items-center border-b border-white/5">
                        <span className="text-xs font-bold text-zinc-500 uppercase">Sohbet</span>
                        <button onClick={() => setIsMobileChatOpen(false)} className="text-white bg-zinc-800 w-8 h-8 rounded-full flex items-center justify-center">✕</button>
                    </div>

                    {/* Mesajların Aktığı Yer */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[150px]">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.sender === "Ben" ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${m.sender === "Ben" ? "bg-blue-600" : "bg-zinc-800"}`}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>

                    {/* Input Alanı (Sabitlenmiş) */}
                    <div className="p-4 pb-8">
                        <form onSubmit={sendMessage} className="flex gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
                            <input 
                                autoFocus
                                value={inputText} 
                                onChange={(e) => setInputText(e.target.value)} 
                                placeholder="Mesaj yaz..." 
                                className="flex-1 bg-transparent px-4 py-3 text-sm outline-none text-white" 
                            />
                            <button type="submit" className="bg-blue-600 px-6 rounded-xl text-xs font-bold uppercase">GÖNDER</button>
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
                    <button onClick={() => setMyGender("male")} className={`py-4 rounded-2xl font-bold border-2 transition-all ${myGender === "male" ? "bg-blue-600 border-blue-400" : "bg-zinc-900 border-zinc-800"}`}>ERKEK</button>
                    <button onClick={() => setMyGender("female")} className={`py-4 rounded-2xl font-bold border-2 transition-all ${myGender === "female" ? "bg-pink-600 border-pink-400" : "bg-zinc-900 border-zinc-800"}`}>KADIN</button>
                </div>
                <div className="space-y-3">
                    <select value={searchGender} onChange={(e) => setSearchGender(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl font-bold text-sm outline-none focus:border-blue-500">
                        <option value="all">HERKES</option>
                        <option value="male">ERKEKLER</option>
                        <option value="female">KADINLAR</option>
                    </select>
                    <button onClick={() => setOnlySameCountry(!onlySameCountry)} className={`w-full py-4 rounded-2xl font-black text-[10px] border-2 transition-all ${onlySameCountry ? "border-green-500 text-green-500 bg-green-500/10" : "border-zinc-800 text-zinc-600"}`}>
                        {onlySameCountry ? "✓ KENDİ ÜLKEM" : "DÜNYA GENELİ"}
                    </button>
                </div>
                <button onClick={() => { if(!myGender) return alert("Cinsiyet seçin!"); setShowModal(false); handleNext(); }} className="w-full bg-white text-black py-5 rounded-[30px] font-black text-xl uppercase shadow-2xl">BAŞLAT</button>
            </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes swipe {
          0% { transform: translateX(50px); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateX(-50px); opacity: 0; }
        }
        .animate-in { animation-duration: 0.3s; animation-fill-mode: both; }
        .slide-in-from-bottom { animation-name: slideInBottom; }
        .slide-in-from-left-2 { animation-name: slideInLeft; }
        @keyframes slideInBottom { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideInLeft { from { transform: translateX(-10px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
}