import React, { useState } from 'react';
import {
  Bomb, Zap, Play, Search,
  ShieldCheck, Dices, Flame, Trophy, Coins
} from 'lucide-react';
import { soundFx } from '../utils/soundEffects';

export default function GamesLobby({ onSelectGame }) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const games = [
    {
      id: 'crash',
      title: 'Aviator X',
      category: 'crash',
      provider: 'Spribe & SkyWin Studios',
      rtp: '97.0%',
      badge: 'TOP #1',
      badgeColor: 'bg-[#ff1a40] text-white',
      multiplier: 'Up to 10,000x',
      gradient: 'from-[#ff1a40]/30 via-[#2a0d16] to-[#12151d]',
      borderColor: 'border-[#ff1a40]/40 group-hover:border-[#ff1a40]',
      icon: <img src="/aviator_plane.png" alt="Aviator" className="w-10 h-7 object-contain filter drop-shadow" />,
      playable: true,
      description: 'Watch the red monoplane climb and cash out before it flies away!'
    },
    {
      id: 'mines',
      title: 'Mines 5x5',
      category: 'fast',
      provider: 'In-House Provably Fair',
      rtp: '98.0%',
      badge: 'POPULAR',
      badgeColor: 'bg-[#00c638] text-slate-950',
      multiplier: 'Up to 500x',
      gradient: 'from-[#00c638]/20 via-[#0e2417] to-[#12151d]',
      borderColor: 'border-[#00c638]/40 group-hover:border-[#00c638]',
      icon: <Bomb className="w-8 h-8 text-[#00c638]" />,
      playable: true,
      description: 'Uncover sparkling green diamonds while dodging hidden mine traps.'
    },
    {
      id: 'speed_cash',
      title: 'Speed & Cash',
      category: 'crash',
      provider: 'SkyWin Originals',
      rtp: '96.8%',
      badge: 'NEW',
      badgeColor: 'bg-[#1a68ff] text-white',
      multiplier: 'Dual Drag Race',
      gradient: 'from-[#1a68ff]/20 via-[#101b33] to-[#12151d]',
      borderColor: 'border-[#1a68ff]/40 group-hover:border-[#1a68ff]',
      icon: <Zap className="w-8 h-8 text-[#38bdf8]" />,
      playable: false,
      description: 'Bet on two sports cars racing through traffic with multiplier boosts.'
    },
    {
      id: 'coinflip',
      title: 'Coinflip Pro',
      category: 'fast',
      provider: 'Provably Fair',
      rtp: '98.5%',
      badge: 'FAST',
      badgeColor: 'bg-[#ffb800] text-slate-950',
      multiplier: '1.98x Instant',
      gradient: 'from-[#ffb800]/20 via-[#272110] to-[#12151d]',
      borderColor: 'border-[#ffb800]/40 group-hover:border-[#ffb800]',
      icon: <Coins className="w-8 h-8 text-[#ffb800]" />,
      playable: false,
      description: 'Simple, high-speed 50/50 provably fair cryptographic coin toss.'
    },
    {
      id: 'plinko',
      title: 'Plinko X',
      category: 'fast',
      provider: 'Smartsoft',
      rtp: '97.2%',
      badge: 'TRENDING',
      badgeColor: 'bg-purple-500 text-white',
      multiplier: 'Up to 1,000x',
      gradient: 'from-purple-600/20 via-[#22102e] to-[#12151d]',
      borderColor: 'border-purple-500/40 group-hover:border-purple-500',
      icon: <Dices className="w-8 h-8 text-purple-400" />,
      playable: false,
      description: 'Drop pins down the pyramid for explosive corner slot payouts.'
    },
    {
      id: 'roulette',
      title: 'Royal Roulette',
      category: 'live',
      provider: 'SkyWin Live Studios',
      rtp: '97.3%',
      badge: 'LIVE VIP',
      badgeColor: 'bg-emerald-500 text-slate-950',
      multiplier: '36x European',
      gradient: 'from-emerald-500/20 via-[#0e271e] to-[#12151d]',
      borderColor: 'border-emerald-500/40 group-hover:border-emerald-500',
      icon: <Trophy className="w-8 h-8 text-emerald-400" />,
      playable: false,
      description: 'High-roller European roulette wheel with live croupier feeds.'
    }
  ];

  const filteredGames = games.filter(g => {
    const matchesCategory = activeFilter === 'all' || g.category === activeFilter;
    const matchesSearch = g.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          g.provider.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categories = [
    { id: 'all', label: 'All Games', icon: <Flame className="w-3.5 h-3.5" /> },
    { id: 'crash', label: 'Crash Games', icon: <img src="/aviator_plane.png" alt="Crash" className="w-4 h-2.5 object-contain" /> },
    { id: 'fast', label: 'Quick Games', icon: <Zap className="w-3.5 h-3.5" /> },
    { id: 'live', label: 'Live & Table', icon: <Trophy className="w-3.5 h-3.5" /> }
  ];

  return (
    <div className="space-y-5">
      
      {/* Header & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#111520] p-3 sm:p-4 rounded-2xl border border-[#1b2234]">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => {
                soundFx.playBet();
                setActiveFilter(cat.id);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-heading font-bold whitespace-nowrap transition-all ${
                activeFilter === cat.id
                  ? 'bg-[#1a68ff] text-white shadow-sm'
                  : 'bg-[#161b29] text-slate-400 hover:text-white hover:bg-[#1f273b]'
              }`}
            >
              {cat.icon}
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search SkyWin games..."
            className="w-full pl-8 pr-3 py-1.5 bg-[#0a0d16] border border-[#1e2638] rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#1a68ff]"
          />
        </div>
      </div>

      {/* Games Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredGames.map((game) => (
          <div
            key={game.id}
            onClick={() => {
              if (game.playable) {
                soundFx.playBet();
                onSelectGame(game.id);
              }
            }}
            className={`group relative rounded-2xl bg-gradient-to-br ${game.gradient} border ${game.borderColor} p-5 transition-all duration-300 flex flex-col justify-between overflow-hidden shadow-lg select-none ${
              game.playable ? 'cursor-pointer hover:-translate-y-1 hover:shadow-2xl' : 'opacity-85'
            }`}
          >
            {/* Top Row: Provider + Badge */}
            <div className="flex items-center justify-between z-10">
              <span className="text-[11px] font-bold text-slate-400 font-heading uppercase tracking-wider">
                {game.provider}
              </span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md font-heading ${game.badgeColor}`}>
                {game.badge}
              </span>
            </div>

            {/* Middle Row: Icon, Title, Multiplier */}
            <div className="my-5 flex items-center gap-4 z-10">
              <div className="p-3.5 rounded-2xl bg-[#0b0e17]/80 border border-white/10 shadow-inner group-hover:scale-105 transition-transform">
                {game.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-heading font-black text-xl text-white tracking-tight leading-tight">
                  {game.title}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-mono font-bold text-[#ffb800]">
                    {game.multiplier}
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold bg-white/[0.06] px-1.5 py-0.5 rounded">
                    {game.rtp} RTP
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-300 line-clamp-2 mb-4 leading-relaxed z-10">
              {game.description}
            </p>

            {/* Bottom Action */}
            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between z-10">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-heading">
                <ShieldCheck className="w-3.5 h-3.5 text-[#00c638]" />
                <span>Provably Fair</span>
              </div>

              {game.playable ? (
                <button
                  type="button"
                  className="btn-bet-green flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-slate-950 font-heading font-black text-xs shadow-md group-hover:shadow-[#00c638]/40"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>PLAY NOW</span>
                </button>
              ) : (
                <span className="text-[11px] text-slate-400 font-heading font-bold bg-white/[0.05] px-2.5 py-1 rounded-lg">
                  Releasing Soon
                </span>
              )}
            </div>

            {/* Subtle background glow circle on hover */}
            <div className="absolute -right-8 -bottom-8 w-36 h-36 rounded-full bg-white/[0.02] group-hover:bg-white/[0.05] blur-2xl transition-all pointer-events-none" />
          </div>
        ))}
      </div>

    </div>
  );
}
