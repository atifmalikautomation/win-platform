import React, { useState, useEffect, useRef, useCallback } from 'react';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import CrashGame from './components/CrashGame';
import GamesLobby from './components/GamesLobby';
import AdminDashboard from './components/AdminDashboard';
import AuthModal from './components/AuthModal';
import CashierModal from './components/CashierModal';
import ProvablyFairModal from './components/ProvablyFairModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import { ShieldCheck, Gamepad2, Plus, Sliders, User, AlertCircle, X } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState('crash'); // 'crash' | 'lobby' | 'admin'
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0.0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const lastLocalBalanceActionTime = useRef(0);

  const [authModal, setAuthModal] = useState({ isOpen: false, mode: 'login' });
  const [cashierModal, setCashierModal] = useState({ isOpen: false, tab: 'deposit' });
  const [fairModal, setFairModal] = useState(false);
  const [pwModal, setPwModal] = useState(false);
  const [notice, setNotice] = useState(null);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('luckywin_token');
    localStorage.removeItem('luckywin_active_user');
    localStorage.removeItem('luckywin_local_users'); // old insecure offline accounts
    localStorage.removeItem('luckywin_local_transactions');
    localStorage.removeItem('luckywin_transactions');
    setUser(null);
    setBalance(0);
    setActiveTab('crash');
  }, []);

  const sessionInvalid = useCallback((message) => {
    if (!localStorage.getItem('luckywin_token')) return;
    handleLogout();
    setCashierModal({ isOpen: false, tab: 'deposit' });
    setPwModal(false);
    setNotice(message || 'Your session has expired. Please log in again.');
    setAuthModal({ isOpen: true, mode: 'login' });
  }, [handleLogout]);

  const sessionInvalidRef = useRef(sessionInvalid);
  useEffect(() => { sessionInvalidRef.current = sessionInvalid; }, [sessionInvalid]);

  // Backend contract: 401 from any authenticated endpoint = session invalid -> log out;
  // 403 with a "suspended" error -> log out with that message.
  useEffect(() => {
    const orig = window.fetch;
    const wrapped = async (input, init) => {
      const res = await orig(input, init);
      try {
        const url = typeof input === 'string' ? input : input?.url || '';
        const h = init?.headers || {};
        const auth = h.Authorization || h.authorization || (typeof h.get === 'function' && h.get('Authorization'));
        const isAuthFlow = /\/api\/auth\/(login|register|google|change-password)/.test(url);
        if (auth && url.includes('/api/') && !isAuthFlow) {
          if (res.status === 401) {
            sessionInvalidRef.current('Your session has expired. Please log in again.');
          } else if (res.status === 403) {
            res.clone().json().then(d => {
              if (/suspend/i.test(d?.error || '')) sessionInvalidRef.current(d.error);
            }).catch(() => {});
          }
        }
      } catch (e) { /* never break the request */ }
      return res;
    };
    window.fetch = wrapped;
    return () => { if (window.fetch === wrapped) window.fetch = orig; };
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

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
      } catch (e) { /* ignore corrupt cache */ }
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
          // handled by the fetch wrapper (401 / suspended); other 403s also mean the session is unusable
          if (isMounted && res.status === 403) {
            const d = await res.clone().json().catch(() => ({}));
            if (!/suspend/i.test(d.error || '')) sessionInvalidRef.current(d.error || 'Access denied. Please log in again.');
          }
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
      } catch (e) { /* offline: keep last known state */ }
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
    setNotice(null);
    localStorage.setItem('luckywin_active_user', JSON.stringify(userData));
  };

  const handleBalanceUpdate = useCallback((newBalance) => {
    const n = Number(newBalance);
    if (!Number.isFinite(n)) return;
    const formatted = parseFloat(Math.max(0, n).toFixed(2));
    lastLocalBalanceActionTime.current = Date.now();
    setBalance(formatted);
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, balance: formatted };
      localStorage.setItem('luckywin_active_user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const goTo = useCallback((tab) => {
    setActiveTab(tab === 'mines' ? 'lobby' : tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const openAuth = useCallback((mode = 'login') => setAuthModal({ isOpen: true, mode }), []);
  const openCashier = useCallback((tab = 'deposit') => {
    if (!localStorage.getItem('luckywin_token')) {
      setAuthModal({ isOpen: true, mode: 'register' });
      return;
    }
    setCashierModal({ isOpen: true, tab });
  }, []);
  const closeFair = useCallback(() => setFairModal(false), []);
  const closePw = useCallback(() => setPwModal(false), []);
  const closeSidebarOnMobile = () => { if (window.innerWidth < 1024) setSidebarOpen(false); };

  // Lock page scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = sidebarOpen && window.innerWidth < 1024 ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  const bottomItem = (active) =>
    `flex flex-col items-center justify-center gap-0.5 min-w-[56px] h-full text-[10px] font-semibold ${active ? 'text-white' : 'text-zinc-500'}`;

  return (
    <div className="min-h-screen bg-[#0e0e10] text-zinc-100 flex font-sans selection:bg-[#e50539] selection:text-white relative">
      <Sidebar
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        activeTab={activeTab}
        setActiveTab={(tab) => { goTo(tab); closeSidebarOnMobile(); }}
        onOpenCashier={(tab) => { openCashier(tab); closeSidebarOnMobile(); }}
        onOpenProvablyFair={() => { setFairModal(true); closeSidebarOnMobile(); }}
        user={user}
      />

      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/70 z-[45] lg:hidden backdrop-blur-[2px] animate-fadeIn" aria-hidden="true" />
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <Navbar
          activeTab={activeTab}
          setActiveTab={goTo}
          user={user}
          balance={balance}
          onOpenAuth={openAuth}
          onLogout={handleLogout}
          onOpenCashier={openCashier}
          onOpenProvablyFair={() => setFairModal(true)}
          onChangePassword={() => setPwModal(true)}
          onToggleSidebar={() => setSidebarOpen(prev => !prev)}
        />

        {notice && (
          <div className="max-w-[1400px] w-full mx-auto px-2 sm:px-4 pt-2">
            <div role="alert" className="flex items-center gap-2 rounded-xl bg-[#2a0d12] border border-[#e50539]/40 text-rose-100 text-sm px-3.5 py-2.5">
              <AlertCircle className="w-4 h-4 text-[#ff4d6d] shrink-0" />
              <span className="flex-1">{notice}</span>
              <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="p-1 text-rose-200/70 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        <main className="flex-1 pb-20 md:pb-6">
          {activeTab === 'crash' && (
            <>
              <CrashGame
                user={user}
                balance={balance}
                onBalanceUpdate={handleBalanceUpdate}
                onOpenAuth={openAuth}
                onOpenCashier={openCashier}
              />
              <section className="max-w-[1400px] mx-auto px-2 sm:px-4 pt-6 sm:pt-8">
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <h2 className="font-heading font-extrabold text-lg sm:text-xl text-white">More games</h2>
                    <p className="text-xs text-zinc-500">Aviator is live. Other games are coming soon.</p>
                  </div>
                </div>
                <GamesLobby onSelectGame={goTo} />
              </section>
            </>
          )}

          {activeTab === 'lobby' && (
            <div className="max-w-[1400px] mx-auto px-2 sm:px-4 py-4 sm:py-6">
              <div className="mb-4">
                <h1 className="font-heading font-black text-2xl sm:text-3xl text-white tracking-tight">Games</h1>
                <p className="text-sm text-zinc-500 mt-1">Aviator is live. Other games are coming soon.</p>
              </div>
              <GamesLobby onSelectGame={goTo} />
            </div>
          )}

          {activeTab === 'admin' && user?.role === 'admin' && (
            <AdminDashboard user={user} onBalanceUpdate={handleBalanceUpdate} />
          )}
          {activeTab === 'admin' && user?.role !== 'admin' && (
            <div className="max-w-md mx-auto px-4 py-16 text-center">
              <ShieldCheck className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400">This area is for administrators only.</p>
            </div>
          )}
        </main>

        <footer className="border-t border-white/[0.06] bg-[#111113] px-4 pt-8 pb-24 md:pb-8 text-xs text-zinc-500">
          <div className="max-w-[1400px] mx-auto grid gap-6 md:grid-cols-[1.5fr_1fr_1fr]">
            <div className="space-y-2">
              <div className="font-heading font-black text-base"><span className="text-white">SKY</span><span className="text-[#e50539]">WIN</span></div>
              <p className="leading-relaxed max-w-md">
                Online crash game for players aged 18 and over. Gambling involves financial risk — only play with money you can afford to lose.
                Results are random and every round can be verified.
              </p>
              <div className="flex items-center gap-2 pt-1">
                <span className="px-1.5 py-0.5 rounded border border-amber-400/40 text-amber-300 text-[10px] font-black">18+</span>
                <span>Play responsibly</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-zinc-300 font-semibold text-[11px] uppercase tracking-wider">Play</div>
              <button type="button" onClick={() => goTo('crash')} className="block hover:text-white">Aviator</button>
              <button type="button" onClick={() => goTo('lobby')} className="block hover:text-white">All games</button>
              <button type="button" onClick={() => setFairModal(true)} className="block hover:text-white">Provably fair</button>
            </div>
            <div className="space-y-2">
              <div className="text-zinc-300 font-semibold text-[11px] uppercase tracking-wider">Payments</div>
              <div className="flex items-center gap-2">
                <img src="/easypaisa_icon.png" alt="" className="w-5 h-5 rounded" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <span>Easypaisa (PKR)</span>
              </div>
              <p className="leading-relaxed">Deposits and withdrawals are reviewed manually before they are processed.</p>
            </div>
          </div>
          <div className="max-w-[1400px] mx-auto mt-6 pt-4 border-t border-white/[0.06] flex flex-col sm:flex-row gap-2 justify-between">
            <span>© {new Date().getFullYear()} SkyWin</span>
            <span>Secure connection (HTTPS)</span>
          </div>
        </footer>
      </div>

      {/* Mobile bottom bar */}
      <nav aria-label="Mobile" className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-[#141416]/95 backdrop-blur border-t border-white/[0.06] px-1 flex items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
        <button type="button" onClick={() => goTo('crash')} className={bottomItem(activeTab === 'crash')} aria-current={activeTab === 'crash' ? 'page' : undefined}>
          <img src="/aviator_plane.png" alt="" className={`w-6 h-auto ${activeTab === 'crash' ? '' : 'opacity-60 grayscale'}`} />
          <span>Aviator</span>
        </button>
        <button type="button" onClick={() => goTo('lobby')} className={bottomItem(activeTab === 'lobby')} aria-current={activeTab === 'lobby' ? 'page' : undefined}>
          <Gamepad2 className="w-5 h-5" />
          <span>Games</span>
        </button>
        <button
          type="button"
          onClick={() => (user ? openCashier('deposit') : openAuth('register'))}
          className="self-center btn-bet-green -mt-5 w-14 h-14 rounded-full flex flex-col items-center justify-center shadow-lg ring-4 ring-[#0e0e10]"
          aria-label={user ? 'Deposit' : 'Sign up'}
        >
          <Plus className="w-5 h-5 stroke-[3]" />
          <span className="text-[9px] font-bold leading-none mt-0.5">{user ? 'Deposit' : 'Join'}</span>
        </button>
        <button type="button" onClick={() => setFairModal(true)} className={bottomItem(false)}>
          <ShieldCheck className="w-5 h-5" />
          <span>Fair</span>
        </button>
        {user?.role === 'admin' ? (
          <button type="button" onClick={() => goTo('admin')} className={bottomItem(activeTab === 'admin')}>
            <Sliders className="w-5 h-5 text-amber-300" />
            <span>Admin</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (user ? openCashier('history') : openAuth('login'))}
            className={bottomItem(false)}
          >
            <User className="w-5 h-5" />
            <span>{user ? 'Wallet' : 'Log in'}</span>
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

      <ProvablyFairModal isOpen={fairModal} onClose={closeFair} />
      <ChangePasswordModal isOpen={pwModal} onClose={closePw} onSessionInvalid={sessionInvalid} />
    </div>
  );
}
