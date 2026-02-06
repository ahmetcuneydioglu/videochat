"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";
import { countries as rawCountries } from 'countries-list';
import { 
  Video, VideoOff, Mic, MicOff, RefreshCw, 
  User, Flag, Settings, MessageCircle, X, 
  Play, Square, SkipForward, Globe, Check
} from 'lucide-react';

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
  const [partnerGender, setPartnerGender] = useState<string | null>(null);

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const [isActive, setIsActive] = useState(false);
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
  const [partnerFlag, setPartnerFlag] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStatus, setSearchStatus] = useState("Searching...");
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ sender: string, text: string }[]>([]);
  const [inputText, setInputText] = useState("");
  const [isMobileInputActive, setIsMobileInputActive] = useState(false);
  const [matchNotification, setMatchNotification] = useState<string | null>(null);
  const [showSwipeHint, setShowSwipeHint] = useState(false);

  const getFlagEmoji = (countryCode: string) => {
    if (countryCode === "all" || countryCode === "UN") return "🌐";
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
    const setHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    setHeight();
    window.addEventListener('resize', setHeight);
    return () => window.removeEventListener('resize', setHeight);
  }, []);

  useEffect(() => {
    mobileChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startMedia = async (mode: "user" | "environment" = facingMode) => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: mode, width: { ideal: 640 }, height: { ideal: 480 } }, 
        audio: true 
      });
      streamRef.current = newStream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = newStream;
        localVideoRef.current.play().catch(e => console.error("Video play error:", e));
      }
    } catch (err) { 
      console.error("Media error:", err);
      alert("Please allow camera and microphone access to start.");
    }
  };

  useEffect(() => {
    if (isMounted) startMedia();

    socket.on("partner_found", (data) => {
        if (!isActive) return;
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        
        setMessages([]); 
        setPartnerId(data.partnerId); 
        setPartnerGender(data.partnerGender); 
        
        const countryCode = (data.country || "UN").toUpperCase();
        const countryObj = allCountries.find(c => c.id === countryCode);
        const countryName = countryObj ? countryObj.name : "Global";
        
        setPartnerCountry(countryName);
        setPartnerFlag(countryObj ? countryObj.flag : "🌐");
        
        setIsSearching(false); 
        initiatePeer(data.partnerId, data.initiator);
        setMatchNotification(`Matched with ${countryName}`);
        setTimeout(() => setMatchNotification(null), 4000);
    });

    socket.on("partner_disconnected", () => {
      cleanUpPeer();
      if (isActive) setTimeout(() => handleNext(), 1000);
    });

    socket.on("signal", (data) => {
        if (peerRef.current) peerRef.current.signal(data.signal);
    });

    return () => { socket.off("partner_found"); socket.off("partner_disconnected"); socket.off("signal"); };
  }, [isMounted, allCountries, isActive]);

  const cleanUpPeer = () => {
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setPartnerId(null);
    setPartnerCountry(null);
    setPartnerFlag(null);
    setPartnerGender(null);
  };

  function initiatePeer(targetId: string, initiator: boolean) {
    if (!streamRef.current) return;
    const peer = new Peer({ 
        initiator, 
        trickle: false, 
        stream: streamRef.current,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
    });
    peer.on("signal", (data) => socket.emit("signal", { to: targetId, signal: data }));
    peer.on("stream", (remStream) => { 
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remStream;
        remoteVideoRef.current.play().catch(e => console.error("Remote video play error:", e));
      }
    });
    peer.on("data", (data) => setMessages(prev => [...prev, { sender: "Stranger", text: new TextDecoder().decode(data) }]));
    peerRef.current = peer;
  }

  const handleNext = () => {
    if (!isActive) return;
    cleanUpPeer();
    setIsSearching(true);
    setIsMobileInputActive(false);
    socket.emit("find_partner", { myGender, searchGender, selectedCountry });
  };

  const toggleActive = () => {
    const nextState = !isActive;
    setIsActive(nextState);
    if (nextState) handleNext();
    else { cleanUpPeer(); setIsSearching(false); socket.emit("stop_search"); }
  };

  const onTouchStart = (e: React.TouchEvent) => { touchEndX.current = null; touchStartX.current = e.targetTouches[0].clientX; };
  const onTouchMove = (e: React.TouchEvent) => (touchEndX.current = e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current || !isActive) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 70 && !isSearching) handleNext();
  };

  const sendMessage = (e: any) => {
    e.preventDefault();
    if (inputText.trim() && peerRef.current?.connected) {
      peerRef.current.send(inputText.trim());
      setMessages(prev => [...prev, { sender: "Me", text: inputText.trim() }]);
      setInputText("");
    }
  };

  const toggleCamera = () => { if (streamRef.current) { const track = streamRef.current.getVideoTracks()[0]; track.enabled = !cameraOn; setCameraOn(!cameraOn); } };
  const toggleMic = () => { if (streamRef.current) { const track = streamRef.current.getAudioTracks()[0]; track.enabled = !micOn; setMicOn(!micOn); } };

  if (!isMounted) return null;

  return (
    <div 
      className="fixed inset-0 w-full bg-[#050505] text-white flex flex-col font-sans overflow-hidden select-none" 
      style={{ height: 'calc(var(--vh, 1vh) * 100)' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
    >
      
      {/* MODALLAR (Options, Gender, Country) */}
      {showOptions && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
          <div className="bg-[#121214] border border-white/10 w-full max-w-xs rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between mb-8">
              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Settings</span>
              <button onClick={() => setShowOptions(false)}><X size={20}/></button>
            </div>
            <div className="space-y-4">
              <button onClick={toggleCamera} className={`w-full flex items-center justify-between p-4 rounded-2xl ${cameraOn ? 'bg-blue-600/10 text-blue-400' : 'bg-red-500/10 text-red-500'}`}>
                <div className="flex items-center gap-4">{cameraOn ? <Video size={20}/> : <VideoOff size={20}/>} <span className="text-xs font-bold uppercase tracking-widest">Camera</span></div>
              </button>
              <button onClick={toggleMic} className={`w-full flex items-center justify-between p-4 rounded-2xl ${micOn ? 'bg-blue-600/10 text-blue-400' : 'bg-red-500/10 text-red-500'}`}>
                <div className="flex items-center gap-4">{micOn ? <Mic size={20}/> : <MicOff size={20}/>} <span className="text-xs font-bold uppercase tracking-widest">Mic</span></div>
              </button>
              <button onClick={() => { startMedia(facingMode === "user" ? "environment" : "user"); setFacingMode(facingMode === "user" ? "environment" : "user"); }} className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5 text-zinc-400"><RefreshCw size={20}/> <span className="text-xs font-bold uppercase tracking-widest">Switch</span></button>
            </div>
          </div>
        </div>
      )}

      {showGenderFilter && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
          <div className="bg-[#121214] border border-white/10 w-full max-w-xs rounded-[32px] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-6 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Gender Filter <button onClick={() => setShowGenderFilter(false)}><X size={20}/></button></div>
            {['all', 'female', 'male'].map((opt) => (
              <button key={opt} onClick={() => { setSearchGender(opt); setShowGenderFilter(false); handleNext(); }} className={`w-full flex items-center justify-between p-4 rounded-2xl mb-1 ${searchGender === opt ? 'bg-blue-600/20 text-blue-400' : 'text-zinc-400'}`}>
                <span className="text-xs font-bold uppercase tracking-widest">{opt === 'all' ? 'Everyone' : opt}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showCountryFilter && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#121214] border border-white/10 w-full max-w-sm rounded-[32px] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-500">Region <button onClick={() => setShowCountryFilter(false)}><X size={20}/></button></div>
            <input type="text" placeholder="Search..." className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 mb-4 outline-none text-xs" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <div className="max-h-[250px] overflow-y-auto space-y-1">
              {filteredCountries.map((c) => (
                <button key={c.id} onClick={() => { setSelectedCountry(c.id); setShowCountryFilter(false); handleNext(); }} className={`w-full flex items-center justify-between p-4 rounded-2xl ${selectedCountry === c.id ? 'bg-blue-600/20 text-blue-400' : 'text-zinc-400'}`}>
                  <div className="flex items-center gap-3 text-xs"><span>{c.flag}</span><span>{c.name}</span></div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative h-full">
        <div className="flex-1 relative md:max-w-[50%] lg:max-w-[60%] h-full bg-black md:border-r border-white/5">
          
          {/* ÜST VİDEO (Remote) */}
          <div className="absolute top-0 left-0 w-full h-[50%] overflow-hidden bg-zinc-900 border-b border-white/5">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            
            {/* ETİKET (STRANGER INFO) */}
            {!isSearching && isActive && partnerId && (
              <div className="absolute top-4 left-4 z-[60] animate-in slide-in-from-left-4 duration-500">
                <div className="flex items-center gap-3 bg-black/40 backdrop-blur-xl border border-white/10 pl-1.5 pr-4 py-1.5 rounded-full shadow-2xl">
                   <div className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-full text-2xl">{partnerFlag}</div>
                   <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                        <span className="text-[10px] font-black text-white uppercase leading-none">{partnerCountry}</span>
                      </div>
                      <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Live Connection</span>
                   </div>
                   <div className="h-6 w-[1px] bg-white/10 mx-1"></div>
                   <div className={`flex items-center justify-center w-8 h-8 rounded-xl ${partnerGender === 'female' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      <span className="text-lg font-bold">{partnerGender === 'female' ? '♀' : '♂'}</span>
                   </div>
                </div>
              </div>
            )}

            {!isActive && !showModal && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-xl">
                <button onClick={toggleActive} className="bg-blue-600 text-white px-10 py-5 rounded-[24px] font-black uppercase tracking-widest text-[10px] flex items-center gap-3"><Play size={20} fill="currentColor"/> Start Chat</button>
              </div>
            )}
            
            {isSearching && isActive && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md">
                <div className="w-12 h-12 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                <p className="mt-4 text-[9px] font-black uppercase tracking-[0.3em] text-blue-400">Searching...</p>
              </div>
            )}
            <div className="absolute top-6 right-6 z-50"><h1 className="text-xl font-black italic text-blue-500 tracking-tighter">OMEGPT</h1></div>
          </div>

          {/* ALT VİDEO (Local) */}
          <div className="absolute bottom-0 left-0 w-full h-[50%] overflow-hidden bg-zinc-900">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            
            {!showModal && (
              <div className="absolute right-6 top-6 flex flex-col gap-4 z-[80]">
                <button onClick={() => setShowOptions(true)} className="w-12 h-12 bg-white/20 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-center shadow-2xl"><Settings size={22}/></button>
                <button onClick={() => setShowGenderFilter(true)} className="w-12 h-12 bg-white/20 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-center shadow-2xl"><User size={22}/></button>
                <button onClick={() => setShowCountryFilter(true)} className="w-12 h-12 bg-white/20 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-center shadow-2xl"><Globe size={22}/></button>
              </div>
            )}

            {/* MESSAGES */}
            <div className="md:hidden absolute bottom-28 left-6 right-20 z-40 flex flex-col justify-end max-h-[200px] overflow-y-auto no-scrollbar pointer-events-none">
                {messages.map((m, i) => (
                    <div key={i} className={`px-3 py-1.5 rounded-xl text-[10px] mb-1.5 w-fit max-w-[90%] backdrop-blur-md border border-white/10 ${m.sender === "Me" ? "bg-blue-600/70 text-white" : "bg-zinc-800/80 text-zinc-200"}`}>
                        <span className="font-bold opacity-40 mr-1 text-[8px] uppercase">{m.sender}</span>
                        <p className="inline leading-tight">{m.text}</p>
                    </div>
                ))}
                <div ref={mobileChatEndRef} />
            </div>

            {/* CONTROL BAR */}
            {!showModal && (
              <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 w-[92%] h-16 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[28px] flex items-center justify-between px-6 z-[100] shadow-2xl">
                <button onClick={toggleActive} className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isActive ? 'bg-red-500/20 text-red-500 border border-red-500/20' : 'bg-green-500/20 text-green-500 border border-green-500/20'}`}>
                  {isActive ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </button>
                <button onClick={() => handleNext()} disabled={!isActive} className="bg-blue-600 text-white px-7 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 flex items-center gap-2"><SkipForward size={14} fill="currentColor" /> Next</button>
                <button onClick={() => setIsMobileInputActive(!isMobileInputActive)} disabled={!isActive || !partnerId} className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isMobileInputActive ? 'bg-zinc-700' : 'bg-white/10'}`}><MessageCircle size={20} /></button>
              </div>
            )}

            {isMobileInputActive && isActive && (
              <div className="md:hidden absolute bottom-24 left-6 right-6 z-[110] animate-in slide-in-from-bottom-2 duration-200">
                <form onSubmit={sendMessage} className="flex bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 p-1.5 rounded-2xl shadow-2xl">
                  <input autoFocus value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type a message..." className="flex-1 bg-transparent px-4 py-2 text-xs outline-none text-white w-full" />
                  <button type="submit" className="bg-blue-600 text-white w-10 h-10 rounded-xl flex items-center justify-center"><SkipForward size={18} className="rotate-[-90deg]" /></button>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* WEB CHAT AREA */}
        <div className="hidden md:flex flex-1 flex-col bg-[#080808] border-l border-white/5 relative z-20 h-full">
          <div className="p-6 border-b border-white/5 flex items-center justify-between font-black text-zinc-500 uppercase tracking-[0.3em] text-[10px]">Interaction Area
            {!showModal && (
              <button onClick={toggleActive} className={`flex items-center gap-2 px-4 py-2 rounded-full text-[9px] ${isActive ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}>
                {isActive ? <Square size={10} fill="currentColor"/> : <Play size={10} fill="currentColor"/>} {isActive ? 'Stop' : 'Start'}
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.sender === "Me" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[11px] ${msg.sender === "Me" ? "bg-blue-600 text-white" : "bg-zinc-800/60 border border-white/5 text-zinc-100"}`}>
                  <span className="text-[8px] font-black opacity-30 block mb-0.5 uppercase tracking-tighter">{msg.sender}</span> {msg.text}
                </div>
              </div>
            ))}
          </div>
          <div className="p-6 bg-zinc-950/50 border-t border-white/5 flex items-center gap-4">
            <button onClick={() => handleNext()} disabled={!isActive} className="h-12 px-6 rounded-2xl font-black uppercase text-[10px] tracking-widest bg-zinc-100 text-black">Next</button>
            <form onSubmit={sendMessage} className="flex-1 flex gap-2">
              <input disabled={!isActive} value={inputText} onChange={(e) => setInputText(e.target.value)} className="flex-1 bg-white/5 border border-white/10 p-3 rounded-2xl text-white outline-none text-xs" placeholder="Type message..." />
              <button disabled={!isActive} type="submit" className="h-12 w-12 flex items-center justify-center rounded-2xl bg-blue-600 text-white"><SkipForward size={18} className="rotate-[-90deg]"/></button>
            </form>
          </div>
        </div>
      </main>

      {/* LOGIN SCREEN */}
      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/85 backdrop-blur-2xl">
            <div className="relative max-w-sm w-full bg-[#111113] border border-white/10 p-10 rounded-[48px] text-center space-y-10">
                <div className="space-y-3">
                  <h2 className="text-5xl font-black italic tracking-tighter text-blue-500 uppercase drop-shadow-2xl">OMEGPT</h2>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.4em]">Premium Network</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setMyGender("male")} className={`flex flex-col items-center gap-3 py-8 rounded-[32px] font-bold border-2 transition-all ${myGender === "male" ? "bg-blue-600/10 border-blue-500 text-blue-500" : "bg-black/20 border-white/5 text-zinc-500"}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${myGender === "male" ? "bg-blue-500 text-white shadow-lg shadow-blue-500/40" : "bg-zinc-800"}`}>♂</div>
                        <span className="text-[10px] uppercase tracking-widest font-black">Male</span>
                    </button>
                    <button onClick={() => setMyGender("female")} className={`flex flex-col items-center gap-3 py-8 rounded-[32px] font-bold border-2 transition-all ${myGender === "female" ? "bg-pink-600/10 border-pink-500 text-pink-500" : "bg-black/20 border-white/5 text-zinc-500"}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${myGender === "female" ? "bg-pink-500 text-white shadow-lg shadow-pink-500/40" : "bg-zinc-800"}`}>♀</div>
                        <span className="text-[10px] uppercase tracking-widest font-black">Female</span>
                    </button>
                </div>
                <button onClick={() => { if(!myGender) return alert("Select gender!"); setShowModal(false); setIsActive(true); handleNext(); }} className="w-full bg-zinc-100 text-black py-5 rounded-[24px] font-black text-lg hover:bg-blue-600 hover:text-white transition-all active:scale-95">LET'S GO 🚀</button>
            </div>
        </div>
      )}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap');
        html, body { font-family: 'Inter', sans-serif; background: #000; color: white; overflow: hidden; height: -webkit-fill-available; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes swipe-left { 0%, 100% { transform: translateX(0); opacity: 0.8; } 50% { transform: translateX(-15px); opacity: 1; } }
        .animate-swipe-left { animation: swipe-left 1.5s infinite ease-in-out; }
      `}</style>
    </div>
  );
}