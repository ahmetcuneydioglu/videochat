"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

// Global window fix (Simple-peer için)
if (typeof window !== "undefined" && typeof (window as any).global === "undefined") {
  (window as any).global = window;
}

const socket = io("https://videochat-1qxi.onrender.com/", { transports: ["websocket"], secure: true });

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mobileChatEndRef = useRef<HTMLDivElement>(null);
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
  
  // MOBİL INPUT AÇIK MI?
  const [isMobileInputActive, setIsMobileInputActive] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Mesaj akışını takip et
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    mobileChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      setIsMobileInputActive(false);
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
    setIsMobileInputActive(false);
    socket.emit("find_partner", { myGender, searchGender, onlySameCountry });
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
    if (isMobileInputActive) return;
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => (touchEndX.current = e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current || isMobileInputActive) return;
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
      {/* HEADER (Web) */}
      <header className="hidden md:flex h-12 border-b border-zinc-800 items-center justify-between px-4 bg-zinc-900/50 backdrop-blur-md z-[100]">
        <h1 className="text-lg font-black italic tracking-tighter text-blue-500 uppercase">OMEGPT</h1>
        <div className="flex items-center gap-2">
           {partnerCountry && <span className="text-[9px] font-bold bg-zinc-800 px-2 py-1 rounded-full">🌍 {partnerCountry}</span>}
           <button onClick={handleNext} className="bg-zinc-800 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase">NEXT</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* KAMERALAR */}
        <div className="flex-1 flex flex-col md:w-[450px] lg:w-[500px] h-full bg-black md:border-r border-zinc-800 relative">
          
          {/* Yabancı Video */}
          <div className="flex-1 relative overflow-hidden bg-zinc-900 border-b border-white/5">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="md:hidden absolute top-4 left-4 z-50">
                <h1 className="text-xl font-black italic tracking-tighter text-blue-500 bg-black/30 px-2 py-1 rounded">OMEGPT</h1>
                {partnerCountry && <div className="mt-1 text-[10px] font-bold bg-black/60 px-2 py-1 rounded-full border border-white/10 w-fit">🌍 {partnerCountry}</div>}
            </div>
          </div>

          {/* Senin Videon & Akış */}
          <div className="flex-1 relative overflow-hidden bg-zinc-900">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            
            {/* MESAJ AKIŞI (Kamera Üzerinde Sınırsız Akış) */}
            <div className="md:hidden absolute bottom-20 left-4 right-16 z-40 flex flex-col justify-end max-h-[150px] overflow-y-auto pointer-events-none no-scrollbar">
                <div className="flex flex-col gap-1.5 p-2">
                    {messages.map((m, i) => (
                        <div key={i} className="bg-black/50 backdrop-blur-md px-3 py-1.5 rounded-2xl text-[12px] border border-white/5 w-fit max-w-full break-words animate-in slide-in-from-left-2">
                            <b className={m.sender === "Ben" ? "text-blue-400" : "text-pink-400"}>{m.sender}:</b> {m.text}
                        </div>
                    ))}
                    <div ref={mobileChatEndRef} />
                </div>
            </div>

            {/* SAĞ ALT MESAJ İKONU */}
            <div className="md:hidden absolute bottom-6 right-4 z-50 pointer-events-auto">
                {partnerId && (
                    <button 
                        onClick={() => setIsMobileInputActive(!isMobileInputActive)}
                        className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isMobileInputActive ? 'bg-zinc-800 rotate-90' : 'bg-blue-600 shadow-[0_0_20px_rgba(37,99,235,0.4)]'}`}
                    >
                        <span className="text-2xl text-white">{isMobileInputActive ? '✕' : '💬'}</span>
                    </button>
                )}
            </div>

            {/* MOBİL INPUT (Videonun tam üzerine binen kararlı çubuk) */}
            {isMobileInputActive && (
                <div className="md:hidden absolute bottom-6 left-4 right-20 z-50 animate-in slide-in-from-bottom-2 duration-200">
                    <form onSubmit={sendMessage} className="flex bg-black/80 backdrop-blur-2xl border border-white/20 p-1 rounded-full shadow-2xl">
                        <input 
                            autoFocus
                            value={inputText} 
                            onChange={(e) => setInputText(e.target.value)} 
                            placeholder="Mesaj yaz..." 
                            className="flex-1 bg-transparent px-4 py-2 text-sm outline-none text-white w-full" 
                        />
                        <button type="submit" className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform">
                             <span className="text-xs font-bold">➤</span>
                        </button>
                    </form>
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
                <button type="submit" className="bg-blue-600 text-white px-5 rounded-xl font-bold">➤</button>
            </form>
          </div>
        </div>
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
                <button onClick={() => { if(!myGender) return alert("Cinsiyet seçin!"); setShowModal(false); handleNext(); }} className="w-full bg-white text-black py-5 rounded-[30px] font-black text-xl uppercase shadow-2xl transition-all">BAŞLAT</button>
            </div>
        </div>
      )}

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .animate-in { animation-duration: 0.3s; animation-fill-mode: both; }
        .slide-in-from-bottom-2 { animation-name: slideInBottom2; }
        .slide-in-from-left-2 { animation-name: slideInLeft; }
        @keyframes slideInBottom2 { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideInLeft { from { transform: translateX(-15px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
}