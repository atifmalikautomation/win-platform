import React, { useState } from 'react';
import {
  ShieldCheck, X, Sliders, Gamepad2, Plus, ArrowUpFromLine, Receipt, Volume2, VolumeX, HelpCircle
} from 'lucide-react';
import { soundFx } from '../utils/soundEffects';
import { Brand } from './Navbar';

export default function Sidebar({
  isOpen,
  setIsOpen,
  activeTab,
  setActiveTab,
  onOpenCashier,
  onOpenProvablyFair,
  user
}) {
  const [muted, setMuted] = useState(soundFx.isMuted);

  const games = [
    { id: 'crash', name: 'Aviator', badge: 'LIVE', icon: <img src="/aviator_plane.png" alt="" className="w-5 h-auto" /> },
    { id: 'lobby', name: 'All games', icon: <Gamepad2 className="w-[18px] h-[18px]" /> }
  ];
  if (user?.role === 'admin') {
    games.push({ id: 'admin', name: 'Admin desk', icon: <Sliders className="w-[18px] h-[18px] text-amber-300" /> });
  }

  const Item = ({ active, icon, label, badge, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`w-full flex items-center justify-between gap-3 px-3 h-10 rounded-lg text-sm font-semibold transition-colors ${
        active ? 'bg-[#e50539]/12 text-white ring-1 ring-inset ring-[#e50539]/35' : 'text-zinc-300 hover:bg-white/[0.04] hover:text-white'
      }`}
    >
      <span className="flex items-center gap-3 min-w-0">
        <span className="w-5 flex justify-center shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </span>
      {badge && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[#e50539] text-white">{badge}</span>}
    </button>
  );

  return (
    <aside
      aria-label="Sidebar"
      className={`fixed lg:sticky top-0 left-0 z-50 h-[100dvh] w-64 shrink-0 bg-[#141416] border-r border-white/[0.06] transition-transform duration-300 ease-out flex flex-col overflow-y-auto scrollbar-none ${
        isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      <div className="h-14 px-4 flex items-center justify-between border-b border-white/[0.06] shrink-0">
        <Brand onClick={() => setActiveTab('crash')} />
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"
          aria-label="Close menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="p-3 space-y-1" aria-label="Games">
        <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Games</div>
        {games.map(g => (
          <Item key={g.id} active={activeTab === g.id} icon={g.icon} label={g.name} badge={g.badge} onClick={() => setActiveTab(g.id)} />
        ))}
        <Item icon={<ShieldCheck className="w-[18px] h-[18px]" />} label="Provably fair" onClick={onOpenProvablyFair} />
      </nav>

      <div className="p-3 pt-1 space-y-1">
        <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">Wallet</div>
        <Item icon={<Plus className="w-[18px] h-[18px] text-[#5fd23b]" />} label="Deposit" onClick={() => onOpenCashier('deposit')} />
        {user && (
          <>
            <Item icon={<ArrowUpFromLine className="w-[18px] h-[18px]" />} label="Withdraw" onClick={() => onOpenCashier('withdraw')} />
            <Item icon={<Receipt className="w-[18px] h-[18px]" />} label="Transactions" onClick={() => onOpenCashier('history')} />
          </>
        )}
        <Item
          icon={muted ? <VolumeX className="w-[18px] h-[18px]" /> : <Volume2 className="w-[18px] h-[18px]" />}
          label={muted ? 'Sound off' : 'Sound on'}
          onClick={() => { const m = soundFx.toggleMute(); setMuted(m); if (!m) soundFx.playBet(); }}
        />
      </div>

      <div className="mx-3 mt-2 p-3.5 rounded-xl bg-[#1b1c1d] border border-white/[0.06]">
        <div className="flex items-center gap-2 text-white text-xs font-bold mb-1">
          <img src="/easypaisa_icon.png" alt="" className="w-5 h-5 rounded" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          Easypaisa deposits
        </div>
        <p className="text-[11px] text-zinc-400 leading-snug">Send payment, upload the receipt, and your balance is credited after manual verification.</p>
        <button
          type="button"
          onClick={() => onOpenCashier('deposit')}
          className="btn-bet-green mt-2.5 w-full py-2 rounded-lg text-xs"
        >
          Deposit
        </button>
      </div>

      <div className="mt-auto p-4 text-[11px] text-zinc-500 leading-relaxed space-y-1.5 border-t border-white/[0.06]">
        <div className="flex items-center gap-1.5 text-zinc-400 font-semibold">
          <span className="px-1.5 py-0.5 rounded border border-amber-400/40 text-amber-300 text-[10px] font-black">18+</span>
          Play responsibly
        </div>
        <p>Only bet what you can afford to lose. Take breaks.</p>
        <button type="button" onClick={onOpenProvablyFair} className="flex items-center gap-1 text-zinc-400 hover:text-white">
          <HelpCircle className="w-3.5 h-3.5" /> How fairness works
        </button>
      </div>
    </aside>
  );
}
