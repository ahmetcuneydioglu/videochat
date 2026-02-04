"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

if (typeof window !== "undefined" && typeof (window as any).global === "undefined") {
  (window as any).global = window;
}

const socket = io("https://videochat-1qxi.onrender.com/", { transports: ["websocket"], secure: true });

// Ülke listesi örneği (Görseldeki sıraya göre)
const countries = [
  { id: "all", name: "All Countries", flag: "🌐" },
  { id: "TR", name: "Turkey", flag: "🇹🇷" },
  { id: "AF", name: "Afghanistan", flag: "af" }, // Buraya gerçek bayrak resimleri veya emoji gelebilir
  { id: "AL", name: "Albania", flag: "🇦🇱" },
  { id: "DZ", name: "Algeria", flag: "🇩🇿" },
  { id: "AO", name: "Angola", flag: "🇦🇴" },
  { id: "AR", name: "Argentina", flag: "🇦🇷" },
  { id: "AM", name: "Armenia", flag: "🇦🇲" },
  { id: "AU", name: "Australia", flag: "🇦🇺" },
];

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

  // Modal Durumları
  const [showModal, setShowModal] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [showGenderFilter, setShowGenderFilter] = useState(false);
  const [showCountryFilter, setShowCountryFilter] = useState(false);
  
  // Filtreleme Durumları
  const [searchGender, setSearchGender] = useState("all");
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [partnerCountry, setPartnerCountry] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ sender: string, text: string }[]>([]);
  const [inputText, setInputText] = useState("");
  const [isMobileInputActive, setIsMobileInputActive] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const setHeight = () => {
      document.documentElement.style.setProperty('--vv-height', `${window.innerHeight}px`);
    };
    setHeight();
    window.addEventListener('resize', setHeight);
    return () => window.removeEventListener('resize', setHeight);
  }, []);

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
      if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      setPartnerId(null); setPartnerCountry(null);
      setTimeout(() => handleNext(), 1000);
    });

    socket.on("signal", (data) => {
      if (peerRef.current && !(peerRef.current as any).destroyed) peerRef.current.signal(data.signal);
    });

    return () => { socket.off("partner_found"); socket.off("partner_disconnected"); socket.off("signal"); };
  }, [isMounted]);

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
    socket.emit("find_partner", { myGender: "male", searchGender, selectedCountry });
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && peerRef.current && (peerRef.current as any).connected) {
      peerRef.current.send(inputText.trim());
      setMessages((prev) => [...prev, { sender: "Ben", text: inputText.trim() }]);
      setInputText("");
    }
  };

  const filteredCountries = countries.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()));

  if (!isMounted) return null;

  return (
    <div className="fixed inset-0 w-full h-full bg-black text-white flex flex-col font-sans overflow-hidden touch-none select-none" style={{ height: 'var(--vv-height, 100vh)' }}>
      
      {/* COUNTRY FILTER MODAL */}
      {showCountryFilter && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white text-black w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-blue-500 font-bold text-lg">Country Filter</h3>
              <button onClick={() => setShowCountryFilter(false)} className="text-zinc-400 text-2xl">✕</button>
            </div>
            <div className="p-4">
              <p className="text-zinc-500 text-xs mb-3">Choose which country you would like to connect to:</p>
              <div className="relative mb-4">
                <span className="absolute left-3 top-2.5 text-zinc-400">🔍</span>
                <input 
                  type="text" 
                  placeholder="Search country" 
                  className="w-full bg-zinc-100 border-none rounded-full py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 ring-blue-500/20"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto no-scrollbar space-y-1">
                {filteredCountries.map((c) => (
                  <button 
                    key={c.id} 
                    onClick={() => { setSelectedCountry(c.id); setShowCountryFilter(false); handleNext(); }}
                    className="w-full flex items-center justify-between p-3 hover:bg-zinc-50 rounded-xl transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{c.flag}</span>
                      <span className={`text-sm font-medium ${selectedCountry === c.id ? 'text-blue-500' : 'text-zinc-700'}`}>{c.name}</span>
                    </div>
                    {selectedCountry === c.id && <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-[10px]">✓</div>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GENDER FILTER MODAL (Öncekiyle aynı tasarım) */}
      {showGenderFilter && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-white text-black w-full max-w-xs rounded-lg overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-blue-500 font-bold">Gender Filter</h3>
                <button onClick={() => setShowGenderFilter(false)} className="text-zinc-400 text-2xl">✕</button>
            </div>
            <div className="p-2">
                {['Everyone', 'Females Only', 'Males Only', 'Couples Only'].map((label, idx) => (
                  <button key={idx} onClick={() => { setSearchGender(label.toLowerCase()); setShowGenderFilter(false); handleNext(); }} className="w-full flex items-center justify-between p-3 hover:bg-zinc-50 rounded-lg">
                    <span className="text-sm font-medium">{label}</span>
                    {searchGender === label.toLowerCase() && <span className="text-blue-500">✓</span>}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* MAIN VIEW */}
      <main className="flex-1 relative flex flex-col md:flex-row h-full">
        <div className="flex-1 relative bg-black overflow-hidden">
          {/* Üst Video Area */}
          <div className="h-1/2 relative border-b border-white/5">
            {isSearching && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-900/90">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-[10px] font-black text-blue-400 tracking-widest uppercase">Searching...</p>
              </div>
            )}
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute top-4 left-4 z-40">
              <h1 className="text-xl font-black italic text-blue-500 bg-black/30 px-2 py-1 rounded">OMEGPT</h1>
              {partnerCountry && <div className="mt-1 text-[10px] font-bold bg-black/60 px-2 py-1 rounded-full border border-white/10 w-fit">🌍 {partnerCountry}</div>}
            </div>
          </div>

          {/* Alt Video Area */}
          <div className="h-1/2 relative">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            
            {/* SAĞ TARAF İKONLARI */}
            <div className="absolute right-4 bottom-24 z-50 flex flex-col gap-4">
              <button onClick={() => setShowOptions(true)} className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">⚙️</button>
              <button onClick={() => setShowGenderFilter(true)} className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">🚻</button>
              <button onClick={() => setShowCountryFilter(true)} className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">🏳️</button>
            </div>

            {/* MESAJLAŞMA VE ALT BAR */}
            <div className="absolute bottom-6 right-4 z-[60]">
              {partnerId && (
                <button onClick={() => setIsMobileInputActive(!isMobileInputActive)} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-2xl border-2 border-white/20 ${isMobileInputActive ? 'bg-zinc-800' : 'bg-blue-600'}`}>💬</button>
              )}
            </div>
            {isMobileInputActive && (
              <div className="absolute bottom-6 left-4 right-20 z-[70] animate-in slide-in-from-bottom-2">
                <form onSubmit={sendMessage} className="flex bg-black/90 backdrop-blur-2xl border border-white/20 p-1 rounded-full shadow-2xl overflow-hidden">
                  <input autoFocus value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Yaz..." className="flex-1 bg-transparent px-4 py-2 text-sm outline-none text-white w-full" />
                  <button type="submit" className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center mr-1"> ➤ </button>
                </form>
              </div>
            )}
            
            {/* MESAJ AKIŞI */}
            <div className="absolute bottom-24 left-4 right-20 z-40 flex flex-col justify-end max-h-[140px] overflow-y-auto no-scrollbar pointer-events-none">
              <div className="flex flex-col gap-1.5 p-2">
                {messages.map((m, i) => (
                  <div key={i} className="bg-black/60 backdrop-blur-lg px-3 py-1.5 rounded-2xl text-[12px] border border-white/5 w-fit max-w-full break-words text-white">
                    <b className={m.sender === "Ben" ? "text-blue-400" : "text-pink-400"}>{m.sender}:</b> {m.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* WEB CHAT PANELİ (Desktop) */}
        <div className="hidden md:flex flex-1 flex-col bg-white border-l border-zinc-200 h-full">
          {/* Masaüstü chat yapısı buraya gelebilir */}
        </div>
      </main>

      {/* GİRİŞ MODALI */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[500] flex items-center justify-center p-6 text-center">
          <div className="max-w-xs w-full space-y-6">
            <h2 className="text-4xl font-black italic tracking-tighter text-blue-500 uppercase">OMEGPT</h2>
            <button onClick={() => { setShowModal(false); handleNext(); }} className="w-full bg-white text-black py-5 rounded-[30px] font-black text-xl uppercase shadow-2xl transition-all">BAŞLAT</button>
          </div>
        </div>
      )}

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes zoom-in-95 { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .animate-in { animation-duration: 0.2s; animation-fill-mode: both; }
        .zoom-in-95 { animation-name: zoom-in-95; }
      `}</style>
    </div>
  );
}