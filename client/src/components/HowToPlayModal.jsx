import React from 'react';
import { X, Flame } from 'lucide-react';

export default function HowToPlayModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-[#12151e] border border-[#1e2536] rounded-2xl p-5 sm:p-7 shadow-2xl">
        
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#1a202f] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#1a68ff]/15 border border-[#1a68ff]/30 flex items-center justify-center text-[#1a68ff]">
            <Flame className="w-5 h-5 text-[#ff9800]" />
          </div>
          <div>
            <h2 className="text-lg font-black text-white font-heading">How to Play Aviator X?</h2>
            <p className="text-xs text-slate-400">Official rules & flight mechanics</p>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3.5 text-xs text-slate-300">
          <div className="p-3.5 rounded-xl bg-[#0b0e15] border border-[#181d2a] flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-[#1a68ff] text-white flex items-center justify-center font-bold font-heading shrink-0 text-xs mt-0.5">
              1
            </div>
            <div>
              <h3 className="font-bold text-white font-heading text-sm mb-0.5">Place Your Bet</h3>
              <p className="text-slate-400 leading-relaxed">
                Choose your bet amount before the red monoplane takes off. You can place <strong className="text-white">two bets simultaneously</strong> using Bet Console 1 and 2!
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0b0e15] border border-[#181d2a] flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-[#ffb800] text-slate-950 flex items-center justify-center font-black font-heading shrink-0 text-xs mt-0.5">
              2
            </div>
            <div>
              <h3 className="font-bold text-white font-heading text-sm mb-0.5">Watch Multiplier Grow</h3>
              <p className="text-slate-400 leading-relaxed">
                As the Aviator climbs along the red flight curve, the multiplier continuously increases from <span className="font-mono text-cyan-400 font-bold">1.00x</span> up to <span className="font-mono text-amber-400 font-bold">100.00x+</span>.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0b0e15] border border-[#181d2a] flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-[#00c638] text-slate-950 flex items-center justify-center font-black font-heading shrink-0 text-xs mt-0.5">
              3
            </div>
            <div>
              <h3 className="font-bold text-white font-heading text-sm mb-0.5">Cash Out Before It Flew Away!</h3>
              <p className="text-slate-400 leading-relaxed">
                Click <strong className="text-[#ffb800]">CASH OUT</strong> at any moment to lock in your winnings. If the airplane flies away before you cash out, the round is lost.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#0b0e15] border border-[#181d2a] flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-[#9d4edd] text-white flex items-center justify-center font-bold font-heading shrink-0 text-xs mt-0.5">
              4
            </div>
            <div>
              <h3 className="font-bold text-white font-heading text-sm mb-0.5">Provably Fair Algorithm</h3>
              <p className="text-slate-400 leading-relaxed">
                Every round outcome is pre-determined using cryptographic SHA-256 HMAC algorithms. The result is 100% fair and mathematically verifiable by anyone.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="btn-bet-green w-full py-3 rounded-xl font-heading font-black text-xs tracking-wider uppercase mt-5"
        >
          Got It, Let's Play!
        </button>

      </div>
    </div>
  );
}
