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

  const [showModal, setShowModal] = useState(true);
  const [myGender, setMyGender] = useState<string | null>(null);
  const [searchGender, setSearchGender] = useState("all");
  const [onlySameCountry, setOnlySameCountry] = useState(false);
  const [partnerCountry, setPartnerCountry] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ sender: string, text: string }[]>([]);
  const [inputText, setInputText] = useState("");

  useEffect(() => { setIsMounted(true); }, []);
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
      
      {/* ÜST BAR */}
      <header className="h-12 border-b border-zinc-800 flex items-center justify-between px-4 bg-zinc-900/50 backdrop-blur-md z-50">
        <h1 className="text-lg font-black italic tracking-tighter text-blue-500">VIDEOCHAT</h1>
        <div className="flex items-center gap-2">
           {partnerCountry && <span className="text-[9px] font-bold bg-zinc-800 px-2 py-1 rounded-full uppercase">🌍 {partnerCountry}</span>}
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* KAMERALAR (Web'de Sabit Sol, Mobilde Full Ekran) */}
        <div className="w-full md:w-[450px] lg:w-[500px] h-full flex flex-col gap-[1px] bg-black border-r border-zinc-800 relative z-10">
          <div className="flex-1 relative bg-zinc-900 overflow-hidden">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-4 left-4 bg-black/40 px-2 py-1 rounded text-[8px] font-bold uppercase backdrop-blur-sm">Yabancı</div>
            {isSearching && (
              <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-[9px] font-black text-blue-500 animate-pulse uppercase tracking-widest">Aranıyor...</p>
              </div>
            )}
          </div>

          <div className="flex-1 relative bg-zinc-900 overflow-hidden">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute top-4 left-4 bg-black/40 px-2 py-1 rounded text-[8px] font-bold uppercase backdrop-blur-sm">Sen</div>

            {/* MOBİL OVERLAY KONTROLLER */}
            <div className="md:hidden absolute inset-0 flex flex-col justify-end p-4 pointer-events-none">
                <div className="space-y-1 mb-4">
                    {messages.slice(-3).map((m, i) => (
                        <div key={i} className="bg-black/40 backdrop-blur-md px-3 py-1 rounded-xl text-[10px] inline-block border border-white/5">
                            <b className={m.sender === "Ben" ? "text-blue-400" : "text-pink-400"}>{m.sender}:</b> {m.text}
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-2 pointer-events-auto">
                    <button onClick={handleNext} disabled={isSearching} className="h-12 px-6 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-tighter">NEXT</button>
                    <form onSubmit={sendMessage} className="flex-1 flex gap-1 bg-black/40 backdrop-blur-xl border border-white/10 p-1 rounded-2xl">
                        <input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Mesaj yaz..." className="flex-1 bg-transparent px-3 py-2 text-xs outline-none" />
                        <button type="submit" className="bg-blue-600 px-4 py-2 rounded-xl text-[10px] font-bold uppercase">GÖNDER</button>
                    </form>
                </div>
            </div>
          </div>
        </div>

        {/* WEB CHAT ALANI (Chatrandom Stili) */}
        <div className="hidden md:flex flex-1 flex-col bg-white">
          <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-white">
            <div className="text-center text-[10px] text-zinc-300 font-bold uppercase tracking-[0.3em] py-4 border-b border-zinc-50">Sohbet Başladı</div>
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
                <input value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Mesaj yaz..." className="flex-1 bg-white border border-zinc-300 p-4 rounded-2xl text-black text-sm outline-none" />
                <button type="submit" className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-bold">GÖNDER</button>
            </form>
          </div>
        </div>
      </main>

      {/* GİRİŞ MODALI (Ayarların Geri Geldiği Hali) */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[100] flex items-center justify-center p-6">
            <div className="max-w-xs w-full space-y-6">
                <h2 className="text-3xl font-black italic tracking-tighter text-blue-500 text-center">VIDEOCHAT</h2>
                
                {/* Cinsiyet Seçimi */}
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setMyGender("male")} className={`py-4 rounded-2xl font-bold border-2 transition-all ${myGender === "male" ? "bg-blue-600 border-blue-400" : "bg-zinc-900 border-zinc-800"}`}>ERKEK</button>
                    <button onClick={() => setMyGender("female")} className={`py-4 rounded-2xl font-bold border-2 transition-all ${myGender === "female" ? "bg-pink-600 border-pink-400" : "bg-zinc-900 border-zinc-800"}`}>KADIN</button>
                </div>

                {/* Aranan Cinsiyet & Yerel Mod */}
                <div className="space-y-3">
                    <select value={searchGender} onChange={(e) => setSearchGender(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-2xl font-bold text-sm outline-none">
                        <option value="all">HERKESLE EŞLEŞ</option>
                        <option value="male">ERKEKLERLE EŞLEŞ</option>
                        <option value="female">KADINLARLA EŞLEŞ</option>
                    </select>
                    <button onClick={() => setOnlySameCountry(!onlySameCountry)} className={`w-full py-4 rounded-2xl font-black text-[10px] tracking-widest border-2 transition-all ${onlySameCountry ? "border-green-500 text-green-500 bg-green-500/10" : "border-zinc-800 text-zinc-600"}`}>
                        {onlySameCountry ? "✓ KENDİ ÜLKEM" : "DÜNYA GENELİ"}
                    </button>
                </div>

                <button onClick={() => { if(!myGender) return alert("Cinsiyet seçin!"); setShowModal(false); handleNext(); }} className="w-full bg-white text-black py-5 rounded-[30px] font-black text-xl shadow-2xl">BAŞLAT</button>
            </div>
        </div>
      )}
    </div>
  );
}