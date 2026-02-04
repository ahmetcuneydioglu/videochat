"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";

if (typeof window !== "undefined" && typeof (window as any).global === "undefined") {
  (window as any).global = window;
}

const socket = io("https://videochat-1qxi.onrender.com/", { transports: ["websocket"], secure: true });

// Ülke listesi (Görseldeki yapıya göre genişletilebilir)
const countries = [
  { id: "all", name: "All Countries", flag: "🌐" },
  { id: "TR", name: "Turkey", flag: "🇹🇷" },
  { id: "US", name: "United States", flag: "🇺🇸" },
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
  
  // Medya ve Filtre Durumları
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [audioOn, setAudioOn] = useState(true);
  const [myGender, setMyGender] = useState<string | null>(null);
  const [searchGender, setSearchGender] = useState("all"); 
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  const [partnerCountry, setPartnerCountry] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ sender: string, text: string }[]>([]);
  const [inputText, setInputText] = useState("");
  
  const [isMobileInputActive, setIsMobileInputActive] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const setHeight = () => {
      const vh = window.innerHeight;
      document.documentElement.style.setProperty('--vv-height', `${vh}px`);
    };
    setHeight();
    window.addEventListener('resize', setHeight);
    window.addEventListener('orientationchange', setHeight);
    if (window.innerWidth < 768) {
        const hasSwiped = localStorage.getItem("hasSwipedBefore");
        if (!hasSwiped) setShowSwipeHint(true);
    }
    return () => {
      window.removeEventListener('resize', setHeight);
      window.removeEventListener('orientationchange', setHeight);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    mobileChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isMobileInputActive]);

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
      setPartnerId(null); setPartnerCountry(null); setIsMobileInputActive(false);
      setTimeout(() => { handleNext(); }, 1000);
    });

    socket.on("signal", (data) => {
      if (peerRef.current && !(peerRef.current as any).destroyed) {
        peerRef.current.signal(data.signal);
      }
    });

    return () => {
      socket.off("partner_found"); socket.off("partner_disconnected"); socket.off("signal");
    };
  }, [isMounted]);

  function initiatePeer(targetId: string, initiator: boolean) {
    if (!streamRef.current) return;
    const peer = new Peer({ 
      initiator, trickle: false, stream: streamRef.current,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } 
    });
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
    setPartnerId(null); setIsSearching(true); setIsMobileInputActive(false);
    socket.emit("find_partner", { myGender, searchGender, selectedCountry });
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && peerRef.current && (peerRef.current as any).connected) {
      peerRef.current.send(inputText.trim());
      setMessages((prev) => [...prev, { sender: "Ben", text: inputText.trim() }]);
      setInputText("");
    }
  };

  const toggleCamera = () => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      track.enabled = !track.enabled;
      setCameraOn(track.enabled);
    }
  };

  const toggleMic = () => {
    if (streamRef.current) {
      const track = streamRef.current.getAudioTracks()[0];
      track.enabled = !track.enabled;
      setMicOn(track.enabled);
    }
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 70 && !isSearching) {
        if (showSwipeHint) { setShowSwipeHint(false); localStorage.setItem("hasSwipedBefore", "true"); }
        handleNext();
    }
  };

  // Ülke arama filtresi
  const filteredCountries = countries.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isMounted) return null;

  return (
    <div 
      className="fixed inset-0 w-full h-full bg-black text-white flex flex-col font-sans overflow-hidden touch-none select-none"
      style={{ height: 'var(--vv-height, 100vh)', position: 'fixed', top: 0, left: 0 }}
      onTouchStart={(e) => { touchEndX.current = null; touchStartX.current = e.targetTouches[0].clientX; }}
      onTouchMove={(e) => (touchEndX.current = e.targetTouches[0].clientX)}
      onTouchEnd={onTouchEnd}
    >
      
      {/* COUNTRY FILTER MODAL */}
      {showCountryFilter && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white text-black w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
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
                    className="w-full flex items-center justify-between p-3 hover:bg-zinc-50 rounded-xl transition-all group"
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

      {/* GENDER FILTER MODAL */}
      {showGenderFilter && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
              <div className="bg-white text-black w-full max-w-xs rounded-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between p-4 border-b">
                      <h3 className="text-blue-500 font-bold text-lg">Gender Filter</h3>
                      <button onClick={() => setShowGenderFilter(false)} className="text-zinc-400 text-2xl">✕</button>
                  </div>
                  <div className="p-2">
                      <p className="text-zinc-500 text-xs px-3 py-2">Choose which gender you would like to connect to:</p>
                      {[
                          { id: 'all', label: 'Everyone', icon: '👤', color: 'text-blue-500' },
                          { id: 'female', label: 'Females Only', icon: '♀️', color: 'text-pink-500' },
                          { id: 'male', label: 'Males Only', icon: '♂️', color: 'text-blue-400' },
                          { id: 'couples', label: 'Couples Only', icon: '👩‍❤️‍👨', color: 'text-orange-400' }
                      ].map((option) => (
                          <button 
                            key={option.id}
                            onClick={() => { setSearchGender(option.id); setShowGenderFilter(false); handleNext(); }}
                            className="w-full flex items-center justify-between p-3 hover:bg-zinc-50 rounded-lg transition-colors group"
                          >
                              <div className="flex items-center gap-4">
                                  <span className={`text-xl ${option.color}`}>{option.icon}</span>
                                  <span className={`text-sm font-medium ${searchGender === option.id ? 'text-blue-500' : 'text-zinc-600'}`}>{option.label}</span>
                              </div>
                              {searchGender === option.id && <span className="text-blue-500 font-bold">✓</span>}
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* CHAT OPTIONS MODAL */}
      {showOptions && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
              <div className="bg-white text-black w-full max-w-xs rounded-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between p-4 border-b">
                      <h3 className="text-blue-500 font-bold">Chat Options</h3>
                      <button onClick={() => setShowOptions(false)} className="text-zinc-400 text-2xl">✕</button>
                  </div>
                  <div className="p-2 space-y-1">
                      <button className="w-full flex items-center gap-4 p-3 hover:bg-zinc-100 rounded-lg transition-colors">
                          <span className="text-xl">🔄</span> <span className="text-sm font-medium">Switch Camera</span>
                      </button>
                      <div className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-4"><span className="text-xl">📹</span> <span className="text-sm font-medium">Camera: <span className={cameraOn ? "text-green-500" : "text-red-500"}>{cameraOn ? "On" : "Off"}</span></span></div>
                          <input type="checkbox" checked={cameraOn} onChange={toggleCamera} className="w-10 h-5 bg-zinc-200 rounded-full appearance-none checked:bg-green-500 relative transition-all before:content-[''] before:absolute before:w-4 before:h-4 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 checked:before:left-5 before:transition-all cursor-pointer" />
                      </div>
                      <div className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-4"><span className="text-xl">🎤</span> <span className="text-sm font-medium">Mic: <span className={micOn ? "text-green-500" : "text-red-500"}>{micOn ? "On" : "Off"}</span></span></div>
                          <input type="checkbox" checked={micOn} onChange={toggleMic} className="w-10 h-5 bg-zinc-200 rounded-full appearance-none checked:bg-green-500 relative transition-all before:content-[''] before:absolute before:w-4 before:h-4 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 checked:before:left-5 before:transition-all cursor-pointer" />
                      </div>
                      <button className="w-full flex items-center gap-4 p-3 hover:bg-zinc-100 rounded-lg border-t mt-2"><span className="text-xl">👑</span> <span className="text-blue-500 font-bold text-sm">Unlock All Features</span></button>
                  </div>
              </div>
          </div>
      )}

      {/* MAIN LAYOUT */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative w-full h-full">
        <div className="flex-1 relative md:w-[450px] lg:w-[500px] h-full bg-black md:border-r border-zinc-800 z-10 overflow-hidden">
          {/* ÜST VİDEO */}
          <div className="absolute top-0 left-0 w-full h-[50%] overflow-hidden bg-zinc-900 border-b border-white/5">
            {isSearching && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-sm">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-[10px] font-black tracking-widest text-blue-400 uppercase">Searching...</p>
                </div>
            )}
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="md:hidden absolute top-4 left-4 z-50">
                <h1 className="text-xl font-black italic tracking-tighter text-blue-500 bg-black/30 px-2 py-1 rounded">OMEGPT</h1>
                {partnerCountry && <div className="mt-1 text-[10px] font-bold bg-black/60 px-2 py-1 rounded-full border border-white/10 w-fit">🌍 {partnerCountry}</div>}
            </div>
          </div>

          {/* ALT VİDEO */}
          <div className="absolute bottom-0 left-0 w-full h-[50%] overflow-hidden bg-zinc-900">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            
            {/* SAĞ MENÜ İKONLARI */}
            <div className="md:hidden absolute right-4 bottom-24 z-[70] flex flex-col gap-4 pointer-events-auto">
                <button onClick={() => setShowOptions(true)} className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">
                    <span className="text-xl">⚙️</span>
                </button>
                <button onClick={() => setShowGenderFilter(true)} className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">
                    <span className="text-xl">🚻</span>
                </button>
                <button onClick={() => setShowCountryFilter(true)} className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">
                    <span className="text-xl">🏳️</span>
                </button>
            </div>

            {/* MESAJ AKIŞI */}
            <div className="md:hidden absolute bottom-24 left-4 right-20 z-40 flex flex-col justify-end max-h-[140px] overflow-y-auto pointer-events-none no-scrollbar">
                <div className="flex flex-col gap-1.5 p-2">
                    {messages.map((m, i) => (
                        <div key={i} className="bg-black/60 backdrop-blur-lg px-3 py-1.5 rounded-2xl text-[12px] border border-white/5 w-fit max-w-full break-words text-white">
                            <b className={m.sender === "Ben" ? "text-blue-400" : "text-pink-400"}>{m.sender}:</b> {m.text}
                        </div>
                    ))}
                    <div ref={mobileChatEndRef} />
                </div>
            </div>

            {/* MESAJ İKONU VE INPUT */}
            <div className="md:hidden absolute bottom-6 right-4 z-[60] pointer-events-auto">
                {partnerId && (
                    <button onClick={() => setIsMobileInputActive(!isMobileInputActive)} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border-2 border-white/20 ${isMobileInputActive ? 'bg-zinc-800' : 'bg-blue-600'}`}>
                        <span className="text-2xl text-white leading-none">{isMobileInputActive ? '✕' : '💬'}</span>
                    </button>
                )}
            </div>
            {isMobileInputActive && (
                <div className="md:hidden absolute bottom-6 left-4 right-20 z-[70] animate-in slide-in-from-bottom-2 duration-200">
                    <form onSubmit={sendMessage} className="flex bg-black/90 backdrop-blur-2xl border border-white/20 p-1 rounded-full shadow-2xl">
                        <input autoFocus value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Yaz..." className="flex-1 bg-transparent px-4 py-2 text-sm outline-none text-white w-full" />
                        <button type="submit" className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center"> ➤ </button>
                    </form>
                </div>
            )}
          </div>
        </div>

        {/* DESKTOP CHAT PANELİ */}
        <div className="hidden md:flex flex-1 flex-col bg-white border-l border-zinc-200 h-full">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg, idx) => (
              <div key={idx} className="flex gap-2 text-sm text-black">
                <b className={msg.sender === "Ben" ? "text-blue-600" : "text-red-600"}>{msg.sender}:</b>
                <span>{msg.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-4 bg-zinc-50 border-t flex items-center gap-3">
            <button onClick={handleNext} className="bg-black text-white px-6 py-3 rounded-xl font-bold uppercase text-xs">Next</button>
            <form onSubmit={sendMessage} className="flex-1 flex gap-2">
                <input value={inputText} onChange={(e) => setInputText(e.target.value)} className="flex-1 border border-zinc-300 p-3 rounded-xl text-black outline-none" placeholder="Mesaj yaz..." />
                <button type="submit" className="bg-blue-600 text-white px-5 rounded-xl font-bold">➤</button>
            </form>
          </div>
        </div>
      </main>

      {/* GİRİŞ MODALI */}
      {showModal && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[500] flex items-center justify-center p-6 text-center">
            <div className="max-w-xs w-full space-y-6">
                <h2 className="text-4xl font-black italic tracking-tighter text-blue-500 uppercase">OMEGPT</h2>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setMyGender("male")} className={`py-5 rounded-2xl font-bold border-2 transition-all ${myGender === "male" ? "bg-blue-600 border-blue-400 scale-95" : "bg-zinc-900 border-zinc-800 opacity-60"}`}>ERKEK</button>
                    <button onClick={() => setMyGender("female")} className={`py-5 rounded-2xl font-bold border-2 transition-all ${myGender === "female" ? "bg-pink-600 border-pink-400 scale-95" : "bg-zinc-900 border-zinc-800 opacity-60"}`}>KADIN</button>
                </div>
                <button onClick={() => { if(!myGender) return alert("Cinsiyet seçin!"); setShowModal(false); handleNext(); }} className="w-full bg-white text-black py-5 rounded-[30px] font-black text-xl uppercase shadow-2xl transition-all">BAŞLAT</button>
            </div>
        </div>
      )}

      <style jsx global>{`
        html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden !important; position: fixed; background: black; overscroll-behavior: none; -webkit-text-size-adjust: 100%; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .animate-in { animation-duration: 0.3s; animation-fill-mode: both; }
        @keyframes slideInBottom2 { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .slide-in-from-bottom-2 { animation-name: slideInBottom2; }
        @keyframes zoom-in-95 { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .zoom-in-95 { animation-name: zoom-in-95; }
      `}</style>
    </div>
  );
}