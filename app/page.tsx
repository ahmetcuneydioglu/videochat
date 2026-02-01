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

  const [showModal, setShowModal] = useState(true);
  const [myGender, setMyGender] = useState<string | null>(null);
  const [searchGender, setSearchGender] = useState("all");
  const [partnerCountry, setPartnerCountry] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ sender: string, text: string }[]>([]);
  const [inputText, setInputText] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false); // Mobil için

  useEffect(() => { setIsMounted(true); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Kamera ve Socket Logic
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
    socket.emit("find_partner", { myGender, searchGender, onlySameCountry: false });
  };

  const handleReport = () => {
    if (partnerId) {
        // Ekran görüntüsü alıp gönderiyoruz
        const canvas = document.createElement("canvas");
        canvas.width = 160; canvas.height = 120;
        const ctx = canvas.getContext("2d");
        if (remoteVideoRef.current) ctx?.drawImage(remoteVideoRef.current, 0, 0, canvas.width, canvas.height);
        const screenshot = canvas.toDataURL("image/jpeg", 0.5);
        
        socket.emit("report_user", { targetId: partnerId, screenshot });
        alert("Kullanıcı başarıyla raporlandı.");
        handleNext(); // Raporlayınca otomatik geç
    } else {
        alert("Raporlanacak aktif bir partner yok.");
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
    <div className="h-screen bg-black text-white flex flex-col font-sans overflow-hidden">
      
      {/* ÜST BAR */}
      <header className="h-14 border-b border-zinc-800 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-md shrink-0">
        <h1 className="text-xl font-black italic tracking-tighter text-blue-500">VIDEOCHAT</h1>
        <div className="flex items-center gap-4">
           {partnerCountry && <span className="text-[10px] font-bold bg-zinc-800 px-3 py-1 rounded-full uppercase">🌍 {partnerCountry}</span>}
           <button onClick={handleReport} className="bg-red-600/20 text-red-500 px-4 py-1.5 rounded-xl text-[10px] font-black border border-red-600/30 hover:bg-red-600 hover:text-white transition-all">BİLDİR</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* SOL PANEL: KAMERALAR (Web'de sabit genişlik, Mobilde tam ekran) */}
        <div className="w-full md:w-[400px] lg:w-[480px] h-[65%] md:h-full flex flex-col gap-[1px] bg-black border-r border-zinc-800 relative shrink-0">
          
          <div className="flex-1 relative bg-zinc-900 overflow-hidden">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded-lg text-[10px] font-bold uppercase backdrop-blur-sm">Yabancı</div>
            {isSearching && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-[10px] font-black text-blue-500 tracking-widest uppercase">Aranıyor...</p>
              </div>
            )}
          </div>

          <div className="flex-1 relative bg-zinc-900 overflow-hidden">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute bottom-4 left-4 bg-black/50 px-3 py-1 rounded-lg text-[10px] font-bold uppercase backdrop-blur-sm">Sen</div>
          </div>

          {/* MOBİL OVERLAY CHAT (Sadece Mobilde Görünür) */}
          <div className="md:hidden absolute inset-0 pointer-events-none flex flex-col justify-end p-4 pb-20">
             <div className="w-full max-w-xs space-y-1 mb-2">
                {messages.slice(-3).map((m, i) => (
                    <div key={i} className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-xl text-[11px] inline-block border border-white/5">
                        <b className={m.sender === "Ben" ? "text-blue-400" : "text-pink-400"}>{m.sender}:</b> {m.text}
                    </div>
                ))}
             </div>
          </div>
        </div>

        {/* SAĞ PANEL: CHAT ALANI (Web'de beyaz arka plan, Mobilde kontrol paneli) */}
        <div className="flex-1 flex flex-col bg-white md:bg-white relative">
          
          {/* Mesaj Listesi (Desktop'ta görünür, Mobilde sadece ikonla açılır hale getirilebilir) */}
          <div className="hidden md:flex flex-1 overflow-y-auto p-6 flex-col space-y-3 bg-white">
            {messages.map((msg, idx) => (
              <div key={idx} className="flex gap-2 leading-tight">
                <span className={`font-black text-[13px] uppercase min-w-[70px] ${msg.sender === "Ben" ? "text-blue-600" : "text-red-600"}`}>
                  {msg.sender}:
                </span>
                <span className="text-[14px] font-medium text-zinc-800">{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* ALT KONTROL PANELİ */}
          <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex items-center gap-3">
            <button 
              onClick={handleNext} 
              disabled={isSearching}
              className="bg-black text-white px-8 py-4 rounded-2xl font-black text-sm hover:bg-zinc-800 transition-all uppercase tracking-tighter disabled:opacity-50 shrink-0"
            >
              {isSearching ? "..." : "NEXT"}
            </button>
            
            <form onSubmit={sendMessage} className="flex-1 flex gap-2">
              <input 
                value={inputText} 
                onChange={(e) => setInputText(e.target.value)} 
                type="text" 
                placeholder="Mesaj yaz..." 
                className="flex-1 bg-white border border-zinc-300 p-4 rounded-2xl outline-none text-black text-sm focus:border-blue-500 transition-all" 
              />
              <button type="submit" className="bg-blue-600 text-white px-6 py-4 rounded-2xl font-bold text-sm hover:bg-blue-700 transition-all shrink-0">GÖNDER</button>
            </form>
          </div>
        </div>
      </main>

      {/* Giriş Modalı aynı kalacak... */}
    </div>
  );
}