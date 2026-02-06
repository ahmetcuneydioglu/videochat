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

  const [isActive, setIsActive] = useState(false);
  const [showModal, setShowModal] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [showGenderFilter, setShowGenderFilter] = useState(false);
  const [showCountryFilter, setShowCountryFilter] = useState(false);
  
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [myGender, setMyGender] = useState<string | null>(null);
  const [partnerGender, setPartnerGender] = useState<string | null>(null);
  
  const [searchGender, setSearchGender] = useState("all"); 
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  
  const [partnerCountry, setPartnerCountry] = useState<string | null>(null);
  const [partnerFlag, setPartnerFlag] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ sender: string, text: string }[]>([]);
  const [inputText, setInputText] = useState("");
  const [isMobileInputActive, setIsMobileInputActive] = useState(false);
  const [matchNotification, setMatchNotification] = useState<string | null>(null);

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
    return () => window.removeEventListener('resize', setHeight);
  }, []);

  useEffect(() => {
    mobileChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startMedia = async (mode: "user" | "environment" = facingMode) => {
    try {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: true });
      streamRef.current = newStream;
      if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
    } catch (err) { console.error("Media error:", err); }
  };

  useEffect(() => {
    if (isMounted) startMedia();

    socket.on("partner_found", (data) => {
        if (!isActive) return;
        setMessages([]); 
        setPartnerId(data.partnerId); 
        setPartnerGender(data.partnerGender || 'male'); 
        
        const countryCode = (data.country || "UN").toUpperCase();
        const countryObj = allCountries.find(c => c.id === countryCode);
        setPartnerCountry(countryObj ? countryObj.name : "Global");
        setPartnerFlag(countryObj ? countryObj.flag : "🌐");
        
        setIsSearching(false); 
        initiatePeer(data.partnerId, data.initiator);
        setMatchNotification(`Matched with ${countryObj?.name || 'Global'}`);
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
        initiator, trickle: false, stream: streamRef.current,
        config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] }
    });
    peer.on("signal", (data) => socket.emit("signal", { to: targetId, signal: data }));
    peer.on("stream", (remStream) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remStream; });
    peer.on("data", (data) => setMessages(prev => [...prev, { sender: "Stranger", text: new TextDecoder().decode(data) }]));
    peerRef.current = peer;
  }

  const handleNext = () => {
    if (!isActive) return;
    cleanUpPeer();
    setIsSearching(true);
    socket.emit("find_partner", { myGender, searchGender, selectedCountry });
  };

  const toggleActive = () => {
    const nextState = !isActive;
    setIsActive(nextState);
    if (nextState) handleNext();
    else { cleanUpPeer(); setIsSearching(false); socket.emit("stop_search"); }
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
    <div className="fixed inset-0 w-full h-full bg-[#050505] text-white flex flex-col font-sans overflow-hidden" style={{ height: 'var(--vv-height, 100vh)' }}>
      
      {/* MODALLAR (Country/Gender - Aynı Mantık) */}
      {showCountryFilter && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="bg-[#121214] border border-white/10 w-full max-w-sm rounded-[32px] p-6 shadow-2xl animate-in zoom-in-95">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-blue-500 font-bold uppercase text-xs tracking-widest">Region</h3>
              <button onClick={() => setShowCountryFilter(false)}><X size={20}/></button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[300px] no-scrollbar">
              {filteredCountries.map(c => (
                <button key={c.id} onClick={() => { setSelectedCountry(c.id); setShowCountryFilter(false); handleNext(); }} className="w-full flex items-center gap-3 p-4 hover:bg-white/5 rounded-2xl">
                  <span>{c.flag}</span> <span className="text-sm">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <div className="flex-1 relative md:max-w-[50%] h-full bg-black">
          {/* ÜST VİDEO */}
          <div className="absolute top-0 left-0 w-full h-[50%] overflow-hidden bg-zinc-900 border-b border-white/5">
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            
            {/* STRANGER INFO ETİKETİ */}
            {!isSearching && isActive && partnerId && (
              <div className="absolute top-6 left-6 z-[60] animate-in slide-in-from-left-8">
                <div className="flex items-center gap-3 bg-black/40 backdrop-blur-2xl border border-white/10 pl-1.5 pr-4 py-1.5 rounded-full shadow-2xl">
                   <div className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-full text-2xl">{partnerFlag}</div>
                   <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div>
                        <span className="text-[11px] font-black text-white uppercase">{partnerCountry}</span>
                      </div>
                      <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Live Connection</span>
                   </div>
                   <div className="h-6 w-[1px] bg-white/10 mx-1"></div>
                   <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${partnerGender === 'female' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'}`}>
                      <span className="text-xl font-bold">{partnerGender === 'female' ? '♀' : '♂'}</span>
                   </div>
                </div>
              </div>
            )}

            {!isActive && !showModal && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-xl">
                <button onClick={toggleActive} className="bg-blue-600 text-white px-10 py-5 rounded-[24px] font-black uppercase text-xs flex items-center gap-3"><Play size={20} fill="currentColor"/> Start Chat</button>
              </div>
            )}
            {isSearching && isActive && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-md text-center">
                <div className="w-10 h-10 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
                <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Searching...</p>
              </div>
            )}
            <div className="absolute top-6 right-6 z-50"><h1 className="text-xl font-black italic text-blue-500 tracking-tighter">OMEGPT</h1></div>
          </div>

          {/* ALT VİDEO */}
          <div className="absolute bottom-0 left-0 w-full h-[50%] overflow-hidden bg-zinc-900">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            {!showModal && (
              <div className="absolute right-6 top-6 flex flex-col gap-4 z-[80]">
                <button onClick={() => setShowOptions(true)} className="w-14 h-14 bg-white/20 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-center shadow-2xl active:scale-90 transition-all"><Settings size={26}/></button>
                <button onClick={() => setShowGenderFilter(true)} className="w-14 h-14 bg-white/20 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-center shadow-2xl active:scale-90 transition-all"><User size={26}/></button>
                <button onClick={() => setShowCountryFilter(true)} className="w-14 h-14 bg-white/20 backdrop-blur-xl border border-white/20 rounded-2xl flex items-center justify-center shadow-2xl active:scale-90 transition-all"><Globe size={26}/></button>
              </div>
            )}
            
            {/* MOBİL MESAJLAR */}
            <div className="md:hidden absolute bottom-28 left-6 right-20 z-40 flex flex-col justify-end max-h-[160px] overflow-y-auto no-scrollbar pointer-events-none">
                {messages.map((m, i) => (
                    <div key={i} className={`px-3 py-1.5 rounded-xl text-[10px] mb-1.5 w-fit max-w-[90%] backdrop-blur-md border border-white/10 ${m.sender === "Me" ? "bg-blue-600/70" : "bg-zinc-800/80"}`}>
                        <span className="font-bold opacity-40 mr-1 text-[8px] uppercase">{m.sender}</span>
                        <p className="inline leading-tight">{m.text}</p>
                    </div>
                ))}
                <div ref={mobileChatEndRef} />
            </div>

            {/* KONTROL BAR */}
            {!showModal && (
              <div className="md:hidden absolute bottom-6 left-1/2 -translate-x-1/2 w-[92%] h-16 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[28px] flex items-center justify-between px-6 z-[100] shadow-2xl">
                <button onClick={toggleActive} className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isActive ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}`}>
                  {isActive ? <Square size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </button>
                <button onClick={() => handleNext()} disabled={!isActive} className="bg-blue-600 text-white px-7 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest disabled:opacity-30 flex items-center gap-2"><SkipForward size={14} fill="currentColor" /> Next</button>
                <button onClick={() => setIsMobileInputActive(!isMobileInputActive)} disabled={!isActive || !partnerId} className={`w-11 h-11 rounded-2xl flex items-center justify-center ${isMobileInputActive ? 'bg-zinc-700' : 'bg-white/10'}`}><MessageCircle size={20} /></button>
              </div>
            )}
          </div>
        </div>

        {/* WEB CHAT AREA */}
        <div className="hidden md:flex flex-1 flex-col bg-[#080808] border-l border-white/5 relative z-20">
          <div className="p-6 border-b border-white/5 flex items-center justify-between font-black text-zinc-500 uppercase tracking-widest text-[10px]">Interaction Area</div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.sender === "Me" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-[11px] ${msg.sender === "Me" ? "bg-blue-600 text-white" : "bg-zinc-800/60 border border-white/5 text-zinc-100"}`}>
                   {msg.text}
                </div>
              </div>
            ))}
          </div>
          <div className="p-6 bg-zinc-950/50 border-t border-white/5 flex gap-4">
            <button onClick={() => handleNext()} disabled={!isActive} className="h-12 px-6 rounded-2xl bg-zinc-100 text-black font-black uppercase text-xs">Next</button>
            <form onSubmit={sendMessage} className="flex-1 flex gap-2">
              <input value={inputText} onChange={(e) => setInputText(e.target.value)} disabled={!isActive} className="flex-1 bg-white/5 border border-white/10 p-3 rounded-2xl text-white outline-none text-xs" placeholder="Type message..." />
              <button type="submit" className="h-12 w-12 flex items-center justify-center rounded-2xl bg-blue-600 text-white"><SkipForward size={18} className="rotate-[-90deg]"/></button>
            </form>
          </div>
        </div>
      </main>

      {/* LOGIN SCREEN */}
      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/85 backdrop-blur-2xl">
            <div className="relative max-w-sm w-full bg-[#111113] border border-white/10 p-10 rounded-[48px] text-center space-y-10 shadow-2xl">
                <div className="space-y-3"><h2 className="text-5xl font-black italic tracking-tighter text-blue-500 uppercase">OMEGPT</h2></div>
                <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setMyGender("male")} className={`flex flex-col items-center gap-3 py-8 rounded-[32px] font-bold border-2 transition-all ${myGender === "male" ? "bg-blue-600/10 border-blue-500 text-blue-500" : "bg-black/20 border-white/5 text-zinc-500"}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${myGender === "male" ? "bg-blue-500 text-white shadow-lg" : "bg-zinc-800"}`}>♂</div>
                        <span className="text-[10px] uppercase font-black">Male</span>
                    </button>
                    <button onClick={() => setMyGender("female")} className={`flex flex-col items-center gap-3 py-8 rounded-[32px] font-bold border-2 transition-all ${myGender === "female" ? "bg-pink-600/10 border-pink-500 text-pink-500" : "bg-black/20 border-white/5 text-zinc-500"}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl ${myGender === "female" ? "bg-pink-500 text-white shadow-lg" : "bg-zinc-800"}`}>♀</div>
                        <span className="text-[10px] uppercase font-black">Female</span>
                    </button>
                </div>
                <button onClick={() => { if(!myGender) return alert("Select gender!"); setShowModal(false); setIsActive(true); handleNext(); }} className="w-full bg-zinc-100 text-black py-5 rounded-[24px] font-black text-lg hover:bg-blue-600 hover:text-white transition-all">LET'S GO 🚀</button>
            </div>
        </div>
      )}
    </div>
  );
}