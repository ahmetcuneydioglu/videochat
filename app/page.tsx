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

  const [isActive, setIsActive] = useState(false); // Start/Stop kontrolü
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
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      setSearchStatus("Searching...");
      setMessages([]); 
      setPartnerId(data.partnerId); 
      
      // Ülke İsmi Çözümleme Fix (Ham kod geldiyse kütüphaneden ismini çek)
      const countryCode = (data.country || "UN").toUpperCase();
      const countryObj = allCountries.find(c => c.id === countryCode);
      const countryName = countryObj ? countryObj.name : "Global";
      
      setPartnerCountry(countryName);
      setIsSearching(false); 
      initiatePeer(data.partnerId, data.initiator);

      setMatchNotification(`You matched with someone from ${countryName}`);
      setTimeout(() => setMatchNotification(null), 4000);
    });

    socket.on("partner_disconnected", () => {
      if (peerRef.current) peerRef.current.destroy();
      setPartnerId(null);
      setPartnerCountry(null);
      setMatchNotification(null);
      if (isActive) setTimeout(() => handleNext(), 1000);
    });

    socket.on("signal", (data) => peerRef.current?.signal(data.signal));

    return () => { socket.off("partner_found"); socket.off("partner_disconnected"); socket.off("signal"); };
  }, [isMounted, allCountries, isActive]);

  function initiatePeer(targetId: string, initiator: boolean) {
    if (!streamRef.current) return;
    const peer = new Peer({ initiator, trickle: false, stream: streamRef.current });
    peer.on("signal", (data) => socket.emit("signal", { to: targetId, signal: data }));
    peer.on("stream", (remStream) => { if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remStream; });
    peer.on("data", (data) => setMessages(prev => [...prev, { sender: "Stranger", text: new TextDecoder().decode(data) }]));
    peerRef.current = peer;
  }

  const handleNext = (overrideGender?: string, overrideCountry?: string) => {
    if (!isActive) return;
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    
    const targetGender = overrideGender || searchGender;
    const targetCountry = overrideCountry || selectedCountry;

    setPartnerId(null);
    setIsSearching(true);
    setMatchNotification(null);
    setIsMobileInputActive(false);
    
    if (targetGender !== "all" || targetCountry !== "all") {
      setSearchStatus("Searching by preference...");
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setSearchStatus("No matches, broadening search...");
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
      if (peerRef.current) peerRef.current.destroy();
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      setIsSearching(false);
      setPartnerId(null);
      setPartnerCountry(null);
      socket.emit("stop_search");
    }
  };

  const onTouchStart = (e: React.TouchEvent) => { touchEndX.current = null; touchStartX.current = e.targetTouches[0].clientX; };
  const onTouchMove = (e: React.TouchEvent) => (touchEndX.current = e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current || !isActive) return;
    const distance = touchStartX.current - touchEndX.current;
    if (distance > 70 && !isSearching) {
        if (showSwipeHint) { setShowSwipeHint(false); localStorage.setItem("hasSwipedBefore", "true"); }
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

  const toggleCamera = () => { if (streamRef.current) { const track = streamRef.current.getVideoTracks()[0]; track.enabled = !cameraOn; setCameraOn(!cameraOn); } };
  const toggleMic = () => { if (streamRef.current) { const track = streamRef.current.getAudioTracks()[0]; track.enabled = !micOn; setMicOn(!micOn); } };

  if (!isMounted) return null;

  return (
    <div 
      className="fixed inset-0 w-full h-full bg-black text-white flex flex-col font-sans overflow-hidden select-none" 
      style={{ height: 'var(--vv-height, 100vh)' }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
    >
      {/* SWIPE HINT (Ok Yönü Düzeltildi: Sağdan Sola ⬅️) */}
      {showSwipeHint && !showModal && isActive && partnerId && (
        <div className="md:hidden fixed inset-y-0 right-0 z-[100] pointer-events-none flex items-center pr-10">
           <div className="flex flex-col items-center animate-swipe-left text-blue-500">
            <span className="text-5xl">⬅️</span>
            <p className="text-[10px] font-bold bg-blue-600 text-white px-2 py-1 rounded mt-2 uppercase">Swipe to Next</p>
          </div>
        </div>
      )}

      {/* MODALLAR (Ülke, Cinsiyet, Seçenekler) */}
      {showCountryFilter && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white text-black w-full max-w-sm rounded-2xl shadow-2xl animate-in zoom-in-95">
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-blue-500 font-bold">Country Filter</h3>
              <button onClick={() => setShowCountryFilter(false)} className="text-zinc-400 text-2xl">✕</button>
            </div>
            <div className="p-4">
              <input type="text" placeholder="Search country..." className="w-full bg-zinc-100 rounded-full py-2 px-4 mb-4 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              <div className="max-h-[350px] overflow-y-auto no-scrollbar space-y-1">
                {filteredCountries.map((c) => (
                  <button key={c.id} onClick={() => { setSelectedCountry(c.id); setShowCountryFilter(false); handleNext(undefined, c.id); }} className="w-full flex items-center justify-between p-3 hover:bg-zinc-50 rounded-xl transition-all">
                    <div className="flex items-center gap-3"><span>{c.flag}</span><span className={`text-sm font-medium ${selectedCountry === c.id ? 'text-blue-500' : 'text-zinc-700'}`}>{c.name}</span></div>
                    {selectedCountry === c.id && <span className="text-blue-500 font-bold">✓</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showGenderFilter && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
              <div className="bg-white text-black w-full max-w-xs rounded-lg shadow-2xl animate-in zoom-in-95">
                  <div className="flex items-center justify-between p-4 border-b text-blue-500 font-bold">Gender Filter <button onClick={() => setShowGenderFilter(false)} className="text-zinc-400 text-2xl">✕</button></div>
                  <div className="p-2">
                      {[{ id: 'all', label: 'Everyone', icon: '👤', color: 'text-blue-500' }, { id: 'female', label: 'Females Only', icon: '♀️', color: 'text-pink-500' }, { id: 'male', label: 'Males Only', icon: '♂️', color: 'text-blue-400' }].map((opt) => (
                          <button key={opt.id} onClick={() => { setSearchGender(opt.id); setShowGenderFilter(false); handleNext(opt.id); }} className="w-full flex items-center justify-between p-3 hover:bg-zinc-50 rounded-xl">
                              <div className="flex items-center gap-4"><span className={`text-xl ${opt.color}`}>{opt.icon}</span><span className={`text-sm font-medium ${searchGender === opt.id ? 'text-blue-500' : 'text-zinc-600'}`}>{opt.label}</span></div>
                              {searchGender === opt.id && <span className="text-blue-500 font-bold">✓</span>}
                          </button>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {showOptions && (
          <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
              <div className="bg-white text-black w-full max-w-xs rounded-lg shadow-2xl animate-in zoom-in-95">
                  <div className="flex items-center justify-between p-4 border-b text-blue-500 font-bold">Options <button onClick={() => setShowOptions(false)} className="text-zinc-400 text-2xl">✕</button></div>
                  <div className="p-2 space-y-1">
                      <button onClick={() => { startMedia(facingMode === "user" ? "environment" : "user"); setFacingMode(facingMode === "user" ? "environment" : "user"); }} className="w-full flex items-center gap-4 p-3 hover:bg-zinc-100 rounded-lg">
                          <span className="text-xl">🔄</span> <span className="text-sm font-medium">Switch Camera</span>
                      </button>
                      <div className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-4"><span className="text-xl">📹</span> <span className="text-sm font-medium">Camera</span></div>
                          <input type="checkbox" checked={cameraOn} onChange={toggleCamera} className="w-10 h-5 bg-zinc-200 rounded-full appearance-none checked:bg-green-500 relative transition-all before:content-[''] before:absolute before:w-4 before:h-4 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 checked:before:left-5 before:transition-all cursor-pointer" />
                      </div>
                      <div className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-4"><span className="text-xl">🎤</span> <span className="text-sm font-medium">Mic</span></div>
                          <input type="checkbox" checked={micOn} onChange={toggleMic} className="w-10 h-5 bg-zinc-200 rounded-full appearance-none checked:bg-green-500 relative transition-all before:content-[''] before:absolute before:w-4 before:h-4 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 checked:before:left-5 before:transition-all cursor-pointer" />
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* MAIN LAYOUT */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative w-full h-full">
        {/* VIDEO AREA */}
        <div className="flex-1 relative md:max-w-[50%] lg:max-w-[60%] h-full bg-black md:border-r border-zinc-800 z-10">
          
          <div className={`absolute top-0 left-0 w-full h-[50%] md:h-[50%] overflow-hidden bg-zinc-900 border-b border-white/5 transition-all duration-700 ${showModal ? 'blur-2xl' : ''}`}>
             <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
             
             {/* STOPPED OVERLAY */}
             {!isActive && !showModal && (
                <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md">
                    <p className="text-sm font-bold text-zinc-400 mb-4 tracking-widest uppercase">Chat Stopped</p>
                    <button onClick={toggleActive} className="bg-green-600 hover:bg-green-500 text-white px-10 py-4 rounded-full font-black text-xl animate-pulse shadow-[0_0_20px_rgba(22,163,74,0.4)]">START CHAT 🚀</button>
                </div>
             )}

             {isSearching && isActive && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950/80 backdrop-blur-md">
                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(59,130,246,0.3)]"></div>
                    <p className="text-[10px] font-black tracking-widest text-white uppercase bg-blue-600 px-4 py-1.5 rounded-full">{searchStatus}</p>
                </div>
             )}

             {matchNotification && isActive && (
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[60] animate-in zoom-in-95 fade-in duration-500">
                  <div className="bg-blue-600/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl shadow-2xl border border-white/20 whitespace-nowrap font-bold text-sm">✨ {matchNotification}</div>
               </div>
             )}

             <div className="absolute top-4 left-4 z-50">
                  <h1 className="text-xl font-black italic text-blue-500 bg-black/30 px-2 py-1 rounded">OMEGPT</h1>
                  {partnerCountry && isActive && !isSearching && <div className="mt-1 text-[10px] font-bold bg-black/60 px-2 py-1 rounded-full border border-white/10 w-fit">🌍 {partnerCountry}</div>}
              </div>
          </div>

          <div className={`absolute bottom-0 left-0 w-full h-[50%] md:h-[50%] overflow-hidden bg-zinc-900 transition-all duration-700 ${showModal ? 'blur-2xl' : ''}`}>
             <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
             {!showModal && (
               <div className="absolute right-4 bottom-24 z-[80] flex flex-col gap-4">
                  <button onClick={() => setShowOptions(true)} className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">⚙️</button>
                  <button onClick={() => setShowGenderFilter(true)} className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">🚻</button>
                  <button onClick={() => setShowCountryFilter(true)} className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">🏳️</button>
               </div>
             )}

             {/* MOBİL MESAJLAR VE KONTROLLER */}
             <div className="md:hidden absolute bottom-24 left-4 right-20 z-40 flex flex-col justify-end max-h-[140px] overflow-y-auto no-scrollbar pointer-events-none">
                {messages.map((m, i) => (
                    <div key={i} className="bg-black/60 backdrop-blur-lg px-3 py-1.5 rounded-2xl text-[12px] border border-white/5 w-fit max-w-full text-white mb-1">
                        <b>{m.sender}:</b> {m.text}
                    </div>
                ))}
                <div ref={mobileChatEndRef} />
             </div>

             <div className="md:hidden absolute bottom-6 right-4 z-[90] flex items-center gap-3">
                {/* START/STOP BUTONU (MOBİL) */}
                {!showModal && (
                    <button onClick={toggleActive} className={`w-14 h-14 rounded-full flex items-center justify-center border-2 border-white/20 shadow-2xl transition-all ${isActive ? 'bg-red-600 scale-95' : 'bg-green-600 scale-110 animate-pulse'}`}>
                        <span className="text-xl">{isActive ? '⏹️' : '▶️'}</span>
                    </button>
                )}
                {partnerId && isActive && (
                    <button onClick={() => setIsMobileInputActive(!isMobileInputActive)} className={`w-14 h-14 rounded-full flex items-center justify-center border-2 border-white/20 shadow-2xl ${isMobileInputActive ? 'bg-zinc-800' : 'bg-blue-600 animate-bounce-subtle'}`}>
                      <span className="text-2xl text-white">{isMobileInputActive ? '✕' : '💬'}</span>
                    </button>
                )}
             </div>

             {isMobileInputActive && (
                <div className="md:hidden absolute bottom-6 left-4 right-20 z-[95]">
                    <form onSubmit={sendMessage} className="flex bg-black/80 backdrop-blur-2xl border border-white/20 p-1 rounded-full shadow-2xl">
                        <input autoFocus value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Type a message..." className="flex-1 bg-transparent px-4 py-2 text-sm outline-none text-white w-full" />
                        <button type="submit" className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center"> ➤ </button>
                    </form>
                </div>
             )}
          </div>
        </div>

        {/* CHAT AREA (WEB) */}
        <div className="hidden md:flex flex-1 flex-col bg-white border-l border-zinc-200 h-full relative z-20">
          <div className="p-4 border-b bg-zinc-50 flex items-center justify-between font-bold text-zinc-800">
             Sohbet Alanı
             {!showModal && (
                <button onClick={toggleActive} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase transition-all shadow-sm ${isActive ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}>
                    {isActive ? 'Stop Searching' : 'Start Searching'}
                </button>
             )}
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex flex-col ${msg.sender === "Me" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${msg.sender === "Me" ? "bg-blue-600 text-white" : "bg-zinc-100 text-zinc-800"}`}>
                  <b>{msg.sender}:</b> {msg.text}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="p-4 bg-zinc-50 border-t flex items-center gap-3">
            <button onClick={() => handleNext()} disabled={!isActive} className={`px-6 py-3 rounded-xl font-bold uppercase text-xs transition-all ${isActive ? 'bg-black text-white hover:bg-zinc-800' : 'bg-zinc-300 text-zinc-500 cursor-not-allowed'}`}>Sıradaki</button>
            <form onSubmit={sendMessage} className="flex-1 flex gap-2">
                <input disabled={!isActive} value={inputText} onChange={(e) => setInputText(e.target.value)} className="flex-1 border border-zinc-300 p-3 rounded-xl text-black outline-none focus:ring-2 ring-blue-500/20 disabled:bg-zinc-100" placeholder={isActive ? "Mesaj yaz..." : "Sohbet durduruldu"} />
                <button disabled={!isActive} type="submit" className={`px-5 rounded-xl font-bold transition-colors ${isActive ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-zinc-300 text-zinc-500'}`}>➤</button>
            </form>
          </div>
        </div>
      </main>

      {/* LOGIN MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm text-center">
            <div className="relative max-w-sm w-full bg-zinc-900 border border-white/20 p-8 rounded-[40px] shadow-2xl space-y-8 animate-in zoom-in-95 duration-500">
                <h2 className="text-5xl font-black italic tracking-tighter text-blue-500 uppercase">OMEGPT</h2>
                <div className="space-y-4">
                  <p className="text-xs font-bold text-white uppercase tracking-wider block">Cinsiyetinizi Seçin</p>
                  <div className="grid grid-cols-2 gap-4">
                    <button onClick={() => setMyGender("male")} className={`py-6 rounded-3xl font-black border-2 transition-all ${myGender === "male" ? "bg-blue-600 border-blue-400 shadow-lg scale-95" : "bg-black/40 border-white/10"}`}>MALE</button>
                    <button onClick={() => setMyGender("female")} className={`py-6 rounded-3xl font-black border-2 transition-all ${myGender === "female" ? "bg-pink-600 border-pink-400 shadow-lg scale-95" : "bg-black/40 border-white/10"}`}>FEMALE</button>
                  </div>
                </div>
                <button onClick={() => { if(!myGender) return alert("Select gender!"); setShowModal(false); setIsActive(true); handleNext(); }} className="w-full bg-white text-black py-5 rounded-[25px] font-black text-lg shadow-2xl transition-transform active:scale-95">START 🚀</button>
            </div>
        </div>
      )}

      <style jsx global>{`
        html, body { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden !important; position: fixed; background: black; overscroll-behavior: none; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes swipe-left { 0%, 100% { transform: translateX(0); opacity: 0.8; } 50% { transform: translateX(-20px); opacity: 1; } }
        .animate-swipe-left { animation: swipe-left 1.5s infinite ease-in-out; }
        @keyframes bounce-subtle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        .animate-bounce-subtle { animation: bounce-subtle 2s infinite ease-in-out; }
      `}</style>
    </div>
  );
}