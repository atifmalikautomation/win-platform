import React, { useEffect } from 'react';
import { X } from 'lucide-react';

const STEPS = [
  {
    title: 'Place a bet',
    text: 'Enter an amount (or tap a quick chip) and press BET before take-off. You can use both panels to play two bets in the same round. If the round is already flying, your bet is queued for the next round — press CANCEL to remove it.'
  },
  {
    title: 'Watch the plane climb',
    text: 'When the plane takes off the multiplier starts at 1.00x and grows. Your possible win (bet × multiplier) is shown live on the CASH OUT button.'
  },
  {
    title: 'Cash out in time',
    text: 'Press CASH OUT before the plane flies away to win bet × multiplier. If it flies away first, the bet is lost. Turn on Auto cash out (Auto tab) and the server will cash out for you at your target — even if you close the tab.'
  },
  {
    title: 'Provably fair',
    text: 'Each round’s SHA-256 hash is shown before take-off and its seed is revealed after the crash. Tap any result in the history bar to verify it yourself in the browser.'
  }
];

export default function HowToPlayModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="htp-title"
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet relative w-full sm:max-w-lg bg-[#1b1c1d] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5 pr-8">
          <img src="/aviator_plane.png" alt="" className="w-12 h-auto" />
          <div>
            <h2 id="htp-title" className="text-lg font-extrabold text-white font-heading">How to play Aviator</h2>
            <p className="text-xs text-zinc-400">Rules in 30 seconds</p>
          </div>
        </div>

        <ol className="space-y-2.5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="p-3.5 rounded-xl bg-[#141516] border border-white/[0.06] flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[#e50539] text-white flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">{i + 1}</span>
              <div>
                <h3 className="font-bold text-white font-heading text-sm mb-0.5">{s.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-4 text-[11px] text-zinc-500 leading-relaxed">
          18+ only. Play with money you can afford to lose. Results are random — no strategy guarantees a win.
        </p>

        <button onClick={onClose} className="btn-primary w-full py-3 mt-4 text-sm tracking-wide uppercase">
          Got it
        </button>
      </div>
    </div>
  );
}
