import React, { useEffect, useState } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertCircle, Loader2, Search } from 'lucide-react';
import { verifyRound, crashTier, TIER_TEXT } from '../utils/aviatorFair';

// Aviator round verification. Uses only public data (GET /api/crash/live, GET /api/crash/verify/:roundId)
// and recomputes everything locally with WebCrypto.
export default function ProvablyFairModal({ isOpen, onClose }) {
  const [recent, setRecent] = useState([]);
  const [rtp, setRtp] = useState(null);
  const [currentHash, setCurrentHash] = useState('');
  const [roundInput, setRoundInput] = useState('');
  const [round, setRound] = useState(null);
  const [check, setCheck] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return undefined;
    let alive = true;
    setError('');
    setLoadingList(true);
    fetch(`/api/crash/live?_t=${Date.now()}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(d => {
        if (!alive) return;
        setRecent((d.history || []).slice(0, 12));
        if (typeof d.rtp === 'number') setRtp(d.rtp);
        setCurrentHash(d.hash || '');
      })
      .catch(() => alive && setError('Could not load recent rounds. Check your connection.'))
      .finally(() => alive && setLoadingList(false));
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { alive = false; window.removeEventListener('keydown', onKey); };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const edge = typeof rtp === 'number' ? 100 - rtp : 3;

  const verify = async (entry) => {
    setLoading(true);
    setError('');
    setCheck(null);
    try {
      let r = entry;
      if (!r) {
        const id = Number(roundInput);
        if (!Number.isInteger(id) || id <= 0) throw new Error('Enter a valid round number');
        const res = await fetch(`/api/crash/verify/${id}`, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Round not found');
        r = data;
      }
      setRound(r);
      setRoundInput(String(r.roundId));
      setCheck(await verifyRound({ seed: r.seed, hash: r.hash, edge, crashAt: r.crashAt, voided: r.voided }));
    } catch (e) {
      setError(e.message);
      setRound(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4 bg-black/75 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pf-title"
        onClick={(e) => e.stopPropagation()}
        className="animate-sheet relative w-full sm:max-w-xl bg-[#1b1c1d] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-white/5">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4 pr-8">
          <div className="w-10 h-10 rounded-xl bg-[#28a909]/15 border border-[#28a909]/30 flex items-center justify-center text-[#5fd23b]">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 id="pf-title" className="text-lg font-extrabold text-white font-heading">Provably fair</h2>
            <p className="text-xs text-zinc-400">Check any finished Aviator round yourself</p>
          </div>
        </div>

        <div className="rounded-xl bg-[#141516] border border-white/[0.06] p-3.5 text-xs text-zinc-400 space-y-2 leading-relaxed">
          <p>
            Every round has a secret <span className="text-white font-semibold">seed</span>. Its SHA-256
            <span className="text-white font-semibold"> hash</span> is published before take-off, so the result can’t be changed later.
            After the crash the seed is revealed and anyone can recompute the crash point:
          </p>
          <code className="block text-[11px] text-zinc-300 break-words">
            r = int(HMAC_SHA256(seed, "skywin-aviator-crash")[0:13], 16) / 2^52<br />
            crash = floor(((100 − edge) / 100) / (1 − r) × 100) / 100
          </code>
          {typeof rtp === 'number' && <p>Current RTP: <span className="text-white font-semibold tabular-nums">{rtp}%</span> (house edge {edge}%).</p>}
          {currentHash && (
            <div className="pt-2 border-t border-white/[0.06]">
              <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold block">Current round hash</span>
              <code className="text-[11px] text-zinc-300 break-all select-text">{currentHash}</code>
            </div>
          )}
        </div>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => { e.preventDefault(); verify(null); }}
        >
          <input
            type="text"
            inputMode="numeric"
            value={roundInput}
            onChange={(e) => setRoundInput(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="Round number, e.g. 1234"
            aria-label="Round number"
            className="flex-1 min-w-0 bg-[#141516] border border-white/10 focus:border-[#e50539] rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none tabular-nums"
          />
          <button type="submit" disabled={loading} className="btn-primary px-4 text-sm flex items-center gap-1.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Verify
          </button>
        </form>

        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1.5">Recent rounds</div>
          {loadingList ? (
            <div className="flex gap-1.5">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="w-14 h-6 rounded-full bg-white/[0.05] animate-pulse" />)}</div>
          ) : recent.length === 0 ? (
            <p className="text-xs text-zinc-500">No finished rounds yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {recent.map(h => (
                <button
                  key={h.roundId}
                  type="button"
                  onClick={() => verify(h)}
                  className={`px-2.5 py-1 rounded-full bg-black/45 border border-white/[0.06] text-xs font-bold tabular-nums hover:bg-black/70 ${TIER_TEXT[crashTier(h)]}`}
                  title={`Round #${h.roundId}`}
                >
                  {h.voided ? 'VOID' : `${Number(h.crashAt).toFixed(2)}x`}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-[#e50539]/10 border border-[#e50539]/30 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {round && check && (
          <div className="mt-4 rounded-xl border border-white/10 p-3.5 space-y-2 text-xs">
            <div className="flex items-baseline justify-between">
              <span className="text-zinc-400">Round #{round.roundId}</span>
              <span className={`text-2xl font-extrabold tabular-nums ${TIER_TEXT[crashTier(round)]}`}>
                {round.voided ? 'Voided' : `${Number(round.crashAt).toFixed(2)}x`}
              </span>
            </div>
            <div className="flex items-start gap-1.5">
              {check.hashOk ? <CheckCircle2 className="w-4 h-4 text-[#5fd23b] shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
              <span className="text-zinc-200">sha256(seed) {check.hashOk ? 'matches' : 'does NOT match'} the published hash</span>
            </div>
            {!round.voided && (
              <div className="flex items-start gap-1.5">
                {check.crashOk ? <CheckCircle2 className="w-4 h-4 text-[#5fd23b] shrink-0" /> : <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />}
                <span className="text-zinc-200">
                  Recomputed crash: <b className="tabular-nums">{check.computedCrash.toFixed(2)}x</b>
                  {check.crashOk ? ' — matches' : ` (with ${edge}% edge; differs if the edge was changed for that round)`}
                </span>
              </div>
            )}
            {round.voided && <p className="text-zinc-400">This round was stopped by the operator and every open bet was refunded.</p>}
            <div className="pt-2 border-t border-white/[0.06] space-y-1 font-mono text-[11px] break-all select-text">
              <div><span className="text-zinc-500">hash: </span><span className="text-zinc-300">{round.hash}</span></div>
              <div><span className="text-zinc-500">seed: </span><span className="text-[#5fd23b]">{round.seed}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
