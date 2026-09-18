import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function ProvablyFairModal({ isOpen, onClose, currentHash, currentNonce }) {
  const [serverSeed, setServerSeed] = useState('');
  const [clientSeed, setClientSeed] = useState('LuckyWin_Public_Seed_2026');
  const [nonce, setNonce] = useState(currentNonce || 1);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleVerify = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverSeed,
          clientSeed,
          nonce: Number(nonce)
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl bg-[#0e131f] border border-slate-800 rounded-3xl p-6 lg:p-8 shadow-2xl shadow-cyan-500/10">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Title */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Provably Fair Cryptographic Check</h2>
            <p className="text-xs text-slate-400">Verify that the game outcome is 100% mathematically unaltered</p>
          </div>
        </div>

        {/* Info Box */}
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 mb-6 text-xs text-slate-300 space-y-1.5">
          <p className="font-semibold text-white">How it works on SkyWin:</p>
          <p className="text-slate-400">
            Before each round starts, the server generates a random secret key (<span className="text-cyan-400 font-mono">Server Seed</span>) and shows its SHA-256 hash. Once the round ends, the secret seed is revealed so you can test and confirm the multiplier yourself.
          </p>
          {currentHash && (
            <div className="mt-2 pt-2 border-t border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase">Current Round Public SHA-256 Hash:</span>
              <span className="text-[11px] text-cyan-300 font-mono break-all">{currentHash}</span>
            </div>
          )}
        </div>

        {/* Verification Form */}
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
              Server Seed (Revealed after round crashes)
            </label>
            <input
              type="text"
              required
              value={serverSeed}
              onChange={(e) => setServerSeed(e.target.value)}
              placeholder="Paste 64-char hex server seed"
              className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-xl px-4 py-2.5 text-xs font-mono text-white focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Client Seed
              </label>
              <input
                type="text"
                required
                value={clientSeed}
                onChange={(e) => setClientSeed(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Round Nonce
              </label>
              <input
                type="number"
                required
                value={nonce}
                onChange={(e) => setNonce(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-800 focus:border-cyan-500 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-extrabold text-sm shadow-xl shadow-cyan-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            CALCULATE & VERIFY ROUND
          </button>
        </form>

        {/* Verification Result */}
        {result && (
          <div className="mt-6 p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/40 space-y-2 animate-fadeIn">
            <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              Cryptographic Match Confirmed!
            </div>
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-xs text-slate-400">Calculated Crash Multiplier:</span>
              <span className="text-2xl font-black text-amber-400 font-mono">{result.multiplier.toFixed(2)}x</span>
            </div>
            <div className="text-[10px] text-slate-400 font-mono break-all pt-1 border-t border-cyan-900/50">
              Verified SHA-256 Hash: {result.serverSeedHash}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            {error}
          </div>
        )}

      </div>
    </div>
  );
}
