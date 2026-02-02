"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

// Global tanımlamalar
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

  // Swipe ve İpucu State'leri
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

  useEffect(() => {
    setIsMounted(true);
    // Daha önce swipe yapmış mı kontrol et
    const hasSwiped = localStorage.getItem("hasSwipedBefore");
    if (!hasSwiped) {
      setShowSwipeHint(true);
    }
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Socket ve Peer mantığı (Önceki stabil yapı)
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
      setPartnerId(null); setPartnerCountry(null);
    });
    socket.on("signal", (data) => {
      if (peerRef.current && !(peerRef.current as any).destroyed) peerRef.current.signal(data.signal);
    });
    return () => { socket.off("partner_found"); socket.off("partner_disconnected"); socket.off("signal"); };
  }, [isMounted, partnerId]);

  // SWIPE DEDEKTÖRÜ & İPUCU GİZLEME
  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => (touchEndX.current = e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 50 && !isSearching) {
      // Başarılı swipe: İpucunu kaldır ve kaydet
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
    setPartnerId(null); setIsSearching(true);
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
      
      {/* SWIPE İPUCU (Sadece Mobilde ve İlk Kez Girenlere) */}
      {showSwipeHint && !showModal && !isSearching && partnerId && (
        <div className="md:hidden fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/40 pointer-events-none">
          <div className="flex flex-col items-center animate-pulse">
            <div className="relative w-20 h-20">
               {/* El İkonu Animasyonu */}
               <span className="text-5xl absolute animate-[swipe_2s_infinite]">👈</span>
            </div>
            <p className="mt-8 text-xs font-black tracking-[0.2em] uppercase bg-blue-600 px-4 py-2 rounded-full shadow-2xl">
              Sıradaki İçin Kaydır
            </p>
          </div>
        </div>
      )}

      {/* ÜST BAR */}
      <header className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/50 backdrop-blur-md z-50">
        <h1 className="text-lg font-black italic tracking-tighter text-blue-500">VIDEOCHAT</h1>
        <div className="flex items-center gap-2">
           {partnerCountry && <span className="text-[9px] font-bold bg-zinc-800 px-2 py-1 rounded-full">🌍 {partnerCountry}</span>}
           <button onClick={handleReport} className="hidden md:block bg-red-600/20 text-red-500 border border-red-500/20 px-3 py-1 rounded-lg text-[10px] font-black uppercase">BİLDİR</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* KAMERALAR */}
        <div className="w-full md:w-[450px] lg:w-[500px] h-full flex flex-col gap-[1px] bg-black border-r border-zinc-800 relative z-10">
          <div className="flex-1 relative bg-zinc-900 overflow-hidden">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            {isSearching && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-[9px] font-black text-blue-500 animate-pulse uppercase">ARANIYOR...</p>
              </div>
            )}
          </div>

          <div className="flex-1 relative bg-zinc-900 overflow-hidden">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <div className="md:hidden absolute inset-0 flex flex-col justify-end p-4 pointer-events-none">
                {partnerId && (
                  <button onClick={handleReport} className="pointer-events-auto self-end mb-2 w-10 h-10 bg-red-600/40 backdrop-blur-md rounded-full flex items-center justify-center border border-red-500/20 text-xs">🚩</button>
                )}
                <div className="space-y-1 mb-4">
                    {messages.slice(-3).map((m, i) => (
                        <div key={i} className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-xl text-[10px] inline-block border border-white/5">
                            <b className={m.sender === "Ben" ? "text-blue-400" : "text-pink-400"}>{m.sender}:</b> {m.text}
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-2 pointer-events-auto">
                    <button onClick={handleNext} disabled={isSearching} className="h-12 px-6 bg-white text-black rounded-2xl font-black text-xs">NEXT</button>
                    <form onSubmit={sendMessage} className="flex-1 flex gap-1 bg-black/40 backdrop-blur-xl border border-white/10 p-1 rounded-2xl">
                        <input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Mesaj..." className="flex-1 bg-transparent px-3 py-2 text-xs outline-none" />
                        <button type="submit" className="bg-blue-600 px-4 py-2 rounded-xl text-[10px] font-bold">OK</button>
                    </form>
                </div>
            </div>
          </div>
        </div>

        {/* WEB CHAT ALANI */}
        <div className="hidden md:flex flex-1 flex-col bg-white">
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
            <button onClick={handleNext} disabled={isSearching} className="bg-black text-white px-10 py-4 rounded-2xl font-black text-sm">NEXT</button>
            <form onSubmit={sendMessage} className="flex-1 flex gap-2">
                <input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Mesaj yaz..." className="flex-1 bg-white border border-zinc-300 p-4 rounded-2xl text-black text-sm" />
                <button type="submit" className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold">GÖNDER</button>
            </form>
          </div>
        </div>
      </main>

      {/* GİRİŞ MODALI */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[100] flex items-center justify-center p-6 text-center">
            <div className="max-w-xs w-full space-y-6">
                <h2 className="text-3xl font-black italic tracking-tighter text-blue-500 uppercase">VIDEOCHAT</h2>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setMyGender("male")} className={`py-4 rounded-2xl font-bold border-2 ${myGender === "male" ? "bg-blue-600 border-blue-400" : "bg-zinc-900"}`}>ERKEK</button>
                    <button onClick={() => setMyGender("female")} className={`py-4 rounded-2xl font-bold border-2 ${myGender === "female" ? "bg-pink-600 border-pink-400" : "bg-zinc-900"}`}>KADIN</button>
                </div>
                <div className="space-y-3">
                    <select value={searchGender} onChange={(e) => setSearchGender(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl font-bold text-sm">
                        <option value="all">HERKES</option>
                        <option value="male">ERKEKLER</option>
                        <option value="female">KADINLAR</option>
                    </select>
                    <button onClick={() => setOnlySameCountry(!onlySameCountry)} className={`w-full py-4 rounded-2xl font-black text-[10px] border-2 ${onlySameCountry ? "border-green-500 text-green-500" : "border-zinc-800 text-zinc-600"}`}>
                        {onlySameCountry ? "✓ KENDİ ÜLKEM" : "DÜNYA GENELİ"}
                    </button>
                </div>
                <button onClick={() => { if(!myGender) return alert("Seçin!"); setShowModal(false); handleNext(); }} className="w-full bg-white text-black py-5 rounded-[30px] font-black text-xl uppercase">BAŞLAT</button>
            </div>
        </div>
      )}

      {/* Animasyon CSS'i */}
      <style jsx global>{`
        @keyframes swipe {
          0% { transform: translateX(50px); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateX(-50px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}