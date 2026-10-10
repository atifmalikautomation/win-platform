import React, { useState, useEffect, useRef, useCallback } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import CrashGame from './components/CrashGame';
import GamesLobby from './components/GamesLobby';
import AdminDashboard from './components/AdminDashboard';
import AuthModal from './components/AuthModal';
import CashierModal from './components/CashierModal';
import ProvablyFairModal from './components/ProvablyFairModal';
import { ShieldCheck, Lock, Gamepad2, Plus, Sliders } from 'lucide-react';
import { soundFx } from './utils/soundEffects';

export default function App() {
  const [activeTab, setActiveTab] = useState('crash'); // 'crash' | 'lobby' | 'admin'
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0.0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const lastLocalBalanceActionTime = useRef(0);

  const [authModal, setAuthModal] = useState({ isOpen: false, mode: 'login' });
  const [cashierModal, setCashierModal] = useState({ isOpen: false, tab: 'deposit' });
  const [fairModal, setFairModal] = useState(false);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('luckywin_token');
    localStorage.removeItem('luckywin_active_user');
    localStorage.removeItem('luckywin_local_users'); // old insecure offline accounts
    setUser(null);
    setBalance(0);
    setActiveTab('crash');
  }, []);

  // Restore session (server is the only source of truth)
  useEffect(() => {
    localStorage.removeItem('luckywin_local_users');
    const savedUserStr = localStorage.getItem('luckywin_active_user');
    const token = localStorage.getItem('luckywin_token');
    if (!token || token.startsWith('local_token_')) {
      if (savedUserStr || token) handleLogout();
      return;
    }
    if (savedUserStr) {
      try {
        const localUser = JSON.parse(savedUserStr);
        setUser(localUser);
        setBalance(Number(localUser.balance) || 0);
      } catch (e) {}
    }
  }, [handleLogout]);

  // Balance / session sync with the server
  useEffect(() => {
    let isMounted = true;
    const sync = async () => {
      const token = localStorage.getItem('luckywin_token');
      if (!token) return;
      try {
        const res = await fetch(`/api/auth/me?_t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store'
        });
        if (res.status === 401 || res.status === 403) {
          if (isMounted) handleLogout();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.user || !isMounted) return;
        const remoteBal = Number(data.user.balance ?? 0);
        // Don't overwrite a balance we just received from a bet/cashout response.
        if (Date.now() - lastLocalBalanceActionTime.current < 2500) return;
        setBalance(remoteBal);
        const updatedUser = { ...data.user, balance: remoteBal };
        setUser(updatedUser);
        localStorage.setItem('luckywin_active_user', JSON.stringify(updatedUser));
      } catch (e) {}
    };
    sync();
    const interval = setInterval(sync, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user?.id, handleLogout]);

  const handleAuthSuccess = (userData) => {
    lastLocalBalanceActionTime.current = Date.now();
    setUser(userData);
    setBalance(Number(userData.balance) || 0);
    localStorage.setItem('luckywin_active_user', JSON.stringify(userData));
  };

  const handleBalanceUpdate = useCallback((newBalance) => {
    const formatted = parseFloat(Math.max(0, Number(newBalance)).toFixed(2));
    lastLocalBalanceActionTime.current = Date.now();
    setBalance(formatted);
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, balance: formatted };
      localStorage.setItem('luckywin_active_user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const goTo = (tab) => {
    setActiveTab(tab === 'mines' ? 'lobby' : tab);
  };

  return (
    <div className="min-h-screen bg-[#0a0c14] text-slate-100 flex font-sans selection:bg-[#e60026] selection:text-white relative">
      <Sidebar
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          goTo(tab);
          if (window.innerWidth < 1024) setSidebarOpen(false);
        }}
        onOpenCashier={(tab) => setCashierModal({ isOpen: true, tab })}
        onOpenProvablyFair={() => setFairModal(true)}
        user={user}
      />

      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/75 z-45 lg:hidden backdrop-blur-xs" />
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <Navbar
          activeTab={activeTab}
          setActiveTab={goTo}
          user={user}
          balance={balance}
          onOpenAuth={(mode) => setAuthModal({ isOpen: true, mode })}
          onLogout={handleLogout}
          onOpenCashier={(tab) => setCashierModal({ isOpen: true, tab })}
          onOpenProvablyFair={() => setFairModal(true)}
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        />

        <main className="flex-1 pb-20 md:pb-0">
          {activeTab === 'crash' && (
            <div>
              <CrashGame
                user={user}
                balance={balance}
                onBalanceUpdate={handleBalanceUpdate}
                onOpenAuth={(mode) => setAuthModal({ isOpen: true, mode })}
              />
              <div className="max-w-7xl mx-auto px-3 sm:px-6 py-8">
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-300">
                    <Gamepad2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-heading font-black text-lg sm:text-xl text-white">More games coming soon</h2>
                    <p className="text-xs text-slate-400">Aviator is live now. New games are being prepared.</p>
                  </div>
                </div>
                <GamesLobby onSelectGame={goTo} />
              </div>
            </div>
          )}

          {activeTab === 'lobby' && (
            <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
              <div className="mb-6">
                <h1 className="font-heading font-black text-2xl sm:text-3xl text-white tracking-tight">SkyWin Games</h1>
                <p className="text-sm text-slate-400 mt-1">Aviator is live. Other games are coming soon.</p>
              </div>
              <GamesLobby onSelectGame={goTo} />
            </div>
          )}

          {activeTab === 'admin' && user?.role === 'admin' && (
            <AdminDashboard user={user} onBalanceUpdate={handleBalanceUpdate} />
          )}
        </main>

        <footer className="border-t border-[#182035] bg-[#080c14] py-8 px-4 text-xs text-slate-500 mt-10">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="font-heading font-black text-sm text-white">SKYWIN</span>
              <span>•</span>
              <span className="text-[#ffbe18] font-bold">18+ Only</span>
              <span>•</span>
              <span>Play responsibly</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-slate-400 text-xs">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#00d632]" />
                <span>Provably fair rounds</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-[#1a68ff]" />
                <span>HTTPS secured</span>
              </div>
              <button onClick={() => setFairModal(true)} className="text-[#38bdf8] hover:underline font-heading font-bold">
                How fairness works
              </button>
            </div>
          </div>
        </footer>
      </div>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0a0d14]/95 backdrop-blur-md border-t border-[#181d2a] px-2 py-1.5 flex items-center justify-around shadow-2xl">
        <button
          onClick={() => { goTo('crash'); soundFx.playBet(); }}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-heading font-bold ${activeTab === 'crash' ? 'text-[#ff1a40]' : 'text-slate-400'}`}
        >
          <img src="/aviator_plane.png" alt="Aviator" className="w-5 h-4 object-contain" />
          <span>Aviator</span>
        </button>

        <button
          onClick={() => {
            if (!user) setAuthModal({ isOpen: true, mode: 'register' });
            else setCashierModal({ isOpen: true, tab: 'deposit' });
            soundFx.playBet();
          }}
          className="btn-bet-green -mt-3.5 px-3 py-1.5 rounded-2xl shadow-lg flex flex-col items-center justify-center text-slate-950 font-heading font-black shrink-0"
        >
          <Plus className="w-5 h-5 stroke-[3]" />
          <span className="text-[9px] uppercase tracking-wider leading-none">{user ? 'Deposit' : 'Register'}</span>
        </button>

        <button
          onClick={() => { goTo('lobby'); soundFx.playBet(); }}
          className={`flex flex-col items-center gap-0.5 text-[10px] font-heading font-bold ${activeTab === 'lobby' ? 'text-[#38bdf8]' : 'text-slate-400'}`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>Games</span>
        </button>

        {user?.role === 'admin' ? (
          <button
            onClick={() => { goTo('admin'); soundFx.playBet(); }}
            className={`flex flex-col items-center gap-0.5 text-[10px] font-heading font-bold ${activeTab === 'admin' ? 'text-[#ffb800]' : 'text-slate-400'}`}
          >
            <Sliders className="w-4 h-4 text-[#ffb800]" />
            <span>Admin</span>
          </button>
        ) : (
          <button
            onClick={() => {
              if (!user) setAuthModal({ isOpen: true, mode: 'login' });
              else setFairModal(true);
              soundFx.playBet();
            }}
            className="flex flex-col items-center gap-0.5 text-[10px] font-heading font-bold text-slate-400"
          >
            <ShieldCheck className="w-4 h-4 text-[#1a68ff]" />
            <span>{user ? 'Fair' : 'Login'}</span>
          </button>
        )}
      </nav>

      <AuthModal
        isOpen={authModal.isOpen}
        initialMode={authModal.mode}
        onClose={() => setAuthModal({ isOpen: false, mode: 'login' })}
        onAuthSuccess={handleAuthSuccess}
      />

      <CashierModal
        isOpen={cashierModal.isOpen}
        initialTab={cashierModal.tab}
        user={user}
        balance={balance}
        onClose={() => setCashierModal({ isOpen: false, tab: 'deposit' })}
        onBalanceUpdate={handleBalanceUpdate}
      />

      <ProvablyFairModal isOpen={fairModal} onClose={() => setFairModal(false)} />
    </div>
  );
}
