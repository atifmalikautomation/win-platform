import React, { useState } from 'react';
import {
  ShieldCheck, LogOut, Sliders, Bomb,
  Volume2, VolumeX, Plus, Eye, EyeOff,
  Menu, Gamepad2
} from 'lucide-react';
import { soundFx } from '../utils/soundEffects';

export default function Navbar({
  activeTab,
  setActiveTab,
  user,
  onOpenAuth,
  onLogout,
  onOpenCashier,
  onOpenProvablyFair,
  balance,
  onToggleSidebar
}) {
  const [isMuted, setIsMuted] = useState(soundFx.isMuted);
  const [hideBalance, setHideBalance] = useState(false);

  const handleToggleMute = () => {
    const muted = soundFx.toggleMute();
    setIsMuted(muted);
    if (!muted) {
      soundFx.playBet();
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-[#11141d] border-b border-[#1b212f] px-3 sm:px-6 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        
        {/* Left: Sidebar Toggle + SKYWIN Brand & Main Game Tabs */}
        <div className="flex items-center gap-3 sm:gap-6">
          
          {/* Sidebar Hamburger Toggle (Mobile & Tablet Only) */}
          <button
            onClick={onToggleSidebar}
            title="Toggle Sidebar"
            className="lg:hidden p-2 rounded-xl bg-[#0c0f17] border border-[#1a202e] text-slate-400 hover:text-white hover:border-[#2a3449] transition-colors"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* SKYWIN Authentic Brandmark */}
          <div
            onClick={() => setActiveTab('crash')}
            className="flex items-center gap-1.5 cursor-pointer select-none"
          >
            <div className="flex items-baseline font-heading font-black text-2xl tracking-tighter leading-none">
              <span className="text-white text-2xl">SKY</span>
              <span className="text-[#1a68ff] text-2xl">WIN</span>
            </div>
            <span className="text-[9px] text-[#38bdf8] font-bold uppercase tracking-wider font-heading bg-[#16223b] px-1.5 py-0.5 rounded border border-[#203254] hidden sm:inline">
              PRO
            </span>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-[#0a0c13] p-1 rounded-xl border border-[#161a26]">
            <button
              onClick={() => { setActiveTab('crash'); soundFx.playBet(); }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                activeTab === 'crash'
                  ? 'bg-[#1a68ff] text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <img src="/aviator_plane.png" alt="Aviator" className="w-4 h-3 object-contain" />
              Aviator X
            </button>

            <button
              onClick={() => { setActiveTab('mines'); soundFx.playBet(); }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                activeTab === 'mines'
                  ? 'bg-[#1a68ff] text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Bomb className="w-3.5 h-3.5 text-[#00c638]" />
              Mines
            </button>

            <button
              onClick={() => { setActiveTab('lobby'); soundFx.playBet(); }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                activeTab === 'lobby'
                  ? 'bg-[#1a68ff] text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5 text-[#38bdf8]" />
              Games Lobby
            </button>

            <button
              onClick={() => { onOpenProvablyFair(); soundFx.playBet(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-semibold text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
              Provably Fair
            </button>

            {user?.role === 'admin' && (
              <button
                onClick={() => { setActiveTab('admin'); soundFx.playBet(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-heading font-bold transition-all ${
                  activeTab === 'admin'
                    ? 'bg-[#ffb800] text-slate-950 font-black'
                    : 'text-[#ffb800] hover:bg-[#ffb800]/10'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                Admin Desk
              </button>
            )}
          </nav>
        </div>

        {/* Right: Sound, Privacy Eye, Balance Box, Deposit, User */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          
          {/* Sound Toggle */}
          <button
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            className={`p-2 rounded-xl border transition-all ${
              isMuted
                ? 'bg-[#0d1017] border-[#1c2230] text-slate-500 hover:text-slate-400'
                : 'bg-[#1a68ff]/10 border-[#1a68ff]/30 text-[#1a68ff]'
            }`}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {user ? (
            <>
              {/* Balance Box with Privacy Eye Switcher (SkyWin Exact) */}
              <div className="flex items-center gap-2 bg-[#0c0f17] border border-[#1a202e] rounded-xl px-3 py-1.5">
                <div className="flex flex-col text-right">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider font-heading leading-none">
                    PKR Balance
                  </span>
                  <span className="text-[#00c638] font-bold text-xs sm:text-sm font-mono leading-tight mt-0.5">
                    {hideBalance
                      ? 'PKR ••••••'
                      : `PKR ${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setHideBalance(!hideBalance)}
                  title={hideBalance ? 'Show Balance' : 'Hide Balance'}
                  className="p-1 rounded text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {hideBalance ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* SkyWin Solid Green Deposit Button */}
              <button
                onClick={() => onOpenCashier('deposit')}
                className="btn-bet-green flex items-center gap-1 text-slate-950 font-heading font-black text-xs sm:text-sm px-3.5 py-2 shadow-sm"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                Deposit
              </button>

              {/* User Dropdown / Profile */}
              <div className="flex items-center gap-2 pl-1.5 border-l border-[#1a202e]">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-bold text-slate-200 leading-tight font-heading">{user.username}</span>
                  <span className="text-[9px] text-slate-500 font-mono">ID: {user.id ? user.id.slice(-5) : '001'}</span>
                </div>
                <button
                  onClick={onLogout}
                  title="Logout"
                  className="p-2 rounded-xl bg-[#0c0f17] border border-[#1a202e] text-slate-400 hover:text-rose-400 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenAuth('login')}
                className="text-slate-300 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-heading font-bold transition-colors"
              >
                Log In
              </button>
              <button
                onClick={() => onOpenAuth('register')}
                className="btn-bet-green text-slate-950 font-heading font-black text-xs px-3.5 py-2 rounded-xl shadow-sm"
              >
                Registration
              </button>
            </div>
          )}

        </div>

      </div>

      {/* Mobile Navigation Bar */}
      <div className="flex md:hidden items-center justify-around pt-2 mt-2 border-t border-[#181d2a]">
        <button
          onClick={() => { setActiveTab('crash'); soundFx.playBet(); }}
          className={`flex items-center gap-1 text-xs font-heading font-bold px-3 py-1 rounded-lg ${
            activeTab === 'crash' ? 'bg-[#1a68ff] text-white' : 'text-slate-400'
          }`}
        >
          <img src="/aviator_plane.png" alt="Aviator" className="w-4 h-3 object-contain" />
          Aviator X
        </button>
        <button
          onClick={() => { setActiveTab('mines'); soundFx.playBet(); }}
          className={`flex items-center gap-1 text-xs font-heading font-bold px-3 py-1 rounded-lg ${
            activeTab === 'mines' ? 'bg-[#1a68ff] text-white' : 'text-slate-400'
          }`}
        >
          <Bomb className="w-3.5 h-3.5 text-[#00c638]" />
          Mines
        </button>
        <button
          onClick={() => { setActiveTab('lobby'); soundFx.playBet(); }}
          className={`flex items-center gap-1 text-xs font-heading font-bold px-3 py-1 rounded-lg ${
            activeTab === 'lobby' ? 'bg-[#1a68ff] text-white' : 'text-slate-400'
          }`}
        >
          <Gamepad2 className="w-3.5 h-3.5 text-[#38bdf8]" />
          Lobby
        </button>
        {user?.role === 'admin' && (
          <button
            onClick={() => { setActiveTab('admin'); soundFx.playBet(); }}
            className={`flex items-center gap-1 text-xs font-heading font-bold px-2 py-1 rounded-lg ${
              activeTab === 'admin' ? 'bg-[#ffb800] text-slate-950' : 'text-[#ffb800]'
            }`}
          >
            <Sliders className="w-3 h-3" />
            Admin
          </button>
        )}
        <button
          onClick={() => { onOpenProvablyFair(); soundFx.playBet(); }}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 font-heading"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Fair
        </button>
      </div>
    </header>
  );
}
