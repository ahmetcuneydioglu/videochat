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
  
  // YENİ EKLENEN: Düzenleme Modalı State'i
  const [editUserModal, setEditUserModal] = useState<any>(null);

  // admin user stateleri
  const [view, setView] = useState<"live" | "users">("live"); 
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState("");
  
  // Eklenen: Rapor verisini modal'a taşımak için
  const [imageReportData, setImageReportData] = useState<any>(null);

  // Sayfa yüklendiğinde daha önce giriş yapılmış mı kontrol et
  useEffect(() => {
    const savedAuth = localStorage.getItem("adminAuth");
    if (savedAuth === "true") {
      setIsLoggedIn(true);
    }
  }, []);

  const handleLogin = () => {
    if (password === "admin123") {
      setIsLoggedIn(true);
      localStorage.setItem("adminAuth", "true"); // Şifreyi hatırla
    } else {
      alert("Hatalı Güvenlik Kodu!");
    }
  };  


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

  // Tüm kayıtlı kullanıcıları getiren fonksiyon
  const fetchAllUsers = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/all-users`);
      if (res.ok) setAllUsers(await res.json());
    } catch (err) {
      console.error("Kullanıcı listesi çekilemedi:", err);
    }
  };

  // YENİ EKLENEN: Kullanıcı Güncelleme Fonksiyonu
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!editUserModal) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/update-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          userId: editUserModal._id, 
          updateData: {
            gems: parseInt(editUserModal.gems) || 0,
            trustScore: parseInt(editUserModal.trustScore) || 0,
            role: editUserModal.role,
            status: editUserModal.status
          } 
        })
      });

      if (res.ok) {
        alert("Kullanıcı başarıyla güncellendi!");
        setEditUserModal(null);
        fetchAllUsers(); // Listeyi yenile
      } else {
        alert("Güncelleme başarısız oldu.");
      }
    } catch (err) {
      console.error("Güncelleme hatası:", err);
      alert("Sistemsel bir hata oluştu.");
    }
  };

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

  // Sebepli Ban Fonksiyonu
  const banByIP = async (ip: string, id?: string) => {
    const reason = prompt(`${ip} adresi 24 saat yasaklanacak.\nLütfen bir sebep girin:`, "Kurallara aykırı davranış");
    if (reason === null) return; 

    try {
        await fetch(`${BACKEND_URL}/api/ban-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reportedId: id, ip: ip, reason: reason }) 
        });
        alert("Kullanıcı 24 saat yasaklandı ve sistemden atıldı.");
        setSelectedImage(null);
        fetchData();
    } catch (err) {
        console.error("Ban hatası:", err);
    }
  };

  useEffect(() => {
    if (selectedUser) {
      fetch(`${BACKEND_URL}/api/admin/user-logs/${selectedUser.id}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => setUserHistory(data))
        .catch(err => console.error("Geçmiş yüklenemedi:", err));
    }
  }, [selectedUser]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
      const interval = setInterval(fetchData, 3000); 
      return () => clearInterval(interval);
    }
  }, [isLoggedIn]);

  // Görünüm değiştiğinde kullanıcıları çek
  useEffect(() => {
    if (view === "users" && isLoggedIn) {
      fetchAllUsers();
    }
  }, [view, isLoggedIn]);

  // --- GİRİŞ EKRANI ---
  if (!isLoggedIn) {
    return (
      <div className="fixed inset-0 z-[2000] bg-[#050505] flex items-center justify-center p-6 select-none">
        <div className="bg-[#111113] border border-white/5 p-12 rounded-[48px] w-full max-w-sm shadow-2xl relative overflow-hidden text-center">
          {/* Üst Dekoratif Çizgi */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600"></div>
          
          <div className="mb-8">
            <h2 className="text-4xl font-black italic tracking-tighter text-white uppercase italic">OMEGPT</h2>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-[0.4em] mt-2">Control Center</p>
          </div>

          <div className="space-y-4">
            <input 
              type="password" 
              placeholder="••••••" 
              autoFocus
              className="w-full bg-white/5 border border-white/10 p-5 rounded-3xl text-white outline-none focus:border-blue-500 transition-all text-center tracking-[1em] font-black text-xl placeholder:tracking-normal placeholder:font-normal placeholder:text-zinc-700" 
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
            
            <button 
              onClick={handleLogin} 
              className="w-full bg-white text-black py-5 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-xl shadow-white/5"
            >
              Access System
            </button>
          </div>

          <p className="mt-8 text-[9px] text-zinc-700 font-bold uppercase tracking-widest">
            Authorized Personnel Only
          </p>
        </div>
      </div>
    );
  }

  // --- ANA DASHBOARD ---
  // SCROLL SORUNU İÇİN DÜZELTME: overflow-y-auto eklendi
  return (
    <div className="min-h-screen bg-black text-white p-6 font-sans selection:bg-blue-500/30 overflow-y-auto">
      
      {/* Üst İstatistik Paneli */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 max-w-[1600px] mx-auto">
        {[
          { label: "Online Kullanıcı", value: stats.activeUsers, color: "text-green-400" },
          { label: "Canlı Eşleşme", value: activeMatches.length, color: "text-blue-400" }, 
          { label: "Bekleyen Rapor", value: stats.pendingReports, color: "text-red-500" },
          { label: "Toplam Ban", value: stats.totalBans, color: "text-zinc-500" },
        ].map((s, i) => (
          <div key={i} className="bg-zinc-900/40 border border-zinc-800/50 p-6 rounded-[35px] backdrop-blur-xl hover:bg-zinc-900/60 transition-colors">
            <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest mb-1">{s.label}</p>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Görünüm Değiştirme Menüsü */}
      <div className="flex gap-4 mb-8 max-w-[1600px] mx-auto px-2">
        <button 
          onClick={() => setView("live")} 
          className={`px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all ${view === 'live' ? 'bg-blue-600 text-white shadow-lg' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
        >
          Canlı Komuta
        </button>
        <button 
          onClick={() => setView("users")} 
          className={`px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all ${view === 'users' ? 'bg-blue-600 text-white shadow-lg' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'}`}
        >
          Kullanıcı Veritabanı
        </button>
      </div>

      {view === "live" ? (
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
            {selectedUser ? (
              <div className="bg-zinc-900 border border-zinc-800 rounded-[45px] p-8 shadow-2xl relative overflow-hidden">
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
                    onClick={() => banByIP(selectedUser.ip, selectedUser.id)}
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

            <div className="mt-8 pt-8 border-t border-zinc-800/50">
              <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-6 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                Canlı Görüşmeler ({activeMatches.length})
              </h3>
              <div className="grid grid-cols-1 gap-4">
                {activeMatches.length === 0 ? (
                  <div className="bg-zinc-900/10 border border-dashed border-zinc-800 py-12 rounded-[35px] text-center">
                    <p className="text-zinc-700 font-bold uppercase text-[10px] tracking-[0.2em]">Şu an aktif bir görüşme bulunmuyor</p>
                  </div>
                ) : (
                  activeMatches.map((match) => (
                    <div key={match.id} className="group bg-zinc-900/40 border border-zinc-800/60 p-5 rounded-[30px] flex items-center justify-between hover:bg-zinc-900/80 transition-all">
                      <div className="flex items-center gap-4 w-[40%]">
                        <div className="w-10 h-10 rounded-2xl bg-zinc-800 flex items-center justify-center font-bold text-zinc-500 border border-zinc-700">
                          {match.user1.country || "🌍"}
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-[10px] font-black text-zinc-300 truncate">{match.user1.id.slice(-8)}</p>
                          <p className="text-[8px] text-zinc-600 font-mono">{match.user1.ip?.slice(0, 12)}...</p>
                        </div>
                      </div>
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
                      <div className="flex items-center justify-end gap-4 w-[40%] text-right">
                        <div className="overflow-hidden">
                          <p className="text-[10px] font-black text-zinc-300 truncate">{match.user2.id.slice(-8)}</p>
                          <p className="text-[8px] text-zinc-600 font-mono">{match.user2.ip?.slice(0, 12)}...</p>
                        </div>
                        <div className="w-10 h-10 rounded-2xl bg-zinc-800 flex items-center justify-center font-bold text-zinc-500 border border-zinc-700">
                          {match.user2.country || "🌍"}
                        </div>
                        <button 
                          onClick={() => killMatch(match.id, match.user1.id, match.user2.id)}
                          className="ml-2 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white p-2 rounded-xl border border-red-600/20 transition-all active:scale-90"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* SAĞ KOLON: RAPORLAR VE BANLAR */}
          <div className="lg:col-span-3 space-y-8 h-fit sticky top-6">
            <div className="space-y-4">
                <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Son Şikayetler</h3>
                <div className="space-y-3">
                  {reports.length === 0 && <p className="text-[9px] text-zinc-700 px-2">Temiz.</p>}
                  {reports.slice(0, 5).map((r, i) => (
                    <div key={i} className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-2xl flex items-start gap-3 group hover:bg-zinc-900 transition-all">
                      {r.screenshot && (
                        <div className="relative">
                          <img 
                              src={r.screenshot} 
                              onClick={() => { setSelectedImage(r.screenshot); setImageReportData(r); }} 
                              className="w-16 h-12 object-cover rounded-lg cursor-zoom-in border border-zinc-800 hover:border-red-500 transition-colors" 
                          />
                        </div>
                      )}
                      <div className="overflow-hidden flex-1">
                        <p className="font-mono text-[9px] font-bold text-red-400 truncate mb-1">Hedef: {r.reportedId?.slice(0,6)}</p>
                        <div className="flex gap-2 mt-2">
                          <button 
                            onClick={() => banByIP(r.reportedIP, r.reportedId)} 
                            className="text-[8px] bg-red-600/20 text-red-500 hover:bg-red-600 hover:text-white px-2 py-1 rounded-md font-black uppercase"
                          >
                            Yasakla
                          </button>
                          <button 
                              onClick={() => fetch(`${BACKEND_URL}/api/reports/${r._id}`, {method:'DELETE'}).then(fetchData)}
                              className="text-[8px] bg-zinc-800 px-2 py-1 rounded hover:bg-zinc-700 text-white transition-colors uppercase font-black"
                          >
                              Yoksay
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
            </div>
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
      ) : (
        /* KULLANICI VERİTABANI GÖRÜNÜMÜ */
        <div className="max-w-[1600px] mx-auto bg-zinc-900/40 border border-zinc-800 rounded-[45px] p-8 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-300">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black uppercase italic tracking-tighter text-white">Kayıtlı Üyeler</h2>
            <div className="flex gap-4 w-full max-w-md">
              <input 
                type="text" 
                placeholder="İsim veya Email ile ara..." 
                className="bg-black/40 border border-zinc-800 px-6 py-3 rounded-2xl text-sm outline-none focus:border-blue-500 w-full text-white"
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-separate border-spacing-y-3">
              <thead>
                <tr className="text-[10px] font-black uppercase text-zinc-600 tracking-[0.2em]">
                  <th className="px-6 pb-2">Kullanıcı</th>
                  <th className="px-6 pb-2">Gem Bakiye</th>
                  <th className="px-6 pb-2">Güven Skoru</th>
                  <th className="px-6 pb-2">Rol</th>
                  <th className="px-6 pb-2">Kayıt Tarihi</th>
                  <th className="px-6 pb-2 text-right">Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {allUsers.filter(u => 
                  u.name?.toLowerCase().includes(userSearch.toLowerCase()) || 
                  u.email?.toLowerCase().includes(userSearch.toLowerCase())
                ).map(user => (
                  <tr key={user._id} className={`transition-colors group ${user.trustScore < 40 ? 'bg-red-900/10' : 'bg-black/20 hover:bg-black/40'}`}>
                    <td className="px-6 py-4 rounded-l-3xl border-y border-l border-zinc-800/50">
                      <div className="flex items-center gap-4">
                        <img 
                          src={user.avatar} 
                          className="w-10 h-10 rounded-full border border-zinc-800 object-cover" 
                          onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${user.name}&background=random`)}
                        />
                        <div>
                          <p className="text-sm font-bold text-white">{user.name || "İsimsiz"}</p>
                          <p className="text-[10px] text-zinc-500 font-mono">{user.email || "Email Yok"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 border-y border-zinc-800/50">
                      <span className="text-yellow-500 font-black flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l9 7-9 13L3 9l9-7z"/></svg>
                        {user.gems || 0}
                      </span>
                    </td>
                    <td className="px-6 py-4 border-y border-zinc-800/50">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500" style={{ width: `${user.trustScore || 100}%` }}></div>
                        </div>
                        <span className="text-xs font-black text-blue-400">{user.trustScore || 100}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 border-y border-zinc-800/50">
                      <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full ${user.role === 'admin' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/20' : 'bg-zinc-800 text-zinc-400'}`}>
                        {user.role || 'user'}
                      </span>
                    </td>
                    <td className="px-6 py-4 border-y border-zinc-800/50 text-xs text-zinc-500 font-mono">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 rounded-r-3xl border-y border-r border-zinc-800/50 text-right">
                      {/* DÜZENLENEN KISIM: Ayarlar Modalı Tetikleyici */}
                      <button 
                        onClick={() => setEditUserModal(user)}
                        className="p-2 bg-zinc-800 hover:bg-blue-600 rounded-xl transition-all text-white"
                        title="Düzenle"
                      >
                        ⚙️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- YENİ EKLENEN: PROFİL DÜZENLEME MODALI --- */}
      {editUserModal && (
        <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-md flex items-center justify-center p-6">
          <div className="bg-zinc-950 border border-zinc-800/80 p-8 rounded-[40px] w-full max-w-md shadow-2xl relative overflow-hidden">
            {/* Arka plan ışık efekti */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-600/20 blur-[50px] rounded-full"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-5 mb-8">
                <img 
                  src={editUserModal.avatar} 
                  className="w-16 h-16 rounded-full border-2 border-zinc-800 object-cover" 
                  onError={(e) => (e.currentTarget.src = `https://ui-avatars.com/api/?name=${editUserModal.name}&background=random`)}
                />
                <div>
                  <h2 className="text-xl font-black uppercase text-white tracking-tighter">{editUserModal.name || "İsimsiz"}</h2>
                  <p className="text-[10px] text-zinc-500 font-mono mt-1">ID: {editUserModal._id}</p>
                </div>
              </div>

              <form onSubmit={handleUpdateUser} className="space-y-5">
                {/* Gems Ayarı */}
                <div className="bg-zinc-900/50 p-4 rounded-3xl border border-zinc-800/50">
                  <label className="text-[9px] font-black uppercase text-zinc-500 block mb-2 tracking-widest">Bakiye (Gems)</label>
                  <div className="flex items-center gap-3">
                    <span className="text-yellow-500"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l9 7-9 13L3 9l9-7z"/></svg></span>
                    <input 
                      type="number" 
                      value={editUserModal.gems || 0} 
                      onChange={(e) => setEditUserModal({...editUserModal, gems: e.target.value})}
                      className="w-full bg-transparent text-white font-black text-xl outline-none"
                    />
                  </div>
                </div>

                {/* Güven Skoru */}
                <div className="bg-zinc-900/50 p-4 rounded-3xl border border-zinc-800/50">
                  <label className="text-[9px] font-black uppercase text-zinc-500 block mb-2 tracking-widest">Güven Skoru (0-100)</label>
                  <input 
                    type="number" 
                    min="0" max="100"
                    value={editUserModal.trustScore || 100} 
                    onChange={(e) => setEditUserModal({...editUserModal, trustScore: e.target.value})}
                    className="w-full bg-transparent text-blue-400 font-black text-xl outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Rol Ayarı */}
                  <div className="bg-zinc-900/50 p-4 rounded-3xl border border-zinc-800/50">
                    <label className="text-[9px] font-black uppercase text-zinc-500 block mb-2 tracking-widest">Rol</label>
                    <select 
                      value={editUserModal.role || 'user'} 
                      onChange={(e) => setEditUserModal({...editUserModal, role: e.target.value})}
                      className="w-full bg-transparent text-white text-xs uppercase font-bold outline-none cursor-pointer"
                    >
                      <option className="bg-zinc-900" value="user">User</option>
                      <option className="bg-zinc-900" value="vip">VIP</option>
                      <option className="bg-zinc-900" value="admin">Admin</option>
                    </select>
                  </div>

                  {/* Durum Ayarı */}
                  <div className="bg-zinc-900/50 p-4 rounded-3xl border border-zinc-800/50">
                    <label className="text-[9px] font-black uppercase text-zinc-500 block mb-2 tracking-widest">Durum</label>
                    <select 
                      value={editUserModal.status || 'active'} 
                      onChange={(e) => setEditUserModal({...editUserModal, status: e.target.value})}
                      className="w-full bg-transparent text-white text-xs uppercase font-bold outline-none cursor-pointer"
                    >
                      <option className="bg-zinc-900" value="active">Aktif</option>
                      <option className="bg-zinc-900 text-red-500" value="shadow_banned">Banlı</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button" 
                    onClick={() => setEditUserModal(null)} 
                    className="flex-1 bg-zinc-800/50 hover:bg-zinc-800 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors"
                  >
                    Vazgeç
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-colors shadow-lg shadow-blue-500/20"
                  >
                    Güncelle
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Screenshot Görüntüleme Modalı */}
      {selectedImage && (
        <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-md flex items-center justify-center p-10 cursor-zoom-out" onClick={() => setSelectedImage(null)}>
          <div className="relative flex flex-col items-center gap-6" onClick={(e) => e.stopPropagation()}>
             <img src={selectedImage} className="max-w-[90vw] max-h-[80vh] rounded-3xl border border-zinc-800 shadow-2xl animate-in zoom-in-95 duration-200" />
             <div className="flex gap-4">
                {imageReportData && (
                  <button 
                    onClick={() => banByIP(imageReportData.reportedIP, imageReportData.reportedId)}
                    className="bg-red-600 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl shadow-red-600/20"
                  >
                    KANITLI BANLA
                  </button>
                )}
                <button onClick={() => setSelectedImage(null)} className="bg-zinc-800 text-white px-8 py-4 rounded-2xl font-black uppercase text-xs">Kapat</button>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}