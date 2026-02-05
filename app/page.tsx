"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";
import { countries as rawCountries } from 'countries-list';

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
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const [showModal, setShowModal] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [showGenderFilter, setShowGenderFilter] = useState(false);
  const [showCountryFilter, setShowCountryFilter] = useState(false);
  
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [myGender, setMyGender] = useState<string | null>(null);
  const [searchGender, setSearchGender] = useState("all"); 
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  const [partnerCountry, setPartnerCountry] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState("Searching...");
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ sender: string, text: string }[]>([]);
  const [inputText, setInputText] = useState("");
  const [isMobileInputActive, setIsMobileInputActive] = useState(false);
  const [matchNotification, setMatchNotification] = useState<string | null>(null);
  const [showSwipeHint, setShowSwipeHint] = useState(false);

  const getFlagEmoji = (countryCode: string) => {
    if (countryCode === "all") return "🌐";
    return countryCode.toUpperCase().replace(/./g, (char) => String.fromCodePoint(char.charCodeAt(0) + 127397));
  };

  const allCountries = useMemo(() => {
    const list = Object.entries(rawCountries).map(([code, data]) => ({
      id: code,
      name: (data as any).name,
      flag: getFlagEmoji(code)
    }));
    return [{ id: "all", name: "All Countries", flag: "🌐" }, ...list.sort((a, b) => a.name.localeCompare(b.name))];
  }, []);

  const filteredCountries = useMemo(() => allCountries.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase())), [searchTerm, allCountries]);

  useEffect(() => {
    setIsMounted(true);
    const setHeight = () => document.documentElement.style.setProperty('--vv-height', `${window.innerHeight}px`);
    setHeight();
    window.addEventListener('resize', setHeight);
    
    // Swipe İpucu Kontrolü
    const hasSwiped = localStorage.getItem("hasSwipedBefore");
    if (!hasSwiped) setShowSwipeHint(true);

    return () => window.removeEventListener('resize', setHeight);
  }, []);

  const startMedia = async (mode: "user" | "environment" = facingMode) => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const newStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: mode, width: { ideal: 1280 }, height: { ideal: 720 } }, 
        audio: true 
      });
      streamRef.current = newStream;
      if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
    } catch (err) { console.error("Media Error:", err); }
  };

  useEffect(() => {
    if (isMounted) startMedia();

    socket.on("partner_found", (data) => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      setSearchStatus("Searching...");
      setMessages([]); 
      setPartnerId(data.partnerId); 
      setPartnerCountry(data.country);
      setIsSearching(false); 
      
      // Peer başlatma süreci
      initiatePeer(data.partnerId, data.initiator);

      const countryName = allCountries.find(c => c.id === data.country)?.name || data.country;
      setMatchNotification(`You matched with someone from ${countryName}`);
      setTimeout(() => setMatchNotification(null), 4000);
    });

    socket.on("partner_disconnected", () => {
      cleanPeer();
      setTimeout(() => handleNext(), 500);
    });

    socket.on("signal", (data) => {
      if (peerRef.current) peerRef.current.signal(data.signal);
    });

    return () => { 
      socket.off("partner_found"); 
      socket.off("partner_disconnected"); 
      socket.off("signal"); 
    };
  }, [isMounted, allCountries]);

  const cleanPeer = () => {
    if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setPartnerId(null);
    setPartnerCountry(null);
  };

  function initiatePeer(targetId: string, initiator: boolean) {
    if (!streamRef.current) return;
    
    const peer = new Peer({
      initiator,
      trickle: false,
      stream: streamRef.current,
      config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
    });

    peer.on("signal", (data) => {
      socket.emit("signal", { to: targetId, signal: data });
    });

    peer.on("stream", (remStream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remStream;
        // iOS ve bazı tarayıcılarda videoyu zorla oynat
        remoteVideoRef.current.play().catch(e => console.error("Play Error:", e));
      }
    });

    peer.on("data", (data) => {
      const msg = new TextDecoder().decode(data);
      setMessages(prev => [...prev, { sender: "Stranger", text: msg }]);
    });

    peer.on("error", (err) => console.error("Peer Error:", err));

    peerRef.current = peer;
  }

  const handleNext = (overrideGender?: string) => {
    cleanPeer();
    setIsSearching(true);
    setMatchNotification(null);
    setIsMobileInputActive(false);
    
    const targetGender = overrideGender || searchGender;
    
    if (targetGender !== "all") {
      setSearchStatus("Searching by preference...");
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setSearchStatus("No one found, switching to global...");
        setTimeout(() => {
          setSearchGender("all");
          socket.emit("find_partner", { myGender, searchGender: "all", selectedCountry });
          setSearchStatus("Global searching...");
        }, 2000);
      }, 7000);
    } else {
      setSearchStatus("Searching...");
    }

    socket.emit("find_partner", { myGender, searchGender: targetGender, selectedCountry });
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
  };
  const onTouchMove = (e: React.TouchEvent) => (touchEndX.current = e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 70 && !isSearching) {
        if (showSwipeHint) {
            setShowSwipeHint(false);
            localStorage.setItem("hasSwipedBefore", "true");
        }
        handleNext();
    }
  };

  const sendMessage = (e: any) => {
    e.preventDefault();
    if (inputText.trim() && peerRef.current?.connected) {
      peerRef.current.send(inputText.trim());
      setMessages(prev => [...prev, { sender: "Me", text: inputText.trim() }]);
      setInputText("");
    }
  };

  if (!isMounted) return null;

  return (
    <div 
      className="fixed inset-0 w-full h-full bg-black text-white flex flex-col font-sans overflow-hidden select-none" 
      style={{ height: 'var(--vv-height, 100vh)' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
    >
      {/* SWIPE HINT (Ok Bilgilendirmesi) */}
      {showSwipeHint && !showModal && !isSearching && partnerId && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-end pr-10">
          <div className="flex flex-col items-center animate-bounce-horizontal text-blue-500">
            <span className="text-4xl">➡️</span>
            <p className="text-[10px] font-bold bg-blue-600 text-white px-2 py-1 rounded mt-2">Swipe to skip</p>
          </div>
        </div>
      )}

      {/* MODALLAR (Country, Gender, Options) */}
      {showCountryFilter && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white text-black w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-blue-500 font-bold text-lg">Country Filter</h3>
              <button onClick={() => setShowCountryFilter(false)} className="text-zinc-400 text-2xl">✕</button>
            </div>
            <div className="p-4 overflow-hidden">
              <input type="text" placeholder="Search..." className="w-full bg-zinc-100 rounded-full py-2 px-4 mb-4 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              <div className="max-h-[350px] overflow-y-auto no-scrollbar space-y-1">
                {filteredCountries.map((c) => (
                  <button key={c.id} onClick={() => { setSelectedCountry(c.id); setShowCountryFilter(false); handleNext(); }} className="w-full flex items-center justify-between p-3 hover:bg-zinc-50 rounded-xl transition-all">
                    <div className="flex items-center gap-3"><span>{c.flag}</span><span className={`text-sm font-medium ${selectedCountry === c.id ? 'text-blue-500' : 'text-zinc-700'}`}>{c.name}</span></div>
                    {selectedCountry === c.id && <span className="text-blue-500">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showGenderFilter && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-white text-black w-full max-w-xs rounded-lg overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between p-4 border-b text-blue-500 font-bold">Gender Filter <button onClick={() => setShowGenderFilter(false)} className="text-zinc-400 text-2xl">✕</button></div>
            <div className="p-2">
              {[{ id: 'all', label: 'Everyone', icon: '👤', color: 'text-blue-500' }, { id: 'female', label: 'Females Only', icon: '♀️', color: 'text-pink-500' }, { id: 'male', label: 'Males Only', icon: '♂️', color: 'text-blue-400' }].map((opt) => (
                <button key={opt.id} onClick={() => { setSearchGender(opt.id); setShowGenderFilter(false); handleNext(opt.id); }} className="w-full flex items-center justify-between p-3 hover:bg-zinc-50 rounded-xl transition-all">
                  <div className="flex items-center gap-4"><span className={`text-xl ${opt.color}`}>{opt.icon}</span><span className={`text-sm font-medium ${searchGender === opt.id ? 'text-blue-500' : 'text-zinc-600'}`}>{opt.label}</span></div>
                  {searchGender === opt.id && <span className="text-blue-500">✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 relative flex flex-col h-full">
        {/* TOP VIDEO (Stranger) */}
        <div className={`h-1/2 relative bg-zinc-900 border-b border-white/5 transition-all duration-700 ${showModal ? 'blur-2xl opacity-50' : 'opacity-100'}`}>
           <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover bg-black" />
           
           {isSearching && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-md">
                  <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-[10px] font-black tracking-widest text-white uppercase bg-blue-600 px-4 py-1.5 rounded-full shadow-lg">{searchStatus}</p>
              </div>
           )}

           {matchNotification && (
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] animate-in zoom-in-95 fade-in duration-500">
                <div className="bg-blue-600/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl border border-white/20 whitespace-nowrap font-bold text-sm">✨ {matchNotification}</div>
             </div>
           )}

           <div className="absolute top-4 left-4 z-50">
                <h1 className="text-xl font-black italic tracking-tighter text-blue-500 bg-black/30 px-2 py-1 rounded">OMEGPT</h1>
                {partnerCountry && !isSearching && <div className="mt-1 text-[10px] font-bold bg-black/60 px-2 py-1 rounded-full border border-white/10 w-fit">🌍 {partnerCountry}</div>}
            </div>
        </div>

        {/* BOTTOM VIDEO (Self) */}
        <div className={`h-1/2 relative bg-zinc-900 transition-all duration-700 ${showModal ? 'blur-2xl' : ''}`}>
           <video ref={localVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover scale-x-[-1] bg-black`} />
           {!showModal && (
             <div className="absolute right-4 bottom-24 flex flex-col gap-4">
                <button onClick={() => setShowOptions(true)} className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg">⚙️</button>
                <button onClick={() => setShowGenderFilter(true)} className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg">🚻</button>
                <button onClick={() => setShowCountryFilter(true)} className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg">🏳️</button>
             </div>
           )}
           <div className="absolute bottom-6 right-4 z-[60]">
                {partnerId && (
                    <button onClick={() => setIsMobileInputActive(!isMobileInputActive)} className={`w-14 h-14 rounded-full flex items-center justify-center border-2 border-white/20 shadow-2xl ${isMobileInputActive ? 'bg-zinc-800' : 'bg-blue-600 animate-bounce-subtle'}`}>
                      <span className="text-2xl text-white">{isMobileInputActive ? '✕' : '💬'}</span>
                    </button>
                )}
            </div>
            {isMobileInputActive && (
              <div className="absolute bottom-6 left-4 right-20 z-[70] animate-in slide-in-from-bottom-2 duration-200">
                  <form onSubmit={sendMessage} className="flex bg-black/80 backdrop-blur-2xl border border-white/20 p-1 rounded-full shadow-2xl">
                      <input autoFocus value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type a message..." className="flex-1 bg-transparent px-4 py-2 text-sm outline-none text-white w-full" />
                      <button type="submit" className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center"> ➤ </button>
                  </form>
              </div>
            )}
        </div>
      </main>

      {/* LOGIN MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm text-center">
            <div className="relative max-w-sm w-full bg-zinc-900 border border-white/20 p-8 rounded-[40px] shadow-2xl space-y-8 animate-in zoom-in-95 duration-500">
                <div className="space-y-2">
                  <h2 className="text-5xl font-black italic tracking-tighter text-blue-500 uppercase drop-shadow-md">OMEGPT</h2>
                </div>
                <div className="space-y-4">
                  <p className="text-xs font-bold text-white uppercase tracking-wider block">Select Your Gender</p>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setMyGender("male")} className={`py-6 rounded-3xl font-black border-2 transition-all ${myGender === "male" ? "bg-blue-600 border-blue-400 shadow-lg scale-95" : "bg-black/40 border-white/10"}`}>MALE</button>
                    <button onClick={() => setMyGender("female")} className={`py-6 rounded-3xl font-black border-2 transition-all ${myGender === "female" ? "bg-pink-600 border-pink-400 shadow-lg scale-95" : "bg-black/40 border-white/10"}`}>FEMALE</button>
                  </div>
                </div>
                <button onClick={() => { if(!myGender) return alert("Select gender!"); setShowModal(false); handleNext(); }} className="w-full bg-white text-black py-5 rounded-[25px] font-black text-lg shadow-2xl transition-transform active:scale-95">START 🚀</button>
            </div>
        </div>
      )}

      <style jsx global>{`
        html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden !important; position: fixed; background: black; overscroll-behavior: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes bounce-horizontal { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(10px); } }
        .animate-bounce-horizontal { animation: bounce-horizontal 1.5s infinite ease-in-out; }
        @keyframes bounce-subtle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        .animate-bounce-subtle { animation: bounce-subtle 2s infinite ease-in-out; }
      `}</style>
    </div>
  );
}