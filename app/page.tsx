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

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

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
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => (touchEndX.current = e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 50 && !isSearching) {
      if (showSwipeHint) {
        setShowSwipeHint(false);
        localStorage.setItem("hasSwipedBefore", "true");
      }
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
      className="fixed inset-0 bg-black text-white flex flex-col font-sans overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* SWIPE İPUCU */}
      {showSwipeHint && !showModal && !isSearching && partnerId && (
        <div className="md:hidden fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/40 pointer-events-none">
          <div className="flex flex-col items-center animate-pulse">
            <div className="relative w-20 h-20">
               <span className="text-5xl absolute animate-[swipe_2s_infinite]">👈</span>
            </div>
            <p className="mt-8 text-[10px] font-black tracking-[0.2em] uppercase bg-blue-600 px-4 py-2 rounded-full shadow-2xl">
              Sıradaki İçin Kaydır
            </p>
          </div>
        </div>
      )}

      {/* ÜST BAR - Mobilde Gizlendi, Web'de duruyor */}
      <header className="hidden md:flex h-12 border-b border-zinc-800 items-center justify-between px-4 bg-zinc-900/50 backdrop-blur-md z-50">
        <h1 className="text-lg font-black italic tracking-tighter text-blue-500">OMEGPT</h1>
        <div className="flex items-center gap-2">
           {partnerCountry && <span className="text-[9px] font-bold bg-zinc-800 px-2 py-1 rounded-full">🌍 {partnerCountry}</span>}
           <button onClick={handleReport} className="bg-red-600/20 text-red-500 border border-red-500/20 px-3 py-1 rounded-lg text-[10px] font-black uppercase">BİLDİR</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* ANA VİDEO ALANI (Yabancı) */}
        <div className="flex-1 relative bg-black overflow-hidden z-10 h-full">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
          
          {/* Mobil Bilgi & Rapor Paneli */}
          <div className="md:hidden absolute top-4 left-4 right-4 flex justify-between items-start z-50 pointer-events-none">
             <div className="flex flex-col gap-2">
                <h1 className="text-xl font-black italic tracking-tighter text-blue-500 bg-black/20 px-2 py-1 rounded-lg backdrop-blur-sm w-fit">OMEGPT</h1>
                {partnerCountry && <span className="text-[10px] font-bold bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 w-fit">🌍 {partnerCountry}</span>}
             </div>
             {partnerId && (
                <button onClick={handleReport} className="pointer-events-auto w-10 h-10 bg-red-600/40 backdrop-blur-md rounded-full flex items-center justify-center border border-red-500/20">🚩</button>
             )}
          </div>

          <div className="absolute bottom-4 left-4 bg-black/40 px-2 py-1 rounded text-[8px] font-bold uppercase z-20">Yabancı</div>
          
          {isSearching && (
            <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-[70]">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-[9px] font-black text-blue-500 animate-pulse uppercase">ARANIYOR...</p>
            </div>
          )}

          {/* MOBİL: KENDİ VİDEON (Sağ altta yüzer şekilde) */}
          <div className="md:hidden absolute bottom-24 right-4 w-28 h-40 z-40 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
              <div className="absolute top-2 left-2 bg-black/40 px-1.5 py-0.5 rounded text-[7px] font-bold uppercase">Sen</div>
          </div>

          {/* MOBİL MESAJ İKONU */}
          <div className="md:hidden absolute bottom-6 right-4 z-50">
            {partnerId && !isMobileChatOpen && (
              <button 
                  onClick={() => setIsMobileChatOpen(true)}
                  className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-2xl border-4 border-black/20"
              >
                  <span className="text-xl">💬</span>
              </button>
            )}
          </div>

          {/* MOBİL MESAJ ÖNİZLEME (Sol Alt) */}
          {!isMobileChatOpen && (
            <div className="md:hidden absolute bottom-6 left-4 z-40 space-y-1 flex flex-col items-start pointer-events-none">
                {messages.slice(-2).map((m, i) => (
                    <div key={i} className="bg-black/60 backdrop-blur-md px-3 py-2 rounded-2xl text-[11px] border border-white/5 max-w-[200px] animate-in slide-in-from-left-2">
                        <b className={m.sender === "Ben" ? "text-blue-400" : "text-pink-400"}>{m.sender}:</b> {m.text}
                    </div>
                ))}
            </div>
          )}
        </div>

        {/* WEB CHAT ALANI (Sadece Masaüstü) */}
        <div className="hidden md:flex w-[400px] flex-col bg-white border-l border-zinc-200">
          <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-white">
            {messages.map((msg, idx) => (
              <div key={idx} className="flex gap-2">
                <span className={`font-black text-[13px] uppercase min-w-[70px] ${msg.sender === "Ben" ? "text-blue-600" : "text-red-600"}`}>{msg.sender}:</span>
                <span className="text-[14px] font-medium text-zinc-800">{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex items-center gap-4">
            <button onClick={handleNext} disabled={isSearching} className="bg-black text-white px-10 py-4 rounded-2xl font-black text-sm uppercase hover:bg-zinc-800 transition-all">NEXT</button>
            <form onSubmit={sendMessage} className="flex-1 flex gap-2">
                <input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Mesaj yaz..." className="flex-1 bg-white border border-zinc-300 p-4 rounded-2xl text-black text-sm outline-none" />
                <button type="submit" className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold uppercase">GÖNDER</button>
            </form>
          </div>
        </div>

        {/* MOBİL MESAJ GİRİŞ PANELİ (Açılır/Kapanır) */}
        {isMobileChatOpen && (
            <div className="md:hidden fixed inset-x-0 bottom-0 bg-zinc-900/95 backdrop-blur-3xl p-4 border-t border-white/10 z-[100] animate-in slide-in-from-bottom">
                <div className="flex items-center justify-between mb-3 px-2">
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Sohbet</span>
                    <button onClick={() => setIsMobileChatOpen(false)} className="text-white text-xs bg-zinc-800 px-3 py-1 rounded-full">Kapat ✕</button>
                </div>
                <form onSubmit={sendMessage} className="flex gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
                    <input 
                        autoFocus
                        value={inputText} 
                        onChange={(e) => setInputText(e.target.value)} 
                        placeholder="Mesaj gönder..." 
                        className="flex-1 bg-transparent px-4 py-3 text-sm outline-none text-white" 
                    />
                    <button type="submit" className="bg-blue-600 px-6 rounded-xl text-xs font-bold uppercase">OK</button>
                </form>
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
                <button onClick={() => { if(!myGender) return alert("Cinsiyetinizi seçin!"); setShowModal(false); handleNext(); }} className="w-full bg-white text-black py-5 rounded-[30px] font-black text-xl uppercase shadow-2xl hover:bg-zinc-200 transition-all">BAŞLAT</button>
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