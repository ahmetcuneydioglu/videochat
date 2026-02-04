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
  const mobileChatEndRef = useRef<HTMLDivElement>(null);
  const peerRef = useRef<Peer.Instance | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const [showModal, setShowModal] = useState(true);
  const [showOptions, setShowOptions] = useState(false); // Chat Options Modalı
  
  // Medya Durumları
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [audioOn, setAudioOn] = useState(true);

  const [myGender, setMyGender] = useState<string | null>(null);
  const [searchGender, setSearchGender] = useState("all");
  const [onlySameCountry, setOnlySameCountry] = useState(false);
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
  }, [isMounted, myGender]);

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
    socket.emit("find_partner", { myGender, searchGender, onlySameCountry });
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && peerRef.current && (peerRef.current as any).connected) {
      peerRef.current.send(inputText.trim());
      setMessages((prev) => [...prev, { sender: "Ben", text: inputText.trim() }]);
      setInputText("");
    }
  };

  const handleReport = () => {
    if (confirm("Bu kullanıcıyı rapor etmek istediğinize emin misiniz?")) {
      alert("Kullanıcı rapor edildi.");
      handleNext();
    }
  };

  // Kamera ve Mic Kontrolleri
  const toggleCamera = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setCameraOn(videoTrack.enabled);
    }
  };

  const toggleMic = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setMicOn(audioTrack.enabled);
    }
  };

  const toggleRemoteAudio = () => {
    if (remoteVideoRef.current) {
        remoteVideoRef.current.muted = !remoteVideoRef.current.muted;
        setAudioOn(!remoteVideoRef.current.muted);
    }
  };

  const switchCamera = async () => {
    // Mobil cihazlarda ön/arka kamera değişimi için mantık buraya gelebilir
    alert("Kamera değiştiriliyor...");
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
        if (isMobileInputActive) setIsMobileInputActive(false);
        handleNext();
    }
  };

  if (!isMounted) return null;

  return (
    <div 
      className="fixed inset-0 w-full h-full bg-black text-white flex flex-col font-sans overflow-hidden touch-none select-none"
      style={{ height: 'var(--vv-height, 100vh)', position: 'fixed', top: 0, left: 0 }}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
    >
      {/* 1. CHAT OPTIONS MODAL (Görseldeki Tasarım) */}
      {showOptions && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
              <div className="bg-white text-black w-full max-w-xs rounded-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between p-4 border-b">
                      <h3 className="text-blue-500 font-bold">Chat Options</h3>
                      <button onClick={() => setShowOptions(false)} className="text-zinc-400 text-2xl">✕</button>
                  </div>
                  <div className="p-2 space-y-1">
                      <button onClick={switchCamera} className="w-full flex items-center gap-4 p-3 hover:bg-zinc-100 rounded-lg transition-colors">
                          <span className="text-xl">🔄</span> <span className="text-sm font-medium">Switch Camera</span>
                      </button>
                      <div className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-4">
                            <span className="text-xl">📹</span> <span className="text-sm font-medium">Camera: <span className={cameraOn ? "text-green-500" : "text-red-500"}>{cameraOn ? "On" : "Off"}</span></span>
                          </div>
                          <input type="checkbox" checked={cameraOn} onChange={toggleCamera} className="w-10 h-5 bg-zinc-200 rounded-full appearance-none checked:bg-green-500 relative transition-all before:content-[''] before:absolute before:w-4 before:h-4 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 checked:before:left-5 before:transition-all cursor-pointer" />
                      </div>
                      <div className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-4">
                            <span className="text-xl">🎤</span> <span className="text-sm font-medium">Mic: <span className={micOn ? "text-green-500" : "text-red-500"}>{micOn ? "On" : "Off"}</span></span>
                          </div>
                          <input type="checkbox" checked={micOn} onChange={toggleMic} className="w-10 h-5 bg-zinc-200 rounded-full appearance-none checked:bg-green-500 relative transition-all before:content-[''] before:absolute before:w-4 before:h-4 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 checked:before:left-5 before:transition-all cursor-pointer" />
                      </div>
                      <div className="flex items-center justify-between p-3">
                          <div className="flex items-center gap-4">
                            <span className="text-xl">🔊</span> <span className="text-sm font-medium">Audio: <span className={audioOn ? "text-green-500" : "text-red-500"}>{audioOn ? "On" : "Off"}</span></span>
                          </div>
                          <input type="checkbox" checked={audioOn} onChange={toggleRemoteAudio} className="w-10 h-5 bg-zinc-200 rounded-full appearance-none checked:bg-green-500 relative transition-all before:content-[''] before:absolute before:w-4 before:h-4 before:bg-white before:rounded-full before:top-0.5 before:left-0.5 checked:before:left-5 before:transition-all cursor-pointer" />
                      </div>
                      <button className="w-full flex items-center gap-4 p-3 hover:bg-zinc-100 rounded-lg transition-colors">
                          <span className="text-xl">⚙️</span> <span className="text-sm font-medium">Chat Settings</span>
                      </button>
                      <button className="w-full flex items-center gap-4 p-3 hover:bg-zinc-100 rounded-lg transition-colors border-t mt-2">
                          <span className="text-xl">👑</span> <span className="text-blue-500 font-bold text-sm">Unlock All Features</span>
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* WEB HEADER */}
      <header className="hidden md:flex h-12 border-b border-zinc-800 items-center justify-between px-4 bg-zinc-900/50 backdrop-blur-md z-[100]">
        <h1 className="text-lg font-black italic tracking-tighter text-blue-500 uppercase">OMEGPT</h1>
        <div className="flex items-center gap-2">
           {partnerCountry && <span className="text-[9px] font-bold bg-zinc-800 px-2 py-1 rounded-full">🌍 {partnerCountry}</span>}
           <button onClick={handleNext} className="bg-zinc-800 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase">NEXT</button>
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative w-full h-full">
        {/* KAMERA BÖLÜMÜ */}
        <div className="flex-1 relative md:w-[450px] lg:w-[500px] h-full bg-black md:border-r border-zinc-800 z-10 overflow-hidden">
          
          {/* ÜST VİDEO: Yabancı */}
          <div className="absolute top-0 left-0 w-full h-[50%] overflow-hidden bg-zinc-900 border-b border-white/5">
            {isSearching && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-zinc-950/80">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-[10px] font-black tracking-widest text-blue-400 uppercase">Searching...</p>
                </div>
            )}
            <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="md:hidden absolute top-4 left-4 z-50">
                <h1 className="text-xl font-black italic tracking-tighter text-blue-500 bg-black/30 px-2 py-1 rounded">OMEGPT</h1>
                {partnerCountry && <div className="mt-1 text-[10px] font-bold bg-black/60 px-2 py-1 rounded-full border border-white/10 w-fit">🌍 {partnerCountry}</div>}
            </div>
            {partnerId && (
                <button onClick={handleReport} className="md:hidden absolute top-4 right-4 w-10 h-10 bg-red-600/40 backdrop-blur-md rounded-full flex items-center justify-center border border-red-500/20 z-50 pointer-events-auto active:scale-90">🚩</button>
            )}
          </div>

          {/* ALT VİDEO: Sen */}
          <div className="absolute bottom-0 left-0 w-full h-[50%] overflow-hidden bg-zinc-900">
            <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            <div className="absolute top-4 left-4 bg-black/40 px-2 py-1 rounded text-[8px] font-bold uppercase z-20">Sen</div>

            {/* --- SAĞ MENÜ İKONLARI (YENİ KONUM) --- */}
            <div className="md:hidden absolute right-4 bottom-24 z-[70] flex flex-col gap-4 pointer-events-auto">
                <button onClick={() => setShowOptions(true)} className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">
                    <span className="text-xl">⚙️</span>
                </button>
                <button className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">
                    <span className="text-xl">🚻</span>
                </button>
                <button className="w-12 h-12 bg-black/50 backdrop-blur-xl border border-white/10 rounded-2xl flex items-center justify-center shadow-lg active:scale-90 transition-all">
                    <span className="text-xl">🏳️</span>
                </button>
            </div>

            {/* MESAJ AKIŞI (Sol Taraf Artık Daha Rahat) */}
            <div className="md:hidden absolute bottom-24 left-4 right-20 z-40 flex flex-col justify-end max-h-[140px] overflow-y-auto pointer-events-none no-scrollbar scroll-smooth">
                <div className="flex flex-col gap-1.5 p-2">
                    {messages.map((m, i) => (
                        <div key={i} className="bg-black/60 backdrop-blur-lg px-3 py-1.5 rounded-2xl text-[12px] border border-white/5 w-fit max-w-full break-words shadow-lg animate-in slide-in-from-left-2 text-white">
                            <b className={m.sender === "Ben" ? "text-blue-400" : "text-pink-400"}>{m.sender}:</b> {m.text}
                        </div>
                    ))}
                    <div ref={mobileChatEndRef} />
                </div>
            </div>

            {/* SAĞ ALT MESAJ İKONU */}
            <div className="md:hidden absolute bottom-6 right-4 z-[60] pointer-events-auto">
                {partnerId && (
                    <button onClick={() => setIsMobileInputActive(!isMobileInputActive)} className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-2xl border-2 border-white/20 ${isMobileInputActive ? 'bg-zinc-800' : 'bg-blue-600'}`}>
                        <span className="text-2xl text-white leading-none">{isMobileInputActive ? '✕' : '💬'}</span>
                    </button>
                )}
            </div>

            {/* MOBİL INPUT */}
            {isMobileInputActive && (
                <div className="md:hidden absolute bottom-6 left-4 right-20 z-[70] animate-in slide-in-from-bottom-2 duration-200">
                    <form onSubmit={sendMessage} className="flex bg-black/90 backdrop-blur-2xl border border-white/20 p-1 rounded-full shadow-2xl overflow-hidden">
                        <input autoFocus value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="Yaz..." className="flex-1 bg-transparent px-4 py-2 text-sm outline-none text-white w-full" />
                        <button type="submit" className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 mr-1"> ➤ </button>
                    </form>
                </div>
            )}
          </div>
        </div>

        {/* WEB CHAT PANELİ */}
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
        <div className="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[200] flex items-center justify-center p-6 text-center">
            <div className="max-w-xs w-full space-y-6">
                <h2 className="text-4xl font-black italic tracking-tighter text-blue-500 uppercase font-sans">OMEGPT</h2>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setMyGender("male")} className={`py-5 rounded-2xl font-bold border-2 transition-all ${myGender === "male" ? "bg-blue-600 border-blue-400 scale-95" : "bg-zinc-900 border-zinc-800 opacity-60"}`}>ERKEK</button>
                    <button onClick={() => setMyGender("female")} className={`py-5 rounded-2xl font-bold border-2 transition-all ${myGender === "female" ? "bg-pink-600 border-pink-400 scale-95" : "bg-zinc-900 border-zinc-800 opacity-60"}`}>KADIN</button>
                </div>
                <button onClick={() => { if(!myGender) return alert("Cinsiyet seçin!"); setShowModal(false); handleNext(); }} className="w-full bg-white text-black py-5 rounded-[30px] font-black text-xl uppercase shadow-2xl transition-all">BAŞLAT</button>
            </div>
        </div>
      )}

      <style jsx global>{`
        html, body {
            width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden !important; position: fixed; background: black; overscroll-behavior: none; -webkit-text-size-adjust: 100%;
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes swipe { 0% { transform: translateX(50px); opacity: 0; } 50% { opacity: 1; } 100% { transform: translateX(-50px); opacity: 0; } }
        .animate-in { animation-duration: 0.3s; animation-fill-mode: both; }
        .slide-in-from-bottom-2 { animation-name: slideInBottom2; }
        .slide-in-from-left-2 { animation-name: slideInLeft; }
        @keyframes slideInBottom2 { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideInLeft { from { transform: translateX(-15px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
}