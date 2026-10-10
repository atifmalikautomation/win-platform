import React, { useEffect, useRef, useState } from 'react';
import {
  ShieldCheck, LogOut, Sliders, Volume2, VolumeX, Plus, Eye, EyeOff,
  Menu, Gamepad2, ChevronDown, ArrowUpFromLine, Receipt, Lock
} from 'lucide-react';
import { soundFx } from '../utils/soundEffects';

export function Brand({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-2 select-none" aria-label="SkyWin home">
      <img src="/aviator_plane.png" alt="" className="w-8 h-auto" draggable="false" />
      <span className="font-heading font-black text-xl tracking-tight leading-none">
        <span className="text-white">SKY</span><span className="text-[#e50539]">WIN</span>
      </span>
    </button>
  );
}

export default function Navbar({
  activeTab,
  setActiveTab,
  user,
  onOpenAuth,
  onLogout,
  onOpenCashier,
  onOpenProvablyFair,
  onChangePassword,
  balance,
  onToggleSidebar
}) {
  const [isMuted, setIsMuted] = useState(soundFx.isMuted);
  const [hideBalance, setHideBalance] = useState(() => localStorage.getItem('skywin_hide_balance') === '1');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const toggleMute = () => {
    const muted = soundFx.toggleMute();
    setIsMuted(muted);
    if (!muted) soundFx.playBet();
  };
  const toggleHide = () => {
    setHideBalance(v => {
      localStorage.setItem('skywin_hide_balance', v ? '0' : '1');
      return !v;
    });
  };

  const tabs = [
    { id: 'crash', label: 'Aviator', icon: <img src="/aviator_plane.png" alt="" className="w-4 h-auto" /> },
    { id: 'lobby', label: 'Games', icon: <Gamepad2 className="w-4 h-4" /> }
  ];
  if (user?.role === 'admin') tabs.push({ id: 'admin', label: 'Admin', icon: <Sliders className="w-4 h-4" /> });

  const balanceText = hideBalance
    ? '••••••'
    : Number(balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <header className="sticky top-0 z-40 bg-[#141416]/95 backdrop-blur border-b border-white/[0.06]">
      <div className="max-w-[1400px] mx-auto h-14 px-2 sm:px-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-4 min-w-0">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label="Open menu"
            className="lg:hidden p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="lg:hidden"><Brand onClick={() => setActiveTab('crash')} /></div>

          <nav className="hidden md:flex items-center gap-1" aria-label="Main">
            {tabs.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                aria-current={activeTab === t.id ? 'page' : undefined}
                className={`flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-semibold transition-colors ${
                  activeTab === t.id ? 'bg-white/[0.08] text-white' : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
                } ${t.id === 'admin' ? 'text-amber-300' : ''}`}
              >
                {t.icon}{t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={onOpenProvablyFair}
              className="flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-semibold text-zinc-400 hover:text-white hover:bg-white/[0.04]"
            >
              <ShieldCheck className="w-4 h-4" /> Provably fair
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleMute}
            aria-label={isMuted ? 'Unmute sound' : 'Mute sound'}
            aria-pressed={!isMuted}
            className="hidden sm:inline-flex p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
          >
            {isMuted ? <VolumeX className="w-[18px] h-[18px]" /> : <Volume2 className="w-[18px] h-[18px]" />}
          </button>

          {user ? (
            <>
              <div className="flex items-center h-9 rounded-lg bg-[#1f2023] border border-white/[0.08] pl-2.5 pr-1">
                <div className="flex flex-col leading-none mr-1">
                  <span className="hidden sm:block text-[9px] text-zinc-500 font-bold uppercase tracking-wider">Balance</span>
                  <span className="text-white font-bold text-xs sm:text-sm tabular-nums">
                    {balanceText} <span className="text-zinc-400 text-[10px] sm:text-xs font-semibold">PKR</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleHide}
                  aria-label={hideBalance ? 'Show balance' : 'Hide balance'}
                  className="p-1 rounded text-zinc-500 hover:text-zinc-200"
                >
                  {hideBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <button
                type="button"
                onClick={() => onOpenCashier('deposit')}
                className="btn-bet-green flex items-center gap-1 h-9 px-2.5 sm:px-3.5 text-xs sm:text-sm rounded-lg"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                <span className="hidden xs:inline">Deposit</span>
              </button>

              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen(v => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Account menu"
                  className="flex items-center gap-1 h-9 pl-1 pr-1.5 rounded-lg hover:bg-white/5"
                >
                  <span className="w-7 h-7 rounded-full bg-[#e50539] text-white flex items-center justify-center text-xs font-bold uppercase">
                    {(user.username || '?')[0]}
                  </span>
                  <ChevronDown className={`hidden sm:block w-4 h-4 text-zinc-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
                </button>
                {menuOpen && (
                  <div role="menu" className="toast-in absolute right-0 top-full mt-2 w-56 rounded-xl bg-[#232427] border border-white/10 shadow-2xl p-1.5 z-50">
                    <div className="px-2.5 py-2 border-b border-white/[0.06] mb-1">
                      <div className="text-sm font-bold text-white truncate">{user.username}</div>
                      {user.email && <div className="text-[11px] text-zinc-500 truncate">{user.email}</div>}
                    </div>
                    <MenuItem icon={<Plus className="w-4 h-4" />} label="Deposit" onClick={() => { setMenuOpen(false); onOpenCashier('deposit'); }} />
                    <MenuItem icon={<ArrowUpFromLine className="w-4 h-4" />} label="Withdraw" onClick={() => { setMenuOpen(false); onOpenCashier('withdraw'); }} />
                    <MenuItem icon={<Receipt className="w-4 h-4" />} label="Transactions" onClick={() => { setMenuOpen(false); onOpenCashier('history'); }} />
                    {onChangePassword && user.role !== 'admin' && (
                      <MenuItem icon={<Lock className="w-4 h-4" />} label="Change password" onClick={() => { setMenuOpen(false); onChangePassword(); }} />
                    )}
                    <div className="my-1 border-t border-white/[0.06]" />
                    <MenuItem icon={<LogOut className="w-4 h-4" />} label="Log out" danger onClick={() => { setMenuOpen(false); onLogout(); }} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenAuth('login')}
                className="h-9 px-3 rounded-lg text-sm font-semibold text-zinc-200 hover:text-white hover:bg-white/5"
              >
                Log in
              </button>
              <button
                type="button"
                onClick={() => onOpenAuth('register')}
                className="btn-primary h-9 px-3 sm:px-4 text-sm rounded-lg"
              >
                Sign up
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MenuItem({ icon, label, onClick, danger }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium text-left ${
        danger ? 'text-rose-300 hover:bg-[#e50539]/10' : 'text-zinc-200 hover:bg-white/5'
      }`}
    >
      {icon}{label}
    </button>
  );
}
