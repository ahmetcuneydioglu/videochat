"use client";
import { useEffect, useState } from "react";

export default function AdminDashboard() {
  const [password, setPassword] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [activeUsers, setActiveUsers] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [bans, setBans] = useState<any[]>([]);
  const [stats, setStats] = useState({ activeUsers: 0, totalBans: 0, pendingReports: 0, totalMatchesToday: 0 });
  
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [userHistory, setUserHistory] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Verileri Çekme Fonksiyonu
  const fetchData = async () => {
    try {
      const [userRes, repRes, banRes, statRes] = await Promise.all([
        fetch("https://videochat-1-1s2q.onrender.com/api/admin/active-users"),
        fetch("https://videochat-1-1s2q.onrender.com/api/reports"),
        fetch("https://videochat-1-1s2q.onrender.com/api/bans"),
        fetch("https://videochat-1-1s2q.onrender.com/api/admin/stats")
      ]);

      if (userRes.ok) setActiveUsers(await userRes.json());
      if (repRes.ok) setReports(await repRes.json());
      if (banRes.ok) setBans(await banRes.json());
      if (statRes.ok) setStats(await statRes.json());
    } catch (err) {
      console.error("Veri senkronizasyon hatası:", err);
    }
  };

  // Seçilen Kullanıcının Geçmişini Çekme
  useEffect(() => {
    if (selectedUser) {
      fetch(`https://videochat-1-1s2q.onrender.com/api/admin/user-logs/${selectedUser.id}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => setUserHistory(data))
        .catch(err => console.error("Geçmiş yüklenemedi:", err));
    }
  }, [selectedUser]);

  useEffect(() => {
    if (isLoggedIn) {
      fetchData();
      const interval = setInterval(fetchData, 5000);
      return () => clearInterval(interval);
    }
  }, [isLoggedIn]);

  // Giriş Ekranı
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 p-10 rounded-[40px] w-full max-w-sm shadow-2xl">
          <h2 className="text-2xl font-black mb-8 text-white text-center italic uppercase tracking-tighter">Komuta Merkezi</h2>
          <input 
            type="password" 
            placeholder="Güvenlik Kodu" 
            className="w-full bg-zinc-800 p-4 rounded-2xl mb-4 text-white outline-none border border-zinc-700 focus:border-blue-500 transition-all" 
            onChange={(e) => setPassword(e.target.value)} 
          />
          <button 
            onClick={() => password === "admin123" && setIsLoggedIn(true)} 
            className="w-full bg-blue-600 py-4 rounded-2xl font-bold text-white uppercase tracking-widest hover:bg-blue-500 transition-all shadow-lg shadow-blue-600/20"
          >
            SİSTEME GİRİŞ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 font-sans">
      
      {/* Üst İstatistik Paneli */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 max-w-7xl mx-auto">
        {[
          { label: "Online", value: stats.activeUsers, color: "text-green-500" },
          { label: "Rapor", value: stats.pendingReports, color: "text-red-500" },
          { label: "Ban", value: stats.totalBans, color: "text-zinc-500" },
          { label: "Bugünkü Maç", value: stats.totalMatchesToday, color: "text-blue-500" },
        ].map((s, i) => (
          <div key={i} className="bg-zinc-900/40 border border-zinc-800/50 p-6 rounded-[35px] backdrop-blur-xl">
            <p className="text-[10px] font-black uppercase text-zinc-600 tracking-widest mb-1">{s.label}</p>
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 max-w-7xl mx-auto">
        
        {/* SOL: AKTİF KULLANICI LİSTESİ */}
        <div className="lg:col-span-3 space-y-4">
          <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Aktif Oturumlar</h3>
          <div className="bg-zinc-900/20 border border-zinc-800/40 rounded-[35px] p-3 max-h-[700px] overflow-y-auto custom-scrollbar">
            {activeUsers.map(user => (
              <div 
                key={user.id} 
                onClick={() => setSelectedUser(user)}
                className={`p-4 mb-2 rounded-2xl cursor-pointer transition-all border ${selectedUser?.id === user.id ? 'bg-blue-600/20 border-blue-500 shadow-lg shadow-blue-500/5' : 'bg-zinc-800/30 border-transparent hover:border-zinc-700'}`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-mono text-[10px] font-bold text-zinc-400">{user.id.slice(-8)}</span>
                  <span className={`w-2 h-2 rounded-full ${user.status === 'BUSY' ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`}></span>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-[9px] font-black uppercase text-zinc-600">{user.country} • IP: {user.ip?.slice(0,10)}...</span>
                   {user.reports > 0 && <span className="text-[9px] bg-red-600 px-2 py-0.5 rounded-full font-bold">! {user.reports}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ORTA: KULLANICI DETAY VE GEÇMİŞ */}
        <div className="lg:col-span-6">
          {selectedUser ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-[45px] p-8 shadow-2xl sticky top-6">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Profil Detayı</h2>
                  <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">ID: {selectedUser.id}</p>
                </div>
                <div className={`px-4 py-2 rounded-full text-[10px] font-black uppercase ${selectedUser.status === 'BUSY' ? 'bg-green-500/10 text-green-500' : 'bg-zinc-800 text-zinc-500'}`}>
                  {selectedUser.status === 'BUSY' ? 'Konuşuyor' : 'Boşta'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-8">
                <div className="space-y-4">
                  <div><p className="text-[9px] font-black text-zinc-600 uppercase">IP</p><p className="font-mono text-xs font-bold">{selectedUser.ip}</p></div>
                  <div><p className="text-[9px] font-black text-zinc-600 uppercase">Konum</p><p className="font-bold text-sm">{selectedUser.country}</p></div>
                </div>
                <div className="space-y-4 text-right">
                  <div><p className="text-[9px] font-black text-zinc-600 uppercase">Skip Sayısı</p><p className="font-bold text-orange-500">{selectedUser.skips}</p></div>
                  <div><p className="text-[9px] font-black text-zinc-600 uppercase">Raporlar</p><p className="font-bold text-red-500">{selectedUser.reports}</p></div>
                </div>
              </div>

              {/* OTURUM HAREKETLERİ */}
              <div className="bg-black/40 p-5 rounded-[30px] border border-zinc-800/50">
                <h4 className="text-[10px] font-black uppercase text-zinc-600 mb-4 tracking-widest">Oturum Hareketleri</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {userHistory.map((log, i) => (
                    <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-zinc-800/20 border border-zinc-800/30">
                      <div className="flex flex-col">
                        <span className={`text-[8px] font-black uppercase ${log.action === 'REPORTED' ? 'text-red-500' : 'text-zinc-500'}`}>{log.action}</span>
                        <span className="text-[7px] text-zinc-600 font-mono">Partner: {log.targetId?.slice(-6) || "N/A"}</span>
                      </div>
                      <span className="text-[8px] text-zinc-700">{new Date(log.date).toLocaleTimeString()}</span>
                    </div>
                  ))}
                  {userHistory.length === 0 && <p className="text-[9px] text-zinc-700 italic text-center">Hareket kaydı bulunamadı.</p>}
                </div>
              </div>

              <button 
                onClick={() => {
                  if(confirm("Kullanıcı yasaklanacak?")) {
                    fetch("https://videochat-1-1s2q.onrender.com/api/ban-user", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ reportedId: selectedUser.id, ip: selectedUser.ip })
                    }).then(() => { setSelectedUser(null); fetchData(); });
                  }
                }}
                className="w-full mt-8 bg-red-600 hover:bg-red-500 py-4 rounded-2xl font-black uppercase text-xs tracking-widest transition-all"
              >
                Kalıcı Yasakla
              </button>
            </div>
          ) : (
            <div className="h-[600px] bg-zinc-900/10 border-2 border-dashed border-zinc-900/40 rounded-[45px] flex flex-col items-center justify-center text-center">
              <p className="text-zinc-700 font-bold uppercase text-[10px] tracking-widest">Kullanıcı detayları için soldan seçim yapın</p>
            </div>
          )}
        </div>

        {/* SAĞ: RAPORLAR VE BANLILAR */}
        <div className="lg:col-span-3 space-y-8">
           <div className="space-y-4">
              <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Güncel Raporlar</h3>
              <div className="space-y-3">
                {reports.slice(0, 5).map((r, i) => (
                  <div key={i} className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-2xl flex items-center gap-3">
                    {r.screenshot && (
                      <img 
                        src={r.screenshot} 
                        onClick={() => setSelectedImage(r.screenshot)} 
                        className="w-12 h-10 object-cover rounded-lg cursor-zoom-in border border-zinc-800" 
                      />
                    )}
                    <div className="overflow-hidden">
                      <p className="font-mono text-[9px] font-bold text-blue-400 truncate">ID: {r.reportedId.slice(-6)}</p>
                      <button 
                        onClick={() => fetch(`https://videochat-1-1s2q.onrender.com/api/reports/${r._id}`, {method:'DELETE'}).then(fetchData)}
                        className="text-[8px] text-zinc-600 font-black uppercase hover:text-red-500 transition-all"
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                ))}
              </div>
           </div>

           <div className="space-y-4">
              <h3 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest px-2">Yasaklı IP Adresleri</h3>
              <div className="bg-zinc-900/30 border border-zinc-800 rounded-[30px] p-2 max-h-60 overflow-y-auto custom-scrollbar">
                {bans.map((b, i) => (
                  <div key={i} className="p-3 border-b border-zinc-800/50 last:border-0 flex justify-between items-center">
                    <span className="text-[9px] font-mono text-zinc-500">{b.ip}</span>
                    <button 
                      onClick={() => fetch(`https://videochat-1-1s2q.onrender.com/api/bans/${b.ip}`, {method:'DELETE'}).then(fetchData)}
                      className="text-[8px] text-blue-500 font-black hover:text-blue-400"
                    >
                      Kaldır
                    </button>
                  </div>
                ))}
              </div>
           </div>
        </div>
      </div>

      {/* Screenshot Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-[500] bg-black/95 backdrop-blur-md flex items-center justify-center p-10" onClick={() => setSelectedImage(null)}>
          <img src={selectedImage} className="max-w-full max-h-full rounded-3xl border border-zinc-800 shadow-2xl animate-in zoom-in-95 duration-200" />
        </div>
      )}
    </div>
  );
}