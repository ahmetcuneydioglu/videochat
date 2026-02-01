"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

// Socket bağlantısı (Kendi URL'nizle güncel kalmalı)
const socket = io("https://videochat-1qxi.onrender.com/", { transports: ["websocket"], secure: true });

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const peerRef = useRef<Peer.Instance | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [showModal, setShowModal] = useState(true);
  const [myGender, setMyGender] = useState<string | null>(null);
  const [searchGender, setSearchGender] = useState("all");
  const [partnerCountry, setPartnerCountry] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ sender: string, text: string }[]>([]);
  const [inputText, setInputText] = useState("");
  
  // YENİ: Mobil Chat Kontrolleri
  const [isChatOpen, setIsChatOpen] = useState(false);

  useEffect(() => { setIsMounted(true); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Peer ve Socket Logic (Önceki stabil çalışan mantık...)
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
    socket.emit("find_partner", { myGender, searchGender });
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && peerRef.current) {
      peerRef.current.send(inputText.trim());
      setMessages((prev) => [...prev, { sender: "Ben", text: inputText.trim() }]);
      setInputText("");
      // Mobilde klavye kapansın diye chat alanını opsiyonel kapatabiliriz
    }
  };

  if (!isMounted) return null;

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col font-sans overflow-hidden select-none">
      
      {/* ANA VİDEO ALANI (Full Screen) */}
      <main className="flex-1 relative flex flex-col md:flex-row overflow-hidden">
        
        {/* Kameralar Sütunu */}
        <div className="flex-1 flex flex-col md:flex-row h-full w-full bg-black gap-[1px]">
          {/* Partner Kamerası */}
          <div className="flex-1 relative bg-zinc-900">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            {isSearching && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-[10px] font-black tracking-widest text-blue-500 animate-pulse uppercase">Aranıyor...</p>
              </div>
            )}
            {/* Üst Bilgi Katmanı */}
            <div className="absolute top-4 left-4 z-30 flex items-center gap-2">
                <div className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold border border-white/10 italic">
                    {partnerCountry ? `🌍 ${partnerCountry}` : "Yabancı"}
                </div>
            </div>
          </div>

          {/* Kendi Kameran */}
          <div className="flex-1 relative bg-zinc-900">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-bold border border-white/10 uppercase">Sen</div>
          </div>
        </div>

        {/* --- OVERLAY CHAT SİSTEMİ --- */}
        <div className="absolute inset-0 pointer-events-none z-40 flex flex-col justify-end p-4 pb-20 md:pb-24">
            {/* Mesaj Akışı (Kameranın Üstünde Şeffaf) */}
            <div className="w-full max-w-sm space-y-2 mb-4 overflow-hidden pointer-events-none">
                {messages.slice(-5).map((msg, idx) => (
                    <div key={idx} className="animate-in slide-in-from-left-4 fade-in duration-300">
                        <span className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-2xl text-xs inline-block border border-white/5">
                            <b className={msg.sender === "Ben" ? "text-blue-400" : "text-pink-400"}>{msg.sender}: </b>
                            {msg.text}
                        </span>
                    </div>
                ))}
            </div>

            {/* Giriş Alanı (İkonla Açılan) */}
            {isChatOpen && (
                <div className="pointer-events-auto animate-in slide-in-from-bottom-4 duration-200">
                    <form onSubmit={sendMessage} className="flex gap-2 bg-black/60 backdrop-blur-xl p-2 rounded-2xl border border-white/10">
                        <input 
                            autoFocus
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="Mesaj yaz..."
                            className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                        />
                        <button type="submit" className="bg-blue-600 px-4 py-2 rounded-xl text-xs font-bold">GÖNDER</button>
                    </form>
                </div>
            )}
        </div>

        {/* --- ALT KONTROL BAR-BUTONLARI --- */}
        <div className="absolute bottom-6 left-0 right-0 z-50 px-6 flex justify-between items-center pointer-events-none">
            {/* Bildir Butonu */}
            <button className="pointer-events-auto w-12 h-12 bg-red-600/20 backdrop-blur-md rounded-full flex items-center justify-center border border-red-600/30 text-red-500">
                🚩
            </button>

            {/* SIRADAKİ Butonu (Merkezde) */}
            <button 
                onClick={handleNext}
                disabled={isSearching}
                className="pointer-events-auto px-10 py-4 bg-white text-black rounded-full font-black text-sm tracking-tighter shadow-2xl active:scale-95 transition-all disabled:opacity-50"
            >
                {isSearching ? "..." : "SIRADAKİ"}
            </button>

            {/* MESAJ İKONU (Sağda) */}
            <button 
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={`pointer-events-auto w-12 h-12 rounded-full flex items-center justify-center border transition-all ${isChatOpen ? "bg-blue-600 border-blue-400" : "bg-black/40 backdrop-blur-md border-white/20"}`}
            >
                💬
            </button>
        </div>
      </main>

      {/* Giriş Modalı (Aynı Kalacak) */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[100] flex items-center justify-center p-6 text-center">
            <div className="max-w-xs w-full">
                <h2 className="text-3xl font-black italic tracking-tighter mb-10 text-blue-500">VIDEOCHAT</h2>
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setMyGender("male")} className={`py-4 rounded-2xl font-bold border-2 transition-all ${myGender === "male" ? "bg-blue-600 border-blue-400" : "bg-zinc-900 border-zinc-800"}`}>ERKEK</button>
                        <button onClick={() => setMyGender("female")} className={`py-4 rounded-2xl font-bold border-2 transition-all ${myGender === "female" ? "bg-pink-600 border-pink-400" : "bg-zinc-900 border-zinc-800"}`}>KADIN</button>
                    </div>
                    <button onClick={() => { if(!myGender) return alert("Seçim yapın"); setShowModal(false); handleNext(); }} className="w-full bg-white text-black py-5 rounded-[30px] font-black text-xl shadow-2xl">BAŞLAT</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}