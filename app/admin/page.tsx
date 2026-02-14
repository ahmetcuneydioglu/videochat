"use client";
import { useEffect, useState, useCallback } from "react";

// --- KRİTİK AYAR: BACKEND URL ---
const BACKEND_URL = "https://videochat-1qxi.onrender.com"; 

export default function AdminDashboard() {
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // Veri State'leri
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [bans, setBans] = useState<any[]>([]);
  const [stats, setStats] = useState({ activeUsers: 0, totalBans: 0, pendingReports: 0, totalMatchesToday: 0 });
  const [activeMatches, setActiveMatches] = useState<any[]>([]);
  
  // Seçim ve Modal State'leri
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageReportData, setImageReportData] = useState<any>(null);

  // Veri Çekme Fonksiyonu
  const fetchData = useCallback(async () => {
    try {
      const [userRes, repRes, banRes, statRes, matchRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/admin/active-users`),
        fetch(`${BACKEND_URL}/api/reports`),
        fetch(`${BACKEND_URL}/api/bans`),
        fetch(`${BACKEND_URL}/api/admin/stats`),
        fetch(`${BACKEND_URL}/api/admin/active-matches`)
      ]);

      if (userRes.ok) setActiveUsers(await userRes.json());
      if (repRes.ok) setReports(await repRes.json());
      if (banRes.ok) setBans(await banRes.json());
      if (statRes.ok) setStats(await statRes.json());
      if (matchRes.ok) setActiveMatches(await matchRes.json());
    } catch (err) {
      console.error("Veri çekme hatası:", err);
    }
  }, []);

  // Eşleşmeyi Zorla Bitir
  const killMatch = async (matchId: string, user1Id: string, user2Id: string) => {
    if(!confirm("Bu eşleşmeyi sonlandırmak istediğine emin misin?")) return;
    try {
        await fetch(`${BACKEND_URL}/api/admin/kill-match`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId, user1Id, user2Id })
        });
        fetchData();
    } catch (err) {
        console.error("Eşleşme sonlandırılamadı:", err);
    }
  };

  // IP Yasakla
  const banByIP = async (ip: string, id?: string) => {
    if(!confirm(`${ip} adresi kalıcı olarak yasaklanacak?`)) return;
    try {
        await fetch(`${BACKEND_URL}/api/ban-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportedId: id, ip: ip })
        });
        alert("Yasaklama başarılı.");
        setSelectedImage(null);
        fetchData();
    } catch (err) {
        console.error("Ban hatası:", err);
    }
  };

  // Login ve Periyodik Güncelleme
  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
      const interval = setInterval(fetchData, 4000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn, fetchData]);

  // Kullanıcı Detaylarını Çekme
  useEffect(() => {
    if (selectedUser) {
      fetch(`${BACKEND_URL}/api/admin/user-logs/${selectedUser.id}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => setUserHistory(data))
        .catch(err => console.error("Geçmiş yüklenemedi:", err));
    }
  }, [selectedUser]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 p-10 rounded-[40px] w-full max-w-sm shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 animate-pulse"></div>
          <h2 className="text-2xl font-black mb-8 text-white text-center italic uppercase tracking-tighter">Komuta Merkezi</h2>
          <input 
            type="password" 
            placeholder="Güvenlik Kodu" 
            className="w-full bg-zinc-800 p-4 rounded-2xl mb-4 text-white outline-none border border-zinc-700 focus:border-blue-500 transition-all text-center font-bold" 
            onChange={(e) => setPassword(e.target.value)} 
          />
          <button 
            onClick={() => password === "admin123" && setIsLoggedIn(true)} 
            className="w-full bg-blue-600 py-4 rounded-2xl font-bold text-white uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg"
          >
            SİSTEME GİRİŞ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 font-sans">
      
      {/* İSTATİSTİK PANELİ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 max-w-[1600px] mx-auto">
        {[
          { label: "Online", value: activeUsers.length, color: "text-green-400" },
          { label: "Canlı Eşleşme", value: activeMatches.length, color: "text-blue-400" },
          { label: "Bekleyen Rapor", value: reports.length, color: "text-red-500" },
          { label: "Toplam Ban", value: bans.length, color: "text-zinc-500" },
        ].map((s, i) => (
          <div key={i} className="bg-zinc-900/40 border border-zinc-800/50 p-6 rounded-[35px] backdrop-blur-xl">
            <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest mb-1">{s.label}</p>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto">
        
        {/* SOL: AKTİF LİSTE */}
        <div className="lg:col-span-3 space-y-4">
          <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Aktif Oturumlar</h3>
          <div className="bg-zinc-900/20 border border-zinc-800/40 rounded-[35px] p-3 max-h-[75vh] overflow-y-auto custom-scrollbar">
            {activeUsers.length === 0 && <p className="text-center text-[10px] text-zinc-700 py-10 uppercase font-bold">Veri Bekleniyor...</p>}
            {activeUsers.map(user => (
              <div 
                key={user.id} 
                onClick={() => setSelectedUser(user)}
                className={`p-4 mb-2 rounded-2xl cursor-pointer transition-all border ${selectedUser?.id === user.id ? 'bg-blue-600/20 border-blue-500 shadow-lg' : 'bg-zinc-800/30 border-transparent hover:border-zinc-700'}`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-mono text-[10px] font-bold text-zinc-400">{user.id.slice(-8)}</span>
                  <div className={`w-2 h-2 rounded-full ${user.status === 'BUSY' ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`}></div>
                </div>
                <div className="text-[9px] font-black uppercase text-zinc-600">{user.country} • {user.ip?.slice(0,15)}...</div>
              </div>
            ))}
          </div>
        </div>

        {/* ORTA: DETAY VE LİVE FEED */}
        <div className="lg:col-span-6 space-y-6">
          {selectedUser ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-[45px] p-8 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-black italic uppercase text-white">Profil Detayı</h2>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">ID: {selectedUser.id}</p>
                </div>
                <button onClick={() => setSelectedUser(null)} className="p-2 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors">✕</button>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-8 font-mono">
                <div className="bg-black/40 p-4 rounded-2xl border border-zinc-800/50">
                    <p className="text-[9px] font-black text-zinc-600 uppercase mb-1">IP ADRESİ</p>
                    <p className="text-xs font-bold text-zinc-300">{selectedUser.ip}</p>
                </div>
                <div className="bg-black/40 p-4 rounded-2xl border border-zinc-800/50 text-right">
                    <p className="text-[9px] font-black text-zinc-600 uppercase mb-1">BEĞENİ</p>
                    <p className="text-xs font-bold text-pink-500">♥ {selectedUser.likes || 0}</p>
                </div>
              </div>

              <button 
                onClick={() => banByIP(selectedUser.ip, selectedUser.id)}
                className="w-full bg-red-600/10 hover:bg-red-600 hover:text-white border border-red-600/50 text-red-500 py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all"
              >
                Kullanıcıyı Yasakla (BAN)
              </button>
            </div>
          ) : (
            <div className="h-24 bg-zinc-900/10 border-2 border-dashed border-zinc-900/40 rounded-[35px] flex items-center justify-center">
              <p className="text-zinc-700 font-bold uppercase text-[10px] tracking-widest">Kullanıcı detayları için soldan seçim yapın</p>
            </div>
          )}

          {/* GHOST MODE & LIVE FEED */}
          <div className="mt-8 pt-8 border-t border-zinc-800/50">
            <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-6 flex items-center gap-2">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>
              Canlı Maç Takibi (Ghost Mode)
            </h3>
            
            <div className="grid grid-cols-1 gap-4">
              {activeMatches.length === 0 && (
                <div className="bg-zinc-900/10 border border-zinc-800 py-10 rounded-[30px] text-center">
                  <p className="text-zinc-800 font-bold text-[9px] uppercase">Şu an aktif görüşme yok</p>
                </div>
              )}
              {activeMatches.map((match) => (
                <div key={match.id} className="bg-zinc-900/40 border border-zinc-800 p-5 rounded-[30px] flex items-center justify-between group animate-in slide-in-from-bottom-2">
                  <div className="flex items-center gap-4 w-[40%]">
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center font-bold text-zinc-500 border border-zinc-700">{match.user1.country || "U1"}</div>
                    <div className="overflow-hidden"><p className="text-[10px] font-black text-zinc-300 truncate">{match.user1.id.slice(-6)}</p></div>
                  </div>

                  <div className="flex flex-col items-center w-[20%]">
                    <div className="flex gap-1 mb-1">
                        <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce"></span>
                        <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                    </div>
                    <p className="text-[9px] font-mono text-zinc-600">{Math.floor((new Date().getTime() - new Date(match.startTime).getTime()) / 1000)}s</p>
                  </div>

                  <div className="flex items-center justify-end gap-3 w-[40%]">
                    <div className="text-right overflow-hidden"><p className="text-[10px] font-black text-zinc-300 truncate">{match.user2.id.slice(-6)}</p></div>
                    <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center font-bold text-zinc-500 border border-zinc-700">{match.user2.country || "U2"}</div>
                    
                    <button 
                      onClick={() => alert(`ANALİZ:\nPartner 1: ${match.user1.ip}\nPartner 2: ${match.user2.ip}\nSüre: ${Math.floor((new Date().getTime() - new Date(match.startTime).getTime()) / 1000)}s`)}
                      className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-500 hover:bg-blue-600 hover:text-white flex items-center justify-center transition-all"
                    >
                      👁️
                    </button>
                    
                    <button 
                      onClick={() => killMatch(match.id, match.user1.id, match.user2.id)}
                      className="w-8 h-8 rounded-lg bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white flex items-center justify-center transition-all"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* SAĞ: RAPORLAR VE BANLILAR */}
        <div className="lg:col-span-3 space-y-8 h-fit sticky top-6">
           <div className="space-y-4">
              <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Bekleyen Raporlar ({reports.length})</h3>
              <div className="space-y-3">
                {reports.slice(0, 5).map((r, i) => (
                  <div key={i} className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-2xl flex items-center gap-3">
                    <img 
                        src={r.screenshot} 
                        onClick={() => { setSelectedImage(r.screenshot); setImageReportData(r); }} 
                        className="w-14 h-11 object-cover rounded-lg cursor-zoom-in border border-zinc-800 hover:border-red-500 transition-colors" 
                    />
                    <div className="overflow-hidden">
                      <p className="font-mono text-[9px] font-bold text-red-400 truncate">ID: {r.reportedId?.slice(-6)}</p>
                      <button onClick={() => fetch(`${BACKEND_URL}/api/reports/${r._id}`, {method:'DELETE'}).then(fetchData)} className="text-[8px] text-zinc-600 hover:text-red-500 font-black uppercase">Yoksay</button>
                    </div>
                  </div>
                ))}
                {reports.length === 0 && <p className="text-[9px] text-zinc-800 px-2 italic">Rapor bulunmuyor.</p>}
              </div>
           </div>

           <div className="space-y-4">
              <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Yasaklı IP Listesi ({bans.length})</h3>
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-[30px] p-2 max-h-60 overflow-y-auto custom-scrollbar">
                {bans.map((b, i) => (
                  <div key={i} className="p-3 border-b border-zinc-800/50 flex justify-between items-center group hover:bg-zinc-800/50 transition-colors rounded-xl">
                    <span className="text-[9px] font-mono text-zinc-500">{b.ip}</span>
                    <button onClick={() => fetch(`${BACKEND_URL}/api/bans/${b.ip}`, {method:'DELETE'}).then(fetchData)} className="text-[8px] text-blue-500 font-black uppercase hover:text-white transition-colors">Kaldır</button>
                  </div>
                ))}
              </div>
           </div>
        </div>
      </div>

      {/* Screenshot & Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-md flex items-center justify-center p-10 animate-in fade-in duration-200" onClick={() => setSelectedImage(null)}>
          <div className="relative flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
             <img src={selectedImage} className="max-w-[80vw] max-h-[70vh] rounded-3xl border border-zinc-800 shadow-2xl" />
             <div className="flex gap-4">
                {imageReportData && (
                  <button 
                    onClick={() => banByIP(imageReportData.reportedIP, imageReportData.reportedId)}
                    className="bg-red-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-red-600/20 active:scale-95 transition-all"
                  >
                    KANITLI BANLA
                  </button>
                )}
                <button onClick={() => setSelectedImage(null)} className="bg-zinc-800 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs hover:bg-zinc-700 transition-colors">Kapat</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}