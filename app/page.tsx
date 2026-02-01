"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

// Global tanımlaması ve socket bağlantısı önceki kodun aynısı kalacak
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
  const [showReportModal, setShowReportModal] = useState(false);
  const [recentPartners, setRecentPartners] = useState<{id: string, screenshot: string}[]>([]);

  useEffect(() => { setIsMounted(true); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Kamera ve Socket Logic (Önceki kodun aynısı...)
  useEffect(() => {
    async function startCamera() {
      if (streamRef.current) return;
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
    socket.emit("find_partner", { myGender, searchGender, onlySameCountry });
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
    <div className="fixed inset-0 bg-black text-white flex flex-col font-sans overflow-hidden">
      
      {/* Üst Bar */}
      <header className="h-12 md:h-14 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/80 backdrop-blur-md z-50">
        <h1 className="text-lg md:text-xl font-black italic tracking-tighter text-blue-500">VIDEOCHAT</h1>
        <div className="flex items-center gap-2">
           {partnerCountry && <span className="text-[9px] bg-zinc-800 px-2 py-1 rounded-full uppercase">🌍 {partnerCountry}</span>}
           <button onClick={() => setShowReportModal(true)} className="text-[9px] font-black text-red-500 border border-red-500/20 px-2 py-1 rounded-lg">BİLDİR</button>
        </div>
      </header>

      {/* ANA PANEL */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* KAMERALAR ALANI */}
        {/* Mobilde ekranın %60'ını kaplar, Desktop'ta solda sabit genişliktedir */}
        <div className="w-full md:w-[400px] lg:w-[500px] h-[60%] md:h-full flex flex-col gap-0.5 bg-black border-r border-zinc-800 relative z-10">
          
          {/* Partner Kamerası */}
          <div className="flex-1 relative bg-zinc-900 overflow-hidden">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-2 left-2 bg-black/40 px-2 py-1 rounded text-[8px] font-bold uppercase backdrop-blur-md">Yabancı</div>
            {isSearching && (
              <div className="absolute inset-0 bg-zinc-950/95 flex flex-col items-center justify-center p-4 text-center">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                <p className="text-[8px] font-black text-blue-500 tracking-widest uppercase">{waitingStatus}</p>
              </div>
            )}
          </div>

          {/* Kendi Kameran */}
          <div className="flex-1 relative bg-zinc-900 overflow-hidden">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute bottom-2 left-2 bg-black/40 px-2 py-1 rounded text-[8px] font-bold uppercase backdrop-blur-md">Sen</div>
          </div>
        </div>

        {/* CHAT ALANI */}
        {/* Mobilde kameraların üstüne/altına biner, Desktop'ta sağda beyaz alandır */}
        <div className="flex-1 flex flex-col bg-white text-black relative h-[40%] md:h-full">
          
          {/* Mesaj Listesi */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar bg-white">
            <div className="text-center text-[9px] text-zinc-400 font-bold uppercase mb-4">Sohbet Başladı</div>
            {messages.map((msg, idx) => (
              <div key={idx} className="flex gap-2 items-start">
                <span className={`font-black text-[12px] uppercase ${msg.sender === "Ben" ? "text-blue-600" : "text-red-600"}`}>
                  {msg.sender}:
                </span>
                <span className="text-[13px] font-medium text-zinc-800">{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Kontrol Çubuğu */}
          <div className="p-2 md:p-4 bg-zinc-50 border-t border-zinc-200 flex items-center gap-2">
            <button 
              onClick={handleNext} 
              disabled={isSearching}
              className="bg-zinc-900 text-white px-4 md:px-8 py-3 md:py-4 rounded-xl font-black text-xs md:text-sm hover:bg-black transition-all"
            >
              {isSearching ? "..." : "SIRADAKİ"}
            </button>
            
            <form onSubmit={sendMessage} className="flex-1 flex gap-2">
              <input 
                value={inputText} 
                onChange={(e) => setInputText(e.target.value)} 
                type="text" 
                placeholder="Mesaj yaz..." 
                className="flex-1 bg-white border border-zinc-300 p-3 md:p-4 rounded-xl outline-none text-xs focus:border-blue-500" 
              />
              <button type="submit" className="bg-blue-600 text-white px-4 md:px-6 py-3 md:py-4 rounded-xl font-bold text-xs md:text-sm">GÖNDER</button>
            </form>
          </div>
        </div>
      </main>

      {/* Giriş Modalı */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[100] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 md:p-8 rounded-[30px] md:rounded-[40px] max-w-sm w-full">
            <h2 className="text-xl md:text-2xl font-black mb-6 text-center uppercase">Ayarlar</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setMyGender("male")} className={`py-4 rounded-xl font-bold ${myGender === "male" ? "bg-blue-600" : "bg-zinc-800"}`}>ERKEK</button>
                <button onClick={() => setMyGender("female")} className={`py-4 rounded-xl font-bold ${myGender === "female" ? "bg-pink-600" : "bg-zinc-800"}`}>KADIN</button>
              </div>
              <select value={searchGender} onChange={(e) => setSearchGender(e.target.value)} className="w-full bg-zinc-800 p-4 rounded-xl font-bold border border-zinc-700 outline-none text-sm">
                <option value="all">HERKES</option>
                <option value="male">ERKEKLER</option>
                <option value="female">KADINLAR</option>
              </select>
              <button onClick={() => setOnlySameCountry(!onlySameCountry)} className={`w-full py-3 rounded-xl font-black text-[9px] border-2 ${onlySameCountry ? "border-green-500 text-green-500" : "border-zinc-800 text-zinc-500"}`}>
                {onlySameCountry ? "✓ KENDİ ÜLKEM" : "DÜNYA GENELİ"}
              </button>
              <button onClick={() => { if(!myGender) return alert("Seçin!"); setShowModal(false); handleNext(); }} className="w-full bg-blue-600 py-4 rounded-2xl font-black text-lg">BAŞLAT</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}