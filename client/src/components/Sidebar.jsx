import React from 'react';
import {
  Bomb, ShieldCheck, Gift,
  X, Sliders, Gamepad2
} from 'lucide-react';
import { soundFx } from '../utils/soundEffects';

export default function Sidebar({
  isOpen,
  setIsOpen,
  activeTab,
  setActiveTab,
  onOpenCashier,
  onOpenProvablyFair,
  user
}) {
  const menuItems = [
    {
      id: 'crash',
      name: 'Aviator X',
      badge: 'HOT',
      badgeColor: 'bg-[#ff1a40] text-white',
      icon: (
        <img
          src="/aviator_plane.png"
          alt="Aviator X"
          className="w-5 h-3.5 object-contain filter drop-shadow"
        />
      )
    },
    {
      id: 'mines',
      name: 'Mines 5x5',
      badge: 'POPULAR',
      badgeColor: 'bg-[#00c638] text-slate-950',
      icon: <Bomb className="w-4 h-4 text-[#00c638]" />
    },
    {
      id: 'lobby',
      name: 'Games Lobby',
      badge: null,
      icon: <Gamepad2 className="w-4 h-4 text-[#1a68ff]" />
    },
    {
      id: 'fair',
      name: 'Provably Fair',
      badge: 'VERIFIED',
      badgeColor: 'bg-[#1a68ff]/20 text-[#38bdf8]',
      icon: <ShieldCheck className="w-4 h-4 text-[#38bdf8]" />,
      action: onOpenProvablyFair
    }
  ];

  if (user?.role === 'admin') {
    menuItems.push({
      id: 'admin',
      name: 'Admin Desk',
      badge: 'RISK',
      badgeColor: 'bg-[#ffb800] text-slate-950',
      icon: <Sliders className="w-4 h-4 text-[#ffb800]" />
    });
  }

  return (
    <aside
      className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 shrink-0 bg-[#0d1017] border-r border-[#1a202d] shadow-2xl lg:shadow-none transition-transform duration-300 ease-in-out flex flex-col justify-between select-none overflow-y-auto scrollbar-none ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      {/* Top Branding & Mobile Close Button */}
      <div>
        <div className="h-14 px-4 flex items-center justify-between border-b border-[#181d28]">
          <div
            onClick={() => setActiveTab('crash')}
            className="flex items-center gap-2 cursor-pointer"
          >
            <div className="flex items-baseline font-heading font-black text-2xl tracking-tighter leading-none">
              <span className="text-white text-2xl">SKY</span>
              <span className="text-[#1a68ff] text-2xl">WIN</span>
            </div>
            <span className="text-[9px] text-[#00ff88] font-black uppercase tracking-wider font-heading bg-[#00ff88]/10 border border-[#00ff88]/30 px-1.5 py-0.5 rounded">
              PRO
            </span>
          </div>

          {/* Close button ONLY on mobile; on desktop sidebar remains permanently open */}
          <button
            onClick={() => setIsOpen(false)}
            className="lg:hidden p-1.5 rounded-lg bg-[#141824] hover:bg-[#1a202f] text-slate-400 hover:text-white transition-colors"
            title="Close Menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Featured Aviator Promo Tag */}
        <div
          onClick={() => setActiveTab('crash')}
          className="mx-3 mt-3 p-2.5 rounded-xl bg-gradient-to-r from-[#e60026]/15 via-[#230d14] to-[#121622] border border-[#ff1a40]/30 flex items-center justify-between cursor-pointer hover:border-[#ff1a40] transition-colors group"
        >
          <div className="flex items-center gap-2.5">
            <img
              src="/aviator_plane.png"
              alt="Aviator"
              className="w-7 h-5 object-contain group-hover:scale-110 transition-transform"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-heading font-black text-xs text-white">AVIATOR X</span>
                <span className="text-[8px] bg-[#ff1a40] text-white px-1 py-0.2 rounded font-black">97%</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Live Multiplier</span>
            </div>
          </div>
          <div className="w-2 h-2 rounded-full bg-[#00c638] animate-ping" />
        </div>

        {/* Navigation Categories */}
        <div className="p-3 space-y-1">
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 font-heading">
            Main Games
          </div>

          {menuItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  soundFx.playBet();
                  if (item.action) {
                    item.action();
                  } else {
                    setActiveTab(item.id);
                  }
                }}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-heading font-bold transition-all ${
                  isActive
                    ? 'bg-[#1a68ff] text-white shadow-sm'
                    : 'text-slate-300 hover:bg-[#141824] hover:text-white'
                }`}
                title={item.name}
              >
                <div className="flex items-center gap-3">
                  <div className="shrink-0">{item.icon}</div>
                  <span className="truncate">{item.name}</span>
                </div>

                {item.badge && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded font-heading ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* SkyWin +500% Deposit Promo Banner */}
        <div className="mx-3 mt-2 p-3.5 rounded-2xl bg-gradient-to-b from-[#1a233b] to-[#101625] border border-[#233150] shadow-sm text-left">
          <div className="flex items-center gap-2 text-[#ffb800] text-xs font-black font-heading mb-1">
            <Gift className="w-4 h-4" />
            <span>+500% BONUS</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-tight">
            Get up to <strong className="text-white">PKR 150,000</strong> on your first deposits!
          </p>
          <button
            onClick={() => onOpenCashier('deposit')}
            className="mt-2.5 w-full py-2 rounded-xl bg-[#00c638] hover:bg-[#00db3e] text-slate-950 font-heading font-black text-xs transition-colors shadow-sm"
          >
            Deposit Now
          </button>
        </div>
      </div>

      {/* Bottom Status / Support */}
      <div className="p-3 border-t border-[#181d28]">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#00c638] animate-pulse" />
            <span className="text-[11px] font-semibold text-slate-300">Server Online</span>
          </div>
          <span className="text-[10px] text-slate-500 font-mono">v3.4 PRO</span>
        </div>
      </div>
    </aside>
  );
}
