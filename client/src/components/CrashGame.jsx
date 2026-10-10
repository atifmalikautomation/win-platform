import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Shield, Trophy, Minus, Plus, HelpCircle, X, Users, PauseCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import { soundFx } from '../utils/soundEffects';
import HowToPlayModal from './HowToPlayModal';

// Must match server/aviatorEngine.js
const DEFAULT_GROWTH = 0.09;
const multiplierAt = (elapsedMs, growth = DEFAULT_GROWTH) =>
  elapsedMs <= 0 ? 1 : Math.floor(Math.exp(growth * elapsedMs / 1000) * 100) / 100;

const token = () => localStorage.getItem('luckywin_token');

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const emptyPanel = (amount) => ({
  amount,
  autoEnabled: false,
  autoValue: 2.0,
  bet: null,       // { id, amount, roundId, autoCashout }
  result: null,    // { type: 'won' | 'lost' | 'refunded', payout, multiplier }
  busy: false
});

export default function CrashGame({ user, balance, onBalanceUpdate, onOpenAuth }) {
  // ---------- live round (from server) ----------
  const liveRef = useRef(null);
  const offsetRef = useRef(0);          // serverTime - clientTime
  const bestRttRef = useRef(Infinity);
  const [view, setView] = useState({ state: 'LOADING', roundId: null, countdown: 0, multiplier: 1, crashAt: null, voided: false, paused: false });
  const [history, setHistory] = useState([]);
  const [roundBets, setRoundBets] = useState([]);
  const [myBets, setMyBets] = useState([]);
  const [rtp, setRtp] = useState(97);
  const [roundHash, setRoundHash] = useState('');
  const [selectedRound, setSelectedRound] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [toast, setToast] = useState(null);
  const [connection, setConnection] = useState('ok');

  const [p1, setP1] = useState(() => emptyPanel(100));
  const [p2, setP2] = useState(() => emptyPanel(200));
  const panelsRef = useRef({ 1: p1, 2: p2 });
  useEffect(() => { panelsRef.current = { 1: p1, 2: p2 }; }, [p1, p2]);
  const setPanel = useCallback((n, updater) => (n === 1 ? setP1 : setP2)(updater), []);
  const autoFiredRef = useRef({ 1: null, 2: null });

  const multTextRef = useRef(null);
  const canvasRef = useRef(null);
  const displayRef = useRef({ state: 'LOADING', mult: 1, elapsed: 0, crashedAt: 0 });

  const onBalanceRef = useRef(onBalanceUpdate);
  useEffect(() => { onBalanceRef.current = onBalanceUpdate; }, [onBalanceUpdate]);
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  const showToast = useCallback((text, type = 'info') => {
    setToast({ text, type, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const serverNow = () => Date.now() + offsetRef.current;

  // ---------- settle / refresh my bets ----------
  const refreshMyBets = useCallback(async () => {
    if (!userRef.current || !token()) return;
    try {
      const data = await api('GET', `/api/crash/my-bets?_t=${Date.now()}`);
      setMyBets(data.bets || []);
      if (typeof data.balance === 'number') onBalanceRef.current(data.balance);
      // Reflect server settlement in the panels
      [1, 2].forEach(n => {
        const panel = panelsRef.current[n];
        if (!panel.bet) return;
        const b = (data.bets || []).find(x => x.id === panel.bet.id);
        if (!b || b.status === 'placed') return;
        const type = b.status === 'won' ? 'won' : b.status === 'refunded' ? 'refunded' : b.status === 'cancelled' ? null : 'lost';
        setPanel(n, prev => (prev.bet && prev.bet.id === b.id
          ? { ...prev, result: type ? { type, payout: b.payout || 0, multiplier: b.multiplier || 0 } : null, bet: type ? prev.bet : null }
          : prev));
      });
    } catch (e) {
      if (e.status === 401) showToast('Session expired — please log in again', 'error');
    }
  }, [setPanel, showToast]);

  // ---------- polling the global round ----------
  useEffect(() => {
    let alive = true;
    let timer = null;
    let lastRoundId = null;
    let lastState = null;

    const poll = async () => {
      const t0 = Date.now();
      try {
        const res = await fetch(`/api/crash/live?_t=${t0}`, { cache: 'no-store' });
        const data = await res.json();
        const t1 = Date.now();
        if (!alive || !data || !data.serverTime) return;
        // Clock sync: trust the sample with the smallest round-trip.
        const rtt = t1 - t0;
        const sampleOffset = data.serverTime - (t0 + t1) / 2;
        if (rtt <= bestRttRef.current * 1.5 || Math.abs(sampleOffset - offsetRef.current) > 1500) {
          bestRttRef.current = Math.min(bestRttRef.current, rtt);
          offsetRef.current = sampleOffset;
        }
        liveRef.current = data;
        setConnection('ok');
        setHistory(data.history || []);
        setRoundBets(data.bets || []);
        if (data.rtp) setRtp(data.rtp);
        if (data.hash) setRoundHash(data.hash);

        // New round started -> clear finished panels
        if (data.roundId !== lastRoundId) {
          lastRoundId = data.roundId;
          autoFiredRef.current = { 1: null, 2: null };
          [1, 2].forEach(n => setPanel(n, prev => (prev.bet && prev.bet.roundId !== data.roundId && prev.result
            ? { ...prev, bet: null, result: null }
            : prev)));
        }
        // Round just finished -> let the server settle, refresh balance
        if (data.state === 'CRASHED' && lastState !== 'CRASHED') {
          setTimeout(refreshMyBets, 400);
        }
        lastState = data.state;
      } catch (e) {
        if (alive) setConnection('lost');
      } finally {
        if (!alive) return;
        const d = liveRef.current;
        let wait = 1000;
        if (d) {
          const now = serverNow();
          if (d.state === 'FLYING' || (d.state === 'WAITING' && now >= d.flightStart - 400)) wait = 300;
          else if (d.state === 'WAITING') wait = Math.min(1000, Math.max(200, d.flightStart - now - 300));
          else if (d.state === 'CRASHED' && d.nextRoundAt) wait = Math.max(200, Math.min(1500, d.nextRoundAt - now + 50));
        }
        timer = setTimeout(poll, wait);
      }
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [refreshMyBets, setPanel]);

  useEffect(() => { refreshMyBets(); }, [user?.id, refreshMyBets]);

  // ---------- cashout ----------
  const doCashout = useCallback(async (n, requested) => {
    const panel = panelsRef.current[n];
    if (!panel.bet || panel.result || panel.busy) return;
    setPanel(n, prev => ({ ...prev, busy: true }));
    try {
      const data = await api('POST', '/api/crash/cashout', { betId: panel.bet.id, multiplier: requested || undefined });
      setPanel(n, prev => ({ ...prev, busy: false, result: { type: 'won', payout: data.payout, multiplier: data.multiplier } }));
      onBalanceRef.current(data.newBalance);
      soundFx.playCashout();
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 } });
    } catch (e) {
      setPanel(n, prev => ({ ...prev, busy: false }));
      showToast(e.message, 'error');
      setTimeout(refreshMyBets, 500);
    }
  }, [setPanel, showToast, refreshMyBets]);

  // ---------- 60fps render loop (number + canvas) ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.parentElement.clientWidth;
      h = canvas.parentElement.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    window.addEventListener('resize', resize);

    const plane = new Image();
    plane.src = '/aviator_plane.png';
    let lastUiUpdate = 0;
    let lastTickSec = null;
    let flewAway = { x: 0, y: 0, vx: 0 };
    let prevState = null;
    let rayAngle = 0;

    const frame = () => {
      const d = liveRef.current;
      const now = serverNow();
      let state = 'LOADING';
      let mult = 1;
      let elapsed = 0;
      let countdown = 0;
      if (d) {
        if (d.state === 'PAUSED') state = 'PAUSED';
        else if (d.state === 'CRASHED') { state = 'CRASHED'; mult = d.crashAt; elapsed = d.crashTime - d.flightStart; }
        else if (now < d.flightStart) { state = 'WAITING'; countdown = Math.max(0, (d.flightStart - now) / 1000); }
        else { state = 'FLYING'; elapsed = now - d.flightStart; mult = multiplierAt(elapsed, d.growth); }
      }
      displayRef.current = { state, mult, elapsed };

      // sounds on transitions
      if (state !== prevState) {
        if (state === 'FLYING') soundFx.playFlightSound();
        if (prevState === 'FLYING' && state === 'CRASHED') { soundFx.stopFlightSound(); soundFx.playCrash(); }
        if (state !== 'FLYING') soundFx.stopFlightSound();
        prevState = state;
      }
      if (state === 'WAITING') {
        const sec = Math.ceil(countdown);
        if (sec !== lastTickSec && sec <= 3 && sec >= 1) soundFx.playCountdownTick();
        lastTickSec = sec;
      }

      // big number: direct DOM write every frame (no React re-render)
      if (multTextRef.current && (state === 'FLYING' || state === 'CRASHED')) {
        multTextRef.current.textContent = `${mult.toFixed(2)}x`;
      }

      // client-side auto cash-out (server settles it too, even if this tab is closed)
      if (state === 'FLYING') {
        [1, 2].forEach(n => {
          const p = panelsRef.current[n];
          if (p.bet && !p.result && p.bet.roundId === d.roundId && p.bet.autoCashout && mult >= p.bet.autoCashout && autoFiredRef.current[n] !== p.bet.id) {
            autoFiredRef.current[n] = p.bet.id;
            doCashout(n, p.bet.autoCashout);
          }
        });
      }

      // React UI ~10fps
      if (performance.now() - lastUiUpdate > 100) {
        lastUiUpdate = performance.now();
        setView({
          state,
          roundId: d?.roundId ?? null,
          countdown,
          multiplier: mult,
          crashAt: state === 'CRASHED' ? d.crashAt : null,
          voided: state === 'CRASHED' ? !!d.voided : false,
          paused: state === 'PAUSED'
        });
      }

      // ---------------- canvas ----------------
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const bg = ctx.createRadialGradient(0, h, 10, 0, h, Math.max(w, h) * 1.2);
      bg.addColorStop(0, '#1a0a12');
      bg.addColorStop(1, '#07060a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // rotating sun rays (classic Aviator backdrop)
      rayAngle += state === 'FLYING' ? 0.0025 : 0.0008;
      ctx.save();
      ctx.translate(0, h);
      ctx.rotate(rayAngle);
      for (let i = 0; i < 24; i++) {
        ctx.rotate((Math.PI * 2) / 24);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.max(w, h) * 1.6, -40);
        ctx.lineTo(Math.max(w, h) * 1.6, 40);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.018)' : 'rgba(255,255,255,0.0)';
        ctx.fill();
      }
      ctx.restore();

      const left = 24;
      const bottom = h - 28;
      const maxX = w * (w < 640 ? 0.72 : 0.78);
      const maxY = h * 0.22;

      // axis
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, bottom);
      ctx.lineTo(w - 10, bottom);
      ctx.moveTo(left, bottom);
      ctx.lineTo(left, 10);
      ctx.stroke();

      if (state === 'FLYING' || state === 'CRASHED') {
        const sec = elapsed / 1000;
        const px = left + (maxX - left) * (1 - Math.exp(-sec / 3.2));
        const py = bottom - (bottom - maxY) * (1 - Math.exp(-sec / 4.2));
        const bob = state === 'FLYING' && sec > 6 ? Math.sin(performance.now() / 380) * 6 : 0;
        const planeX = px;
        const planeY = py + bob;

        // curve + fill
        const cx = left + (planeX - left) * 0.55;
        ctx.beginPath();
        ctx.moveTo(left, bottom);
        ctx.quadraticCurveTo(cx, bottom, planeX, planeY);
        ctx.lineTo(planeX, bottom);
        ctx.closePath();
        const fill = ctx.createLinearGradient(0, planeY, 0, bottom);
        fill.addColorStop(0, state === 'CRASHED' ? 'rgba(120,120,120,0.15)' : 'rgba(230,0,38,0.35)');
        fill.addColorStop(1, 'rgba(230,0,38,0.02)');
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(left, bottom);
        ctx.quadraticCurveTo(cx, bottom, planeX, planeY);
        ctx.strokeStyle = state === 'CRASHED' ? 'rgba(160,160,160,0.6)' : '#e60026';
        ctx.lineWidth = 4;
        ctx.stroke();

        // plane
        let drawX = planeX;
        let drawY = planeY;
        if (state === 'CRASHED') {
          if (flewAway.vx === 0) flewAway = { x: planeX, y: planeY, vx: 4 };
          flewAway.vx *= 1.09;
          flewAway.x += flewAway.vx;
          flewAway.y -= flewAway.vx * 0.35;
          drawX = flewAway.x;
          drawY = flewAway.y;
        } else {
          flewAway = { x: 0, y: 0, vx: 0 };
        }
        if (drawX < w + 120 && plane.complete && plane.naturalWidth) {
          const pw = w < 640 ? 70 : 96;
          const ph = pw * (plane.naturalHeight / plane.naturalWidth);
          ctx.save();
          ctx.translate(drawX, drawY);
          ctx.rotate(state === 'CRASHED' ? -0.25 : -0.08);
          ctx.drawImage(plane, -pw * 0.35, -ph * 0.75, pw, ph);
          ctx.restore();
        }
      } else {
        flewAway = { x: 0, y: 0, vx: 0 };
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      soundFx.stopFlightSound();
    };
  }, [doCashout]);

  // ---------- actions ----------
  const placeBet = async (n) => {
    if (!user) return onOpenAuth('login');
    const panel = panelsRef.current[n];
    const amount = Math.floor(Number(panel.amount) || 0);
    if (amount < 10) return showToast('Minimum bet is PKR 10', 'error');
    if (amount > balance) return showToast('Insufficient balance — please deposit', 'error');
    let auto = null;
    if (panel.autoEnabled) {
      auto = Math.round(Number(panel.autoValue) * 100) / 100;
      if (!(auto >= 1.01)) return showToast('Auto cash out must be at least 1.01x', 'error');
    }
    setPanel(n, prev => ({ ...prev, busy: true, result: null }));
    soundFx.playBet();
    try {
      const data = await api('POST', '/api/crash/bet', { amount, autoCashout: auto });
      setPanel(n, prev => ({
        ...prev,
        busy: false,
        bet: { id: data.bet.id, amount: data.bet.betAmount, roundId: data.bet.roundId, autoCashout: data.bet.autoCashout },
        result: null
      }));
      onBalanceRef.current(data.newBalance);
    } catch (e) {
      setPanel(n, prev => ({ ...prev, busy: false }));
      showToast(e.message, 'error');
    }
  };

  const cancelBet = async (n) => {
    const panel = panelsRef.current[n];
    if (!panel.bet || panel.busy) return;
    setPanel(n, prev => ({ ...prev, busy: true }));
    try {
      const data = await api('POST', '/api/crash/cancel-bet', { betId: panel.bet.id });
      setPanel(n, prev => ({ ...prev, busy: false, bet: null, result: null }));
      onBalanceRef.current(data.newBalance);
      soundFx.playBet();
    } catch (e) {
      setPanel(n, prev => ({ ...prev, busy: false }));
      showToast(e.message, 'error');
    }
  };

  const maskName = (name) => name || 'player';
  const pillClass = (h) => {
    if (h.voided) return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
    if (h.crashAt >= 10) return 'bg-[#c017b4]/15 text-[#ff4fe6] border-[#c017b4]/35';
    if (h.crashAt >= 2) return 'bg-[#913ef8]/15 text-[#b77aff] border-[#913ef8]/35';
    return 'bg-[#34b4ff]/10 text-[#5ec4ff] border-[#34b4ff]/25';
  };

  const listBets = activeTab === 'my'
    ? myBets.map(b => ({ id: b.id, username: 'You', amount: b.betAmount, status: b.status, multiplier: b.multiplier, payout: b.payout, roundId: b.roundId }))
    : activeTab === 'top'
      ? [...roundBets].filter(b => b.status === 'won').sort((a, b) => (b.payout || 0) - (a.payout || 0))
      : roundBets;

  const totalWagered = roundBets.reduce((s, b) => s + (b.amount || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 space-y-2.5">
      {/* Header ribbon */}
      <div className="flex items-center justify-between gap-3 bg-[#12151d] px-3 py-2 rounded-xl border border-[#1b212f]">
        <div className="flex items-center gap-2 select-none shrink-0">
          <img src="/aviator_plane.png" alt="Aviator" className="h-7 w-auto object-contain" />
          <img src="/aviator_wordmark.png" alt="Aviator" className="h-5 sm:h-6 w-auto object-contain" />
          <span className="hidden sm:inline text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-1.5 py-0.5 rounded font-bold font-mono">
            RTP {rtp}%
          </span>
          <button
            onClick={() => setShowHowToPlay(true)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
            title="How to play"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-x-auto scrollbar-none flex items-center gap-1.5 justify-end">
          {history.slice(0, 20).map((h) => (
            <button
              key={h.roundId}
              onClick={() => setSelectedRound(h)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono shrink-0 border transition-transform hover:scale-105 ${pillClass(h)}`}
              title={`Round #${h.roundId} — click to verify`}
            >
              {h.voided ? 'STOP' : `${h.crashAt.toFixed(2)}x`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* Bets feed (left on desktop like real Aviator) */}
        <div className="order-2 lg:order-1 bg-[#12151d] border border-[#1c212e] rounded-2xl p-3 flex flex-col h-[340px] lg:h-[640px]">
          <div className="flex bg-[#0b0e15] p-1 rounded-xl border border-[#181d28] mb-2.5">
            {[
              { id: 'all', label: 'All Bets' },
              { id: 'my', label: 'My Bets' },
              { id: 'top', label: 'Top', icon: <Trophy className="w-3 h-3" /> }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-heading font-bold flex items-center justify-center gap-1 transition-all ${
                  activeTab === t.id ? 'bg-[#2c2d30] text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          <div className="bg-[#0b0e15] p-2 rounded-xl border border-[#181d28] mb-2 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-400 font-bold uppercase text-[10px]">
              <Users className="w-3.5 h-3.5" /> {roundBets.length} bets this round
            </span>
            <span className="font-bold text-[#00c638] font-mono">PKR {totalWagered.toLocaleString()}</span>
          </div>

          <div className="grid grid-cols-12 text-[10px] text-slate-500 font-bold uppercase tracking-wider px-2 pb-1 border-b border-[#181d28]">
            <span className="col-span-5">{activeTab === 'my' ? 'Round' : 'Player'}</span>
            <span className="col-span-3 text-right">Bet</span>
            <span className="col-span-2 text-center">X</span>
            <span className="col-span-2 text-right">Win</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1 pt-1.5 pr-0.5">
            {listBets.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-12">
                {activeTab === 'my' ? (user ? 'You have no bets yet.' : 'Log in to see your bets.') : 'No bets in this round yet.'}
              </p>
            ) : listBets.map(b => (
              <div
                key={b.id}
                className={`grid grid-cols-12 items-center p-1.5 rounded-lg text-xs ${
                  b.status === 'won' ? 'bg-[#00c638]/10 border border-[#00c638]/25' : 'bg-[#0b0e15] border border-transparent'
                }`}
              >
                <span className="col-span-5 truncate font-semibold text-slate-200">
                  {activeTab === 'my' ? `#${b.roundId ?? '-'}` : maskName(b.username)}
                </span>
                <span className="col-span-3 text-right font-mono text-slate-300">{b.amount}</span>
                <span className="col-span-2 text-center font-mono">
                  {b.status === 'won' ? <span className="text-[#00c638] font-bold">{Number(b.multiplier).toFixed(2)}x</span>
                    : b.status === 'refunded' ? <span className="text-slate-400 text-[10px]">refund</span>
                    : b.status === 'lost' ? <span className="text-rose-400/70 text-[10px]">lost</span>
                    : <span className="text-slate-600">-</span>}
                </span>
                <span className="col-span-2 text-right font-mono font-bold">
                  {b.status === 'won' ? <span className="text-[#00c638]">{Math.floor(b.payout)}</span> : <span className="text-slate-600">-</span>}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Arena + bet panels */}
        <div className="order-1 lg:order-2 lg:col-span-3 space-y-2.5">
          <div className="relative w-full h-[270px] sm:h-[380px] lg:h-[430px] rounded-2xl overflow-hidden border border-[#1c2231] bg-[#08060a] shadow-xl">
            <canvas ref={canvasRef} className="absolute inset-0 block" />

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
              {view.state === 'LOADING' && (
                <div className="text-slate-400 text-sm font-bold animate-pulse">Connecting to live round…</div>
              )}

              {view.state === 'PAUSED' && (
                <div className="text-center">
                  <PauseCircle className="w-14 h-14 text-amber-400 mx-auto mb-2" />
                  <div className="text-2xl font-black text-white font-heading">GAME PAUSED</div>
                  <div className="text-xs text-slate-400 mt-1">Next round will start shortly</div>
                </div>
              )}

              {view.state === 'WAITING' && (
                <div className="text-center flex flex-col items-center">
                  <img src="/aviator_full.png" alt="Aviator" className="h-16 sm:h-20 w-auto object-contain mb-3 opacity-90" />
                  <span className="text-slate-300 font-bold text-[11px] uppercase tracking-[0.25em] mb-2">Waiting for next round</span>
                  <div className="w-56 h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#e60026] rounded-full"
                      style={{ width: `${Math.min(100, (view.countdown / 6) * 100)}%` }}
                    />
                  </div>
                  <span className="mt-2 text-white/80 font-mono text-sm">{view.countdown.toFixed(1)}s</span>
                </div>
              )}

              {(view.state === 'FLYING' || view.state === 'CRASHED') && (
                <div className="text-center">
                  {view.state === 'CRASHED' && (
                    <div className="text-base sm:text-xl font-black text-white uppercase tracking-widest mb-1">
                      {view.voided ? 'Round stopped — bets refunded' : 'Flew away!'}
                    </div>
                  )}
                  <div
                    ref={multTextRef}
                    className={`font-heading font-black tracking-tight tabular-nums text-6xl sm:text-8xl lg:text-9xl ${
                      view.state === 'CRASHED' ? 'text-[#e60026]' : 'text-white'
                    }`}
                    style={{ textShadow: '0 4px 30px rgba(0,0,0,0.6)' }}
                  />
                </div>
              )}
            </div>

            <div className="absolute top-2.5 left-3 text-[10px] font-mono text-slate-500 bg-black/40 px-2 py-0.5 rounded-md border border-white/5">
              Round #{view.roundId ?? '—'}
            </div>
            <button
              onClick={() => roundHash && setSelectedRound({ roundId: view.roundId, hash: roundHash, live: true })}
              className="absolute bottom-2.5 right-3 flex items-center gap-1.5 text-[10px] text-slate-400 font-mono bg-black/50 px-2.5 py-0.5 rounded-lg border border-white/10 hover:text-white"
            >
              <Shield className="w-3 h-3 text-[#00c638]" />
              <span>Provably fair {roundHash ? `· ${roundHash.slice(0, 10)}…` : ''}</span>
            </button>
            {connection === 'lost' && (
              <div className="absolute top-2.5 right-3 text-[10px] font-bold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md">
                Reconnecting…
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {[1, 2].map(n => (
              <BetPanel
                key={n}
                panel={n === 1 ? p1 : p2}
                setPanel={(u) => setPanel(n, u)}
                view={view}
                onBet={() => placeBet(n)}
                onCancel={() => cancelBet(n)}
                onCashout={() => doCashout(n)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-bold shadow-2xl border ${
          toast.type === 'error' ? 'bg-rose-950/95 border-rose-500/40 text-rose-100' : 'bg-slate-900/95 border-slate-600 text-white'
        }`}>
          {toast.text}
        </div>
      )}

      {/* Provably fair details */}
      {selectedRound && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setSelectedRound(null)}>
          <div className="w-full max-w-lg bg-[#12151d] border border-[#232a3b] rounded-2xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-black text-white">Round #{selectedRound.roundId}</h3>
              <button onClick={() => setSelectedRound(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            {!selectedRound.live && (
              <div className="text-3xl font-black font-mono text-white">
                {selectedRound.voided ? 'Stopped (refunded)' : `${selectedRound.crashAt.toFixed(2)}x`}
              </div>
            )}
            <div className="text-xs space-y-2 font-mono break-all">
              <div><span className="text-slate-500">Hash (published before round): </span><span className="text-slate-200">{selectedRound.hash}</span></div>
              {selectedRound.seed
                ? <div><span className="text-slate-500">Seed (revealed after crash): </span><span className="text-emerald-300">{selectedRound.seed}</span></div>
                : <div className="text-slate-400">Seed will be revealed when this round ends.</div>}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Verify: sha256(seed) must equal the hash. Crash = floor(((100 − edge)/100) / (1 − r) × 100) / 100, where
              r = first 13 hex chars of HMAC_SHA256(key = seed, "skywin-aviator-crash") ÷ 2^52.
            </p>
          </div>
        </div>
      )}

      <HowToPlayModal isOpen={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
    </div>
  );
}

function BetPanel({ panel, setPanel, view, onBet, onCancel, onCashout }) {
  const chips = [50, 100, 200, 500, 1000, 2500];
  const bet = panel.bet;
  const inThisRound = bet && bet.roundId === view.roundId;
  const locked = Boolean(bet) && !panel.result;
  const live = view.state === 'FLYING' && inThisRound && !panel.result;
  const livePayout = live ? (bet.amount * view.multiplier).toFixed(2) : null;

  const adjust = (delta) => setPanel(p => ({ ...p, amount: Math.max(10, Math.floor((Number(p.amount) || 0) + delta)) }));

  let action;
  if (panel.result?.type === 'won') {
    action = (
      <div className="w-full rounded-2xl bg-[#00c638]/15 border border-[#00c638]/40 text-[#00c638] flex flex-col items-center justify-center p-2 min-h-[84px]">
        <span className="text-[10px] font-bold uppercase tracking-wider">Cashed out @ {Number(panel.result.multiplier).toFixed(2)}x</span>
        <span className="text-lg font-black font-mono">+{panel.result.payout} PKR</span>
      </div>
    );
  } else if (panel.result?.type === 'lost') {
    action = (
      <div className="w-full rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex flex-col items-center justify-center p-2 min-h-[84px]">
        <span className="text-xs font-black uppercase tracking-wider">Flew away</span>
        <span className="text-[11px] font-mono">-{bet?.amount} PKR</span>
      </div>
    );
  } else if (panel.result?.type === 'refunded') {
    action = (
      <div className="w-full rounded-2xl bg-slate-500/10 border border-slate-500/30 text-slate-200 flex flex-col items-center justify-center p-2 min-h-[84px]">
        <span className="text-xs font-black uppercase tracking-wider">Refunded</span>
        <span className="text-[11px] font-mono">+{bet?.amount} PKR</span>
      </div>
    );
  } else if (live) {
    action = (
      <button
        type="button"
        disabled={panel.busy}
        onClick={onCashout}
        className="btn-cashout-gold w-full rounded-2xl flex flex-col items-center justify-center p-2 min-h-[84px] text-slate-950 font-black active:scale-[0.98] disabled:opacity-70"
      >
        <span className="text-xs uppercase tracking-wider">Cash Out</span>
        <span className="text-xl font-mono leading-tight">{livePayout} PKR</span>
      </button>
    );
  } else if (bet && inThisRound && view.state === 'WAITING') {
    action = (
      <button
        type="button"
        disabled={panel.busy}
        onClick={onCancel}
        className="w-full rounded-2xl bg-gradient-to-b from-[#ff3b5c] to-[#cb0a2c] text-white flex flex-col items-center justify-center p-2 min-h-[84px] border border-red-400/40 active:scale-[0.98] disabled:opacity-70"
      >
        <span className="text-sm uppercase font-black tracking-wider">Cancel</span>
        <span className="text-[11px] font-mono opacity-90">{bet.amount} PKR · waiting for take-off</span>
      </button>
    );
  } else if (bet && !panel.result) {
    action = (
      <div className="w-full rounded-2xl bg-white/5 border border-white/10 text-slate-300 flex items-center justify-center p-2 min-h-[84px] text-xs font-bold">
        Settling…
      </div>
    );
  } else {
    const canBet = view.state === 'WAITING' && view.countdown > 0.4;
    action = (
      <button
        type="button"
        disabled={!canBet || panel.busy}
        onClick={onBet}
        className="btn-bet-green w-full rounded-2xl flex flex-col items-center justify-center p-2 min-h-[84px] text-slate-950 font-black active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className="text-sm uppercase tracking-wider">{canBet ? 'Bet' : 'Wait for next round'}</span>
        <span className="text-lg font-mono leading-tight">{panel.amount} PKR</span>
      </button>
    );
  }

  return (
    <div className="bg-[#1b1c1d] border border-[#2a2b2e] rounded-2xl p-3 space-y-2.5">
      <div className="flex items-center justify-between text-xs">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            disabled={locked}
            checked={panel.autoEnabled}
            onChange={(e) => setPanel(p => ({ ...p, autoEnabled: e.target.checked }))}
            className="w-3.5 h-3.5 accent-[#e60026]"
          />
          <span className="text-slate-300 font-bold">Auto cash out</span>
        </label>
        <div className={`flex items-center gap-1 bg-black/40 rounded-full px-2 py-0.5 border border-white/10 ${panel.autoEnabled ? '' : 'opacity-40'}`}>
          <input
            type="number"
            step="0.01"
            min="1.01"
            disabled={!panel.autoEnabled || locked}
            value={panel.autoValue}
            onChange={(e) => setPanel(p => ({ ...p, autoValue: e.target.value }))}
            className="w-16 bg-transparent text-right text-white font-mono font-bold focus:outline-none"
          />
          <span className="text-slate-400 font-mono">x</span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-2 items-stretch">
        <div className="col-span-6 sm:col-span-5 space-y-1.5">
          <div className="flex items-center bg-black/40 rounded-full border border-white/10 px-1">
            <button type="button" disabled={locked} onClick={() => adjust(-10)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-slate-200 disabled:opacity-40">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="number"
              disabled={locked}
              value={panel.amount}
              onChange={(e) => setPanel(p => ({ ...p, amount: e.target.value }))}
              className="flex-1 min-w-0 bg-transparent text-center text-white font-mono font-bold py-1.5 focus:outline-none"
            />
            <button type="button" disabled={locked} onClick={() => adjust(10)} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-slate-200 disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {chips.map(c => (
              <button
                key={c}
                type="button"
                disabled={locked}
                onClick={() => setPanel(p => ({ ...p, amount: c }))}
                className="py-1 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono text-slate-300 disabled:opacity-40"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-6 sm:col-span-7 flex">{action}</div>
      </div>
    </div>
  );
}
