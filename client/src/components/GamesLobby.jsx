import React from 'react';
import { Play, ShieldCheck, Dices, Coins, Trophy, Triangle, Clock } from 'lucide-react';

// Only Aviator is playable. Other titles are shown as "Coming soon" without any made-up stats.
const GAMES = [
  {
    id: 'crash',
    title: 'Aviator',
    tag: 'Crash',
    playable: true,
    description: 'Bet before take-off and cash out before the plane flies away. Two bets per round, auto cash-out, provably fair.',
    art: <img src="/aviator_plane.png" alt="" className="w-28 sm:w-32 h-auto drop-shadow-[0_10px_25px_rgba(229,5,57,0.45)]" />
  },
  { id: 'plinko', title: 'Plinko', tag: 'Instant', playable: false, description: 'Drop the ball and watch where it lands.', art: <Triangle className="w-12 h-12 text-violet-400" /> },
  { id: 'dice', title: 'Dice', tag: 'Instant', playable: false, description: 'Pick your target and roll.', art: <Dices className="w-12 h-12 text-sky-400" /> },
  { id: 'coinflip', title: 'Coin Flip', tag: 'Instant', playable: false, description: 'Heads or tails — simple and quick.', art: <Coins className="w-12 h-12 text-amber-400" /> },
  { id: 'roulette', title: 'Roulette', tag: 'Table', playable: false, description: 'Classic European wheel.', art: <Trophy className="w-12 h-12 text-emerald-400" /> }
];

export default function GamesLobby({ onSelectGame }) {
  const [featured, ...rest] = GAMES;
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Featured: Aviator */}
      <button
        type="button"
        onClick={() => onSelectGame(featured.id)}
        className="group relative w-full text-left overflow-hidden rounded-2xl border border-[#e50539]/30 hover:border-[#e50539]/70 bg-[#1b1c1d] transition-colors"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(229,5,57,0.28),transparent_60%)]" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 p-5 sm:p-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-[#e50539] text-white">LIVE</span>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">{featured.tag}</span>
            </div>
            <h3 className="font-heading font-black text-2xl sm:text-3xl text-white tracking-tight">{featured.title}</h3>
            <p className="text-sm text-zinc-400 mt-1.5 max-w-lg">{featured.description}</p>
            <div className="mt-4 flex items-center gap-3">
              <span className="btn-bet-green inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm">
                <Play className="w-4 h-4 fill-current" /> Play now
              </span>
              <span className="flex items-center gap-1.5 text-xs text-zinc-400">
                <ShieldCheck className="w-4 h-4 text-[#5fd23b]" /> Provably fair
              </span>
            </div>
          </div>
          <div className="shrink-0 self-center sm:pr-4 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform duration-300">
            {featured.art}
          </div>
        </div>
      </button>

      {/* Coming soon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        {rest.map(g => (
          <div
            key={g.id}
            className="relative rounded-2xl bg-[#1b1c1d] border border-white/[0.06] p-4 flex flex-col"
            aria-disabled="true"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{g.tag}</span>
              <span className="flex items-center gap-1 text-[10px] font-bold text-zinc-300 bg-white/[0.06] px-1.5 py-0.5 rounded">
                <Clock className="w-3 h-3" /> Soon
              </span>
            </div>
            <div className="my-4 flex justify-center opacity-70">{g.art}</div>
            <h3 className="font-heading font-extrabold text-white text-base">{g.title}</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5 line-clamp-2">{g.description}</p>
            <span className="mt-3 text-[11px] font-semibold text-zinc-500">Coming soon</span>
          </div>
        ))}
      </div>
    </div>
  );
}
