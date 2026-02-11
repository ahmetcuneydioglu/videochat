"use client";
import { useEffect, useState } from "react";

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

  // --- API İŞLEMLERİ ---

  const fetchData = async () => {
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
      console.error("Veri senkronizasyon hatası:", err);
    }
  };

  // Eşleşmeyi Zorla Bitir (Kill Match)
  const killMatch = async (matchId: string, user1Id: string, user2Id: string) => {
    if(!confirm("Bu eşleşmeyi sonlandırmak istediğine emin misin?")) return;
    try {
        await fetch(`${BACKEND_URL}/api/admin/kill-match`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId, user1Id, user2Id })
        });
        // UI'ı hemen güncelle
        fetchData();
    } catch (err) {
        console.error("Eşleşme sonlandırılamadı:", err);
    }
  };

  // Seçilen Kullanıcının Geçmişini Çekme
  useEffect(() => {
    if (selectedUser) {
      fetch(`${BACKEND_URL}/api/admin/user-logs/${selectedUser.id}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => setUserHistory(data))
        .catch(err => console.error("Geçmiş yüklenemedi:", err));
    }
  }, [selectedUser]);

  // Periyodik Veri Güncelleme
  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
      const interval = setInterval(fetchData, 3000); // 3 saniyede bir güncelle (daha canlı hissetmesi için)
      return () => clearInterval(interval);
    }
  }, [isLoggedIn]);

  // --- GİRİŞ EKRANI ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 p-10 rounded-[40px] w-full max-w-sm shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-600 animate-pulse"></div>
          <h2 className="text-2xl font-black mb-8 text-white text-center italic uppercase tracking-tighter">Komuta Merkezi</h2>
          <input 
            type="password" 
            placeholder="Güvenlik Kodu" 
            className="w-full bg-zinc-800 p-4 rounded-2xl mb-4 text-white outline-none border border-zinc-700 focus:border-blue-500 transition-all text-center tracking-[0.5em] font-bold" 
            onChange={(e) => setPassword(e.target.value)} 
          />
          <button 
            onClick={() => password === "admin123" && setIsLoggedIn(true)} 
            className="w-full bg-blue-600 py-4 rounded-2xl font-bold text-white uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
          >
            SİSTEME GİRİŞ
          </button>
        </div>
      </div>
    );
  }

  // --- ANA DASHBOARD ---
  return (
    <div className="min-h-screen bg-black text-white p-6 font-sans selection:bg-blue-500/30">
      
      {/* Üst İstatistik Paneli */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 max-w-[1600px] mx-auto">
        {[
          { label: "Online Kullanıcı", value: stats.activeUsers, color: "text-green-400" },
          { label: "Canlı Eşleşme", value: activeMatches.length, color: "text-blue-400" }, // stats yerine doğrudan activeMatches uzunluğu
          { label: "Bekleyen Rapor", value: stats.pendingReports, color: "text-red-500" },
          { label: "Toplam Ban", value: stats.totalBans, color: "text-zinc-500" },
        ].map((s, i) => (
          <div key={i} className="bg-zinc-900/40 border border-zinc-800/50 p-6 rounded-[35px] backdrop-blur-xl hover:bg-zinc-900/60 transition-colors">
            <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest mb-1">{s.label}</p>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-[1600px] mx-auto">
        
        {/* SOL KOLON: AKTİF KULLANICI LİSTESİ */}
        <div className="lg:col-span-3 space-y-4 h-fit sticky top-6">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Aktif Oturumlar</h3>
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          </div>
          <div className="bg-zinc-900/20 border border-zinc-800/40 rounded-[35px] p-3 max-h-[75vh] overflow-y-auto custom-scrollbar">
            {activeUsers.length === 0 && <p className="text-center text-[10px] text-zinc-700 py-10 uppercase font-bold">Kimse yok...</p>}
            {activeUsers.map(user => (
              <div 
                key={user.id} 
                onClick={() => setSelectedUser(user)}
                className={`p-4 mb-2 rounded-2xl cursor-pointer transition-all border group relative ${selectedUser?.id === user.id ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/5' : 'bg-zinc-800/30 border-transparent hover:border-zinc-700'}`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-mono text-[10px] font-bold text-zinc-400 group-hover:text-white transition-colors">{user.id.slice(0, 8)}...</span>
                  <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${user.status === 'BUSY' ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700/50 text-zinc-500'}`}>
                    {user.status === 'BUSY' ? 'ON CALL' : 'IDLE'}
                  </div>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-[9px] font-black uppercase text-zinc-600 flex items-center gap-1">
                      {user.country === 'TR' ? '🇹🇷' : user.country === 'US' ? '🇺🇸' : '🌍'} {user.country}
                   </span>
                   {user.reports > 0 && <span className="text-[8px] bg-red-600 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">! {user.reports}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ORTA KOLON: KULLANICI DETAY & CANLI MAÇ AKIŞI */}
        <div className="lg:col-span-6 space-y-6">
          
          {/* Bölüm 1: Kullanıcı Detay Kartı */}
          {selectedUser ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-[45px] p-8 shadow-2xl relative overflow-hidden">
               {/* Background Glow */}
               <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/5 rounded-full blur-3xl -z-0"></div>
               
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Profil Detayı</h2>
                    <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1 font-mono">ID: {selectedUser.id}</p>
                  </div>
                  <button onClick={() => setSelectedUser(null)} className="bg-zinc-800 hover:bg-zinc-700 text-white p-2 rounded-full transition-colors">
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-8">
                  <div className="space-y-4">
                    <div className="bg-zinc-950/50 p-3 rounded-2xl border border-zinc-800/50">
                        <p className="text-[9px] font-black text-zinc-600 uppercase">IP Adresi</p>
                        <p className="font-mono text-xs font-bold text-zinc-300">{selectedUser.ip}</p>
                    </div>
                    <div className="bg-zinc-950/50 p-3 rounded-2xl border border-zinc-800/50">
                        <p className="text-[9px] font-black text-zinc-600 uppercase">Konum</p>
                        <p className="font-bold text-sm">{selectedUser.country}</p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="bg-zinc-950/50 p-3 rounded-2xl border border-zinc-800/50 text-right">
                        <p className="text-[9px] font-black text-zinc-600 uppercase">Beğeni</p>
                        <p className="font-bold text-pink-500">♥ {selectedUser.likes || 0}</p>
                    </div>
                    <div className="bg-zinc-950/50 p-3 rounded-2xl border border-zinc-800/50 text-right">
                        <p className="text-[9px] font-black text-zinc-600 uppercase">Risk Skoru</p>
                        <p className={`font-bold ${selectedUser.reports > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {selectedUser.reports > 0 ? `YÜKSEK (${selectedUser.reports})` : 'TEMİZ'}
                        </p>
                    </div>
                  </div>
                </div>

                {/* Loglar */}
                <div className="bg-black/40 p-5 rounded-[30px] border border-zinc-800/50 mb-6">
                  <h4 className="text-[10px] font-black uppercase text-zinc-600 mb-4 tracking-widest">Son Hareketler</h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                    {userHistory.map((log, i) => (
                      <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-zinc-800/20 border border-zinc-800/30">
                        <span className={`text-[8px] font-black uppercase ${log.action === 'REPORTED' ? 'text-red-500' : 'text-zinc-500'}`}>{log.action}</span>
                        <span className="text-[8px] text-zinc-700 font-mono">{new Date(log.date).toLocaleTimeString()}</span>
                      </div>
                    ))}
                    {userHistory.length === 0 && <p className="text-[9px] text-zinc-700 italic text-center">Kayıt yok.</p>}
                  </div>
                </div>

                <button 
                  onClick={() => {
                    if(confirm("Kullanıcı yasaklanacak? Bu işlem geri alınamaz.")) {
                      fetch(`${BACKEND_URL}/api/ban-user`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ reportedId: selectedUser.id, ip: selectedUser.ip })
                      }).then(() => { setSelectedUser(null); fetchData(); });
                    }
                  }}
                  className="w-full bg-red-600/10 hover:bg-red-600 hover:text-white border border-red-600/50 text-red-500 py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all"
                >
                  Kullanıcıyı Yasakla (BAN)
                </button>
              </div>
            </div>
          ) : (
            <div className="h-32 bg-zinc-900/10 border-2 border-dashed border-zinc-900/40 rounded-[35px] flex flex-col items-center justify-center text-center">
              <p className="text-zinc-700 font-bold uppercase text-[10px] tracking-widest">Detay görmek için listeden bir kullanıcı seç</p>
            </div>
          )}


          {/* CANLI EŞLEŞME AKIŞI (LIVE FEED) */}
            <div className="mt-8 pt-8 border-t border-zinc-800/50">
              <div className="flex items-center justify-between mb-6 px-2">
                <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                  </span>
                  Canlı Görüşmeler ({activeMatches.length})
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {activeMatches.length === 0 ? (
                  <div className="bg-zinc-900/10 border border-dashed border-zinc-800 py-12 rounded-[35px] text-center">
                    <p className="text-zinc-700 font-bold uppercase text-[10px] tracking-[0.2em]">Şu an aktif bir görüşme bulunmuyor</p>
                  </div>
                ) : (
                  activeMatches.map((match) => (
                    <div key={match.id} className="group bg-zinc-900/40 border border-zinc-800/60 p-5 rounded-[30px] flex items-center justify-between hover:bg-zinc-900/80 transition-all">
                      
                      {/* Kullanıcı 1 */}
                      <div className="flex items-center gap-4 w-[40%]">
                        <div className="w-10 h-10 rounded-2xl bg-zinc-800 flex items-center justify-center font-bold text-zinc-500 border border-zinc-700">
                          {match.user1.country || "🌍"}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[10px] font-black text-zinc-300 truncate">{match.user1.id.slice(-8)}</p>
                          <p className="text-[8px] text-zinc-600 font-mono">{match.user1.ip?.slice(0, 12)}...</p>
                        </div>
                      </div>

                      {/* Bağlantı Durumu & Zaman */}
                      <div className="flex flex-col items-center justify-center w-[20%]">
                        <div className="flex gap-1 mb-1">
                          <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                          <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                          <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce"></span>
                        </div>
                        <p className="text-[9px] font-mono text-zinc-500">
                          {Math.floor((new Date().getTime() - new Date(match.startTime).getTime()) / 1000)}s
                        </p>
                      </div>

                      {/* Kullanıcı 2 & Müdahale */}
                      <div className="flex items-center justify-end gap-4 w-[40%] text-right">
                        <div className="overflow-hidden">
                          <p className="text-[10px] font-black text-zinc-300 truncate">{match.user2.id.slice(-8)}</p>
                          <p className="text-[8px] text-zinc-600 font-mono">{match.user2.ip?.slice(0, 12)}...</p>
                        </div>
                        <div className="w-10 h-10 rounded-2xl bg-zinc-800 flex items-center justify-center font-bold text-zinc-500 border border-zinc-700">
                          {match.user2.country || "🌍"}
                        </div>
                        
                        {/* Kill Button */}
                        <button 
                          onClick={() => killMatch(match.id, match.user1.id, match.user2.id)}
                          className="ml-2 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white p-2 rounded-xl border border-red-600/20 transition-all active:scale-90"
                          title="Bağlantıyı Kopar"
                        >
                          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                    </div>
                  ))
                )}
              </div>
            </div>

          {/* Bölüm 2: CANLI MAÇ AKIŞI (Live Feed) */}
          <div className="pt-4 border-t border-zinc-800/50">
             <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                    </span>
                    Canlı Görüşmeler ({activeMatches.length})
                </h3>
             </div>
             
             <div className="grid grid-cols-1 gap-3">
                {activeMatches.length === 0 && <div className="text-center py-10 text-zinc-800 text-xs font-bold uppercase">Şu an aktif görüşme yok</div>}
                {activeMatches.map((match) => (
                    <div key={match.id} className="group bg-zinc-900 border border-zinc-800 hover:border-zinc-700 p-4 rounded-[25px] flex items-center justify-between transition-all">
                        {/* Sol Taraf: User 1 */}
                        <div className="flex items-center gap-3 w-1/3">
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">
                                {match.user1.country || "U1"}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-[9px] font-bold text-zinc-400 truncate">{match.user1.id.slice(0,6)}</p>
                                <p className="text-[8px] text-zinc-600">{match.user1.ip?.slice(0,10)}...</p>
                            </div>
                        </div>

                        {/* Orta: Bağlantı Animasyonu */}
                        <div className="flex flex-col items-center justify-center w-1/3">
                            <div className="flex items-center gap-1">
                                <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce delay-75"></span>
                                <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce delay-100"></span>
                                <span className="w-1 h-1 bg-green-500 rounded-full animate-bounce delay-150"></span>
                            </div>
                            <p className="text-[8px] font-mono text-zinc-600 mt-1">
                                {Math.floor((new Date().getTime() - new Date(match.startTime).getTime()) / 1000)}s
                            </p>
                        </div>

                        {/* Sağ Taraf: User 2 ve Aksiyon */}
                        <div className="flex items-center justify-end gap-3 w-1/3">
                            <div className="text-right overflow-hidden">
                                <p className="text-[9px] font-bold text-zinc-400 truncate">{match.user2.id.slice(0,6)}</p>
                                <p className="text-[8px] text-zinc-600">{match.user2.ip?.slice(0,10)}...</p>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">
                                {match.user2.country || "U2"}
                            </div>
                            
                            {/* KILL BUTTON */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); killMatch(match.id, match.user1.id, match.user2.id); }}
                                className="ml-2 w-8 h-8 rounded-full bg-red-900/20 text-red-600 border border-red-900/30 hover:bg-red-600 hover:text-white flex items-center justify-center transition-all active:scale-90"
                                title="Görüşmeyi Sonlandır"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                ))}
             </div>
          </div>

        </div>

        {/* SAĞ KOLON: RAPORLAR VE BANLAR */}
        <div className="lg:col-span-3 space-y-8 h-fit sticky top-6">
           
           {/* Raporlar Listesi */}
           <div className="space-y-4">
              <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Son Şikayetler</h3>
              <div className="space-y-3">
                {reports.length === 0 && <p className="text-[9px] text-zinc-700 px-2">Temiz.</p>}
                {reports.slice(0, 5).map((r, i) => (
                  <div key={i} className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-2xl flex items-start gap-3 relative group">
                    {r.screenshot && (
                      <div className="relative">
                        <img 
                            src={r.screenshot} 
                            onClick={() => setSelectedImage(r.screenshot)} 
                            className="w-16 h-12 object-cover rounded-lg cursor-zoom-in border border-zinc-800 hover:border-red-500 transition-colors" 
                        />
                        <div className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full border border-black"></div>
                      </div>
                    )}
                    <div className="overflow-hidden flex-1">
                      <p className="font-mono text-[9px] font-bold text-red-400 truncate mb-1">Hedef: {r.reportedId?.slice(0,6)}</p>
                      <p className="text-[8px] text-zinc-500 mb-2">Raporlayan: {r.reporterId?.slice(0,6)}</p>
                      <div className="flex gap-2">
                        <button 
                            onClick={() => fetch(`${BACKEND_URL}/api/reports/${r._id}`, {method:'DELETE'}).then(fetchData)}
                            className="text-[8px] bg-zinc-800 px-2 py-1 rounded hover:bg-zinc-700 text-white transition-colors"
                        >
                            Yoksay
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
           </div>

           {/* Yasaklılar Listesi */}
           <div className="space-y-4">
              <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Yasaklı IP Listesi</h3>
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-[30px] p-2 max-h-60 overflow-y-auto custom-scrollbar">
                {bans.length === 0 && <p className="text-[9px] text-zinc-700 px-2 py-2 text-center">Yasaklı kimse yok.</p>}
                {bans.map((b, i) => (
                  <div key={i} className="p-3 border-b border-zinc-800/50 last:border-0 flex justify-between items-center group hover:bg-zinc-900/50 rounded-xl transition-colors">
                    <span className="text-[9px] font-mono text-zinc-500 group-hover:text-red-400 transition-colors">{b.ip}</span>
                    <button 
                      onClick={() => fetch(`${BACKEND_URL}/api/bans/${b.ip}`, {method:'DELETE'}).then(fetchData)}
                      className="text-[8px] text-zinc-600 font-black hover:text-green-500 uppercase"
                    >
                      Kaldır
                    </button>
                  </div>
                ))}
              </div>
           </div>
        </div>
      </div>

      {/* Screenshot Görüntüleme Modalı */}
      {selectedImage && (
        <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-md flex items-center justify-center p-10 cursor-zoom-out" onClick={() => setSelectedImage(null)}>
          <div className="relative">
             <img src={selectedImage} className="max-w-[90vw] max-h-[90vh] rounded-3xl border border-zinc-800 shadow-2xl animate-in zoom-in-95 duration-200" />
             <p className="text-center text-white/50 text-xs mt-4 uppercase tracking-widest font-bold">Kapatmak için boşluğa tıkla</p>
          </div>
        </div>
      )}
    </div>
  );
}