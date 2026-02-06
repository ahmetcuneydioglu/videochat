"use client";
import { useEffect, useRef, useState, useMemo } from "react";
import { io } from "socket.io-client";
import Peer from "simple-peer";
import { countries as rawCountries } from 'countries-list';
import { 
  Video, VideoOff, Mic, MicOff, RefreshCw, 
  User, Flag, Settings, MessageCircle, X, 
  Play, Square, SkipForward, Globe, ShieldAlert, Check
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
    const setHeight = () => document.documentElement.style.setProperty('--vv-height', `${window.innerHeight}px`);
    setHeight();
    window.addEventListener('resize', setHeight);
    
    if (window.innerWidth < 768) {
        const hasSwiped = localStorage.getItem("hasSwipedBefore");
        if (!hasSwiped) setShowSwipeHint(true);
    }
    return () => window.removeEventListener('resize', setHeight);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    mobileChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isMobileInputActive]);

  const startMedia = async (mode: "user" | "environment" = facingMode) => {
    try {
      if (streamRef.current && streamRef.current.active) return;
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: true });
      streamRef.current = newStream;
      if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
    } catch (err) { console.error("Media error:", err); }
  };

  useEffect(() => {
    if (isMounted) startMedia();

    socket.on("partner_found", (data) => {
      if (!isActive) return;
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      setSearchStatus("Searching...");
      setMessages([]); 
      setPartnerId(data.partnerId); 
      
      const countryCode = (data.country || "UN").toUpperCase();
      const countryObj = allCountries.find(c => c.id === countryCode);
      const countryName = countryObj ? countryObj.name : "Global";
      
      setPartnerCountry(countryName);
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
    if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setPartnerId(null);
    setPartnerCountry(null);
    setMatchNotification(null);
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
    peer.on("stream", (remStream) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remStream; });
    peer.on("data", (data) => setMessages(prev => [...prev, { sender: "Stranger", text: new TextDecoder().decode(data) }]));
    peerRef.current = peer;
  }

  const handleNext = (overrideGender?: string, overrideCountry?: string) => {
    if (!isActive) return;
    cleanUpPeer();
    setIsSearching(true);
    setMatchNotification(null);
    setIsMobileInputActive(false);
    
    const targetGender = overrideGender || searchGender;
    const targetCountry = overrideCountry || selectedCountry;

    if (targetGender !== "all" || targetCountry !== "all") {
      setSearchStatus("Searching by preference...");
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setSearchStatus("Broadening search...");
        setTimeout(() => {
          socket.emit("find_partner", { myGender, searchGender: "all", selectedCountry: "all" });
        }, 2000);
      }, 15000);
    } else {
      setSearchStatus("Searching...");
    }

    socket.emit("find_partner", { myGender, searchGender: targetGender, selectedCountry: targetCountry });
  };

  const toggleActive = () => {
    const nextState = !isActive;
    setIsActive(nextState);
    if (nextState) {
      handleNext();
    } else {
      cleanUpPeer();
      setIsSearching(false);
      socket.emit("stop_search");
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

  const toggleCamera = () => { if (streamRef.current) { const track = streamRef.current.getVideoTracks()[0]; track.enabled = !cameraOn; setCameraOn(!cameraOn); } };
  const toggleMic = () => { if (streamRef.current) { const track = streamRef.current.getAudioTracks()[0]; track.enabled = !micOn; setMicOn(!micOn); } };

  if (!isMounted) return null;

  return (
    <div 
      className="fixed inset-0 w-full h-full bg-[#050505] text-zinc-100 flex flex-col font-sans overflow-hidden select-none" 
      style={{ height: 'var(--vv-height, 100vh)' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
    >
      {/* SWIPE HINT */}
      {showSwipeHint && !showModal && isActive && partnerId && (
        <div className="md:hidden fixed inset-y-0 right-0 z-[100] pointer-events-none flex items-center pr-10">
           <div className="flex flex-col items-center animate-swipe-left text-blue-500">
            <span className="text-5xl">⬅️</span>
            <p className="text-[10px] font-bold bg-blue-600 text-white px-2 py-1 rounded mt-2 uppercase tracking-tighter">Swipe to Next</p>
          </div>
        </div>
      )}

      {/* COUNTRY MODAL */}
      {showCountryFilter && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-[#121214] border border-white/10 w-full max-w-sm rounded-[32px] shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-blue-500 font-bold uppercase tracking-[0.2em] text-[10px]">Region Selection</h3>
              <button onClick={() => setShowCountryFilter(false)} className="text-zinc-500 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <div className="p-4">
              <input type="text" placeholder="Search country..." className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 px-4 mb-4 outline-none focus:border-blue-500/50 transition-all text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              <div className="max-h-[300px] overflow-y-auto no-scrollbar space-y-1">
                {filteredCountries.map((c) => (
                  <button key={c.id} onClick={() => { setSelectedCountry(c.id); setShowCountryFilter(false); handleNext(undefined, c.id); }} className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${selectedCountry === c.id ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20' : 'hover:bg-white/5 border border-transparent text-zinc-400'}`}>
                    <div className="flex items-center gap-3"><span>{c.flag}</span><span className="text-sm font-medium">{c.name}</span></div>
                    {selectedCountry === c.id && <Check size={16} className="text-blue-500" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GENDER FILTER MODAL */}
      {showGenderFilter && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md">
              <div className="bg-[#121214] border border-white/10 w-full max-w-xs rounded-[32px] p-2 shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between p-6 mb-2 text-zinc-500 font-bold text-[10px] uppercase tracking-[0.2em]">Gender Filter <button onClick={() => setShowGenderFilter(false)}><X size={20}/></button></div>
                  {['all', 'female', 'male'].map((opt) => (
                      <button key={opt} onClick={() => { setSearchGender(opt); setShowGenderFilter(false); handleNext(opt); }} className={`w-full flex items-center justify-between p-5 rounded-2xl mb-1 transition-all ${searchGender === opt ? 'bg-blue-600/20 text-blue-400 border border-blue-500/20' : 'hover:bg-white/5 border border-transparent text-zinc-400'}`}>
                          <span className="text-sm font-bold uppercase tracking-widest">{opt === 'all' ? 'Everyone' : opt + 's Only'}</span>
                          {searchGender === opt && <div className="w-2 h-2 bg-blue-500 rounded-full"></div>}
                      </button>
                  ))}
              </div>
          </div>
      )}

      {/* OPTIONS MODAL (FIXED) */}
      {showOptions && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md">
              <div className="bg-[#121214] border border-white/10 w-full max-w-xs rounded-[32px] p-4 shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between mb-6 text-zinc-500 font-bold text-[10px] uppercase tracking-[0.2em]">
                    Settings <button onClick={() => setShowOptions(false)}><X size={20}/></button>
                  </div>
                  <div className="space-y-3">
                      <button onClick={toggleCamera} className={`w-full flex items-center justify-between p-5 rounded-2xl transition-all ${cameraOn ? 'bg-blue-600/10 text-blue-400' : 'bg-red-500/10 text-red-500'}`}>
                          <div className="flex items-center gap-4">
                            {cameraOn ? <Video size={20}/> : <VideoOff size={20}/>}
                            <span className="text-sm font-bold uppercase tracking-widest">Camera</span>
                          </div>
                          <div className={`w-10 h-5 rounded-full relative transition-all ${cameraOn ? 'bg-blue-500' : 'bg-zinc-700'}`}>
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${cameraOn ? 'right-1' : 'left-1'}`}></div>
                          </div>
                      </button>
                      <button onClick={toggleMic} className={`w-full flex items-center justify-between p-5 rounded-2xl transition-all ${micOn ? 'bg-blue-600/10 text-blue-400' : 'bg-red-500/10 text-red-500'}`}>
                          <div className="flex items-center gap-4">
                            {micOn ? <Mic size={20}/> : <MicOff size={20}/>}
                            <span className="text-sm font-bold uppercase tracking-widest">Microphone</span>
                          </div>
                          <div className={`w-10 h-5 rounded-full relative transition-all ${micOn ? 'bg-blue-500' : 'bg-zinc-700'}`}>
                            <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${micOn ? 'right-1' : 'left-1'}`}></div>
                          </div>
                      </button>
                      <button onClick={() => { startMedia(facingMode === "user" ? "environment" : "user"); setFacingMode(facingMode === "user" ? "environment" : "user"); }} className="w-full flex items-center gap-4 p-5 rounded-2xl hover:bg-white/5 text-zinc-400 transition-all">
                          <RefreshCw size={20}/>
                          <span className="text-sm font-bold uppercase tracking-widest">Switch Camera</span>
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* MAIN LAYOUT */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative w-full h-full">
        <div className="flex-1 relative md:max-w-[50%] lg:max-w-[60%] h-full bg-black md:border-r border-white/5 z-10">
          
          {/* STRANGER VIDEO */}
          <div className={`absolute top-0 left-0 w-full h-[50%] overflow-hidden bg-zinc-900 border-b border-white/5 transition-all duration-700 ${showModal ? 'blur-2xl' : ''}`}>
             <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
             
             {!isActive && !showModal && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 backdrop-blur-xl">
                    <button onClick={toggleActive} className="group flex items-center gap-3 bg-blue-600 hover:bg-blue-500 text-white px-10 py-5 rounded-[24px] font-black text-lg transition-all active:scale-95 shadow-2xl shadow-blue-500/20 uppercase tracking-widest">
                        <Play size={24} fill="currentColor"/>
                        Start Chatting
                    </button>
                </div>
             )}

             {isSearching && isActive && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md">
                    <div className="relative">
                      <div className="w-12 h-12 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      </div>
                    </div>
                    <p className="mt-4 text-[10px] font-bold tracking-[0.3em] uppercase text-blue-400">Finding Partner...</p>
                </div>
             )}

             {matchNotification && isActive && (
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] animate-in zoom-in-95 fade-in duration-500">
                  <div className="bg-blue-600/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl border border-white/20 font-bold text-sm tracking-tight">✨ {matchNotification}</div>
               </div>
             )}

             <div className="absolute top-6 left-6 z-50 flex flex-col gap-2">
                  <h1 className="text-2xl font-black italic text-blue-500 tracking-tighter drop-shadow-lg">OMEGPT</h1>
                  {partnerCountry && isActive && !isSearching && (
                    <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 animate-in slide-in-from-left-4">
                      <span className="text-xs">🌍</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-100">{partnerCountry}</span>
                    </div>
                  )}
              </div>
          </div>

          {/* SELF VIDEO */}
          <div className={`absolute bottom-0 left-0 w-full h-[50%] overflow-hidden bg-zinc-900 transition-all duration-700 ${showModal ? 'blur-2xl' : ''}`}>
             <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
             
             {!showModal && (
               <div className="absolute right-6 top-6 flex flex-col gap-4 z-[80]">
                  <button onClick={() => setShowOptions(true)} className="w-12 h-12 bg-white/15 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-center hover:bg-white/25 transition-all active:scale-90 shadow-xl"><Settings size={22}/></button>
                  <button onClick={() => setShowGenderFilter(true)} className="w-12 h-12 bg-white/15 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-center hover:bg-white/25 transition-all active:scale-90 shadow-xl"><User size={22}/></button>
                  <button onClick={() => setShowCountryFilter(true)} className="w-12 h-12 bg-white/15 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-center hover:bg-white/25 transition-all active:scale-90 shadow-xl"><Globe size={22}/></button>
               </div>
             )}

             {/* MOBILE MESSAGES (CLEANER FONT) */}
             <div className="md:hidden absolute bottom-28 left-6 right-20 z-40 flex flex-col justify-end max-h-[220px] overflow-y-auto no-scrollbar pointer-events-none">
                {messages.map((m, i) => (
                    <div key={i} className={`px-3 py-1.5 rounded-xl text-[10px] mb-1.5 w-fit max-w-full backdrop-blur-md border animate-in slide-in-from-left-2 shadow-sm ${m.sender === "Me" ? "bg-blue-600/70 border-blue-400/20 text-white" : "bg-zinc-800/80 border-white/5 text-zinc-200"}`}>
                        <span className="font-bold opacity-60 mr-1 text-[9px] uppercase">{m.sender}</span>
                        <p className="inline leading-tight">{m.text}</p>
                    </div>
                ))}
                <div ref={mobileChatEndRef} />
             </div>

             {/* FLOATING CONTROL BAR */}
             {!showModal && (
                <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-md h-16 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[28px] flex items-center justify-between px-6 z-[100] shadow-2xl">
                    <button onClick={toggleActive} className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all shadow-lg active:scale-90 ${isActive ? 'bg-red-500/20 text-red-500 border border-red-500/20 hover:bg-red-500/30' : 'bg-green-500/20 text-green-500 border border-green-500/20 hover:bg-green-500/30'}`}>
                        {isActive ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                    </button>

                    <button 
                      onClick={() => handleNext()} 
                      disabled={!isActive}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white px-7 py-2.5 rounded-2xl font-black text-[10px] transition-all active:scale-95 uppercase tracking-[0.1em] shadow-xl shadow-blue-500/20"
                    >
                      <SkipForward size={14} fill="currentColor" />
                      <span>Next</span>
                    </button>

                    <button 
                      onClick={() => setIsMobileInputActive(!isMobileInputActive)} 
                      disabled={!isActive || !partnerId}
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all active:scale-90 ${isMobileInputActive ? 'bg-zinc-700 text-white' : 'bg-white/10 text-white hover:bg-white/20'} disabled:opacity-20`}
                    >
                      <MessageCircle size={20} />
                    </button>
                </div>
             )}

             {/* MESSAGE INPUT */}
             {isMobileInputActive && isActive && (
                <div className="md:hidden absolute bottom-24 left-6 right-6 z-[110] animate-in slide-in-from-bottom-4 duration-300">
                    <form onSubmit={sendMessage} className="flex bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 p-1.5 rounded-2xl shadow-2xl">
                        <input autoFocus value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Send message..." className="flex-1 bg-transparent px-4 py-2 text-sm outline-none text-white w-full" />
                        <button type="submit" className="bg-blue-600 text-white w-10 h-10 rounded-xl flex items-center justify-center hover:bg-blue-500 transition-all"> 
                           <SkipForward size={18} className="rotate-[-90deg]" />
                        </button>
                    </form>
                </div>
             )}
          </div>
        </div>

        {/* WEB CHAT AREA */}
        <div className="hidden md:flex flex-1 flex-col bg-[#080808] border-l border-white/5 h-full relative z-20">
          <div className="p-6 border-b border-white/5 bg-zinc-950/50 flex items-center justify-between font-bold text-zinc-400 tracking-widest text-[9px] uppercase">
             Live Interaction
             {!showModal && (
                <button onClick={toggleActive} className={`flex items-center gap-2 px-4 py-2 rounded-full text-[9px] font-black uppercase transition-all shadow-sm ${isActive ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}>
                    {isActive ? <Square size={10} fill="currentColor"/> : <Play size={10} fill="currentColor"/>}
                    {isActive ? 'Stop' : 'Start'}
                </button>
             )}
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-5 no-scrollbar text-black">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.sender === "Me" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[12px] leading-relaxed font-medium ${msg.sender === "Me" ? "bg-blue-600 text-white shadow-lg shadow-blue-500/10" : "bg-zinc-800/60 border border-white/5 text-zinc-100"}`}>
                  <span className="text-[9px] font-black opacity-40 block mb-0.5 uppercase tracking-tighter">{msg.sender}</span>
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-6 bg-zinc-950/50 border-t border-white/5 flex items-center gap-4">
            <button onClick={() => handleNext()} disabled={!isActive} className={`h-12 px-6 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all ${isActive ? 'bg-zinc-100 text-black hover:bg-white' : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'}`}>Next</button>
            <form onSubmit={sendMessage} className="flex-1 flex gap-2">
                <input disabled={!isActive} value={inputText} onChange={(e) => setInputText(e.target.value)} className="flex-1 bg-white/5 border border-white/10 p-3 rounded-2xl text-white outline-none focus:border-blue-500/50 disabled:opacity-20 transition-all text-[13px]" placeholder={isActive ? "Type a message..." : "Chat offline"} />
                <button disabled={!isActive} type="submit" className={`h-12 w-12 flex items-center justify-center rounded-2xl font-bold transition-all ${isActive ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-zinc-800 text-zinc-600'}`}><SkipForward size={18} className="rotate-[-90deg]"/></button>
            </form>
          </div>
        </div>
      </main>

      {/* LOGIN SCREEN */}
      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/85 backdrop-blur-2xl">
            <div className="relative max-w-sm w-full bg-[#111113] border border-white/10 p-10 rounded-[48px] text-center space-y-10 shadow-2xl">
                <div className="space-y-3">
                  <h2 className="text-5xl font-black italic tracking-tighter text-blue-500 uppercase drop-shadow-2xl">OMEGPT</h2>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-[0.4em]">Premium Network</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setMyGender("male")} className={`flex flex-col items-center gap-3 py-8 rounded-[32px] font-bold border-2 transition-all active:scale-95 ${myGender === "male" ? "bg-blue-600/10 border-blue-500 text-blue-500" : "bg-black/20 border-white/5 text-zinc-500"}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${myGender === "male" ? "bg-blue-500 text-white shadow-lg shadow-blue-500/40" : "bg-zinc-800"}`}>♂</div>
                        <span className="text-[10px] uppercase tracking-widest font-black">Male</span>
                    </button>
                    <button onClick={() => setMyGender("female")} className={`flex flex-col items-center gap-3 py-8 rounded-[32px] font-bold border-2 transition-all active:scale-95 ${myGender === "female" ? "bg-pink-600/10 border-pink-500 text-pink-500" : "bg-black/20 border-white/5 text-zinc-500"}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${myGender === "female" ? "bg-pink-500 text-white shadow-lg shadow-pink-500/40" : "bg-zinc-800"}`}>♀</div>
                        <span className="text-[10px] uppercase tracking-widest font-black">Female</span>
                    </button>
                </div>
                <button onClick={() => { if(!myGender) return alert("Select gender!"); setShowModal(false); setIsActive(true); handleNext(); }} className="group relative w-full bg-zinc-100 text-black py-5 rounded-[24px] font-black text-lg transition-all hover:bg-blue-600 hover:text-white active:scale-95 shadow-xl">
                    LET'S GO 🚀
                </button>
            </div>
        </div>
      )}

      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap');
        html, body { 
          font-family: 'Inter', sans-serif;
          background: #000;
          color: white;
          overflow: hidden;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes swipe-left { 0%, 100% { transform: translateX(0); opacity: 0.8; } 50% { transform: translateX(-15px); opacity: 1; } }
        .animate-swipe-left { animation: swipe-left 1.5s infinite ease-in-out; }
      `}</style>
    </div>
  );
}