import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Shield, Trophy, Minus, Plus, HelpCircle, X, PauseCircle, History, ChevronDown,
  WifiOff, CheckCircle2, AlertCircle, Info, Copy, Check, Loader2
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { soundFx } from '../utils/soundEffects';
import { verifyRound, crashTier, TIER_TEXT } from '../utils/aviatorFair';
import HowToPlayModal from './HowToPlayModal';

// ---------------------------------------------------------------------------
// Must match server/aviatorEngine.js
// ---------------------------------------------------------------------------
const DEFAULT_GROWTH = 0.09;
const multiplierAt = (elapsedMs, growth = DEFAULT_GROWTH) =>
  elapsedMs <= 0 ? 1 : Math.floor(Math.exp((growth || DEFAULT_GROWTH) * elapsedMs / 1000) * 100) / 100;

const MIN_BET = 10;
const MAX_BET = 50000;
const SAFE_BET_MS = 450;      // server rejects bets < 300ms before take-off; keep a margin for latency
const CHIPS = [100, 200, 500, 1000];

const token = () => localStorage.getItem('luckywin_token');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (v) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });

async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...(token() ? { Authorization: `Bearer ${token()}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    const err = new Error('Network error — please check your connection');
    err.network = true;
    throw err;
  }
  let data = {};
  try { data = await res.json(); } catch (e) { /* non-JSON */ }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const emptyPanel = (amount) => ({
  mode: 'bet',            // 'bet' | 'auto' (tab)
  amount,
  autoCashEnabled: false,
  autoCashValue: '2.00',
  autoBet: false,
  queued: null,           // { amount, autoCashout } -> submitted when the next round opens
  bet: null,              // { id, amount, roundId, autoCashout }
  result: null,           // { type: 'won'|'lost'|'refunded', payout, multiplier, roundId }
  busy: false
});

function avatarColor(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 55% 42%)`;
}

// ===========================================================================
export default function CrashGame({ user, balance, onBalanceUpdate, onOpenAuth, onOpenCashier }) {
  // ---------- live round (from server) ----------
  const liveRef = useRef(null);
  const offsetRef = useRef(0);           // serverTime - clientTime
  const bestRttRef = useRef(Infinity);
  const [view, setView] = useState({ state: 'LOADING', roundId: null, predicted: false, voided: false, closing: false });
  const [history, setHistory] = useState([]);
  const [roundBets, setRoundBets] = useState([]);
  const [myBets, setMyBets] = useState([]);
  const [myBetsLoaded, setMyBetsLoaded] = useState(false);
  const [rtp, setRtp] = useState(null);
  const [roundHash, setRoundHash] = useState('');
  const [selectedRound, setSelectedRound] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [wins, setWins] = useState([]);
  const [connection, setConnection] = useState('ok');

  // ---------- bet panels (ref is the synchronous source of truth) ----------
  const [panels, setPanels] = useState(() => ({ 1: emptyPanel(100), 2: emptyPanel(200) }));
  const panelsRef = useRef(panels);
  const updatePanel = useCallback((n, patch) => {
    const cur = panelsRef.current[n];
    const next = typeof patch === 'function' ? patch(cur) : { ...cur, ...patch };
    panelsRef.current = { ...panelsRef.current, [n]: next };
    setPanels(panelsRef.current);
  }, []);
  const autoFiredRef = useRef({ 1: null, 2: null });
  const attemptRef = useRef({ 1: null, 2: null });
  const notifiedRef = useRef(new Set());

  const multTextRef = useRef(null);
  const barRef = useRef(null);
  const canvasRef = useRef(null);
  const cashAmtRefs = useRef({ 1: null, 2: null });

  const onBalanceRef = useRef(onBalanceUpdate);
  useEffect(() => { onBalanceRef.current = onBalanceUpdate; }, [onBalanceUpdate]);
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
  const balanceRef = useRef(balance);
  useEffect(() => { balanceRef.current = balance; }, [balance]);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  // ---------- toasts ----------
  const pushToast = useCallback((text, type = 'info', action = null) => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts(prev => [...prev.filter(t => t.text !== text), { id, text, type, action }].slice(-3));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), action ? 5000 : 3500);
  }, []);
  const pushWin = useCallback((multiplier, payout) => {
    const id = `${Date.now()}_${Math.random()}`;
    setWins(prev => [...prev, { id, multiplier, payout }].slice(-2));
    setTimeout(() => setWins(prev => prev.filter(w => w.id !== id)), 3200);
  }, []);

  const handleApiError = useCallback((e) => {
    const msg = e?.message || 'Something went wrong';
    if (e?.status === 401) {
      pushToast('Please log in to continue', 'error');
      onOpenAuth?.('login');
      return;
    }
    if (/insufficient/i.test(msg)) {
      pushToast('Insufficient balance', 'error', onOpenCashier ? { label: 'Deposit', fn: () => onOpenCashier('deposit') } : null);
      return;
    }
    pushToast(msg, 'error');
  }, [pushToast, onOpenAuth, onOpenCashier]);

  // ---------- settle / refresh my bets ----------
  const refreshMyBets = async () => {
    if (!userRef.current || !token()) return;
    try {
      const data = await api('GET', `/api/crash/my-bets?_t=${Date.now()}`);
      const bets = data.bets || [];
      setMyBets(bets);
      setMyBetsLoaded(true);
      if (typeof data.balance === 'number') onBalanceRef.current(data.balance);
      [1, 2].forEach(n => {
        const p = panelsRef.current[n];
        if (!p.bet) return;
        const b = bets.find(x => x.id === p.bet.id);
        if (!b || b.status === 'placed') return;
        if (b.status === 'cancelled') { updatePanel(n, { bet: null, result: null }); return; }
        const type = b.status === 'won' ? 'won' : b.status === 'refunded' ? 'refunded' : 'lost';
        updatePanel(n, { result: { type, payout: b.payout || 0, multiplier: b.multiplier || 0, roundId: p.bet.roundId } });
        if (!notifiedRef.current.has(b.id)) {
          if (type === 'won') { notifiedRef.current.add(b.id); pushWin(b.multiplier, b.payout); soundFx.playCashout(); }
          if (type === 'refunded') { notifiedRef.current.add(b.id); pushToast(`Round voided — PKR ${fmt(b.betAmount)} refunded`, 'info'); }
        }
      });
    } catch (e) {
      if (e.status === 401) pushToast('Session expired — please log in again', 'error');
    }
  };

  // ---------- placing / queueing ----------
  const buildSnapshot = (p) => {
    const amount = Math.floor(Number(p.amount) || 0);
    if (amount < MIN_BET) return { error: `Minimum bet is PKR ${MIN_BET}` };
    if (amount > MAX_BET) return { error: `Maximum bet is PKR ${fmt0(MAX_BET)}` };
    let autoCashout = null;
    if (p.autoCashEnabled) {
      autoCashout = Math.round(Number(p.autoCashValue) * 100) / 100;
      if (!(autoCashout >= 1.01 && autoCashout <= 1000)) return { error: 'Auto cash out must be between 1.01x and 1000x' };
    }
    return { snap: { amount, autoCashout } };
  };

  const placeBetNow = async (n, snap, fromQueue = false) => {
    updatePanel(n, { busy: true });
    try {
      const data = await api('POST', '/api/crash/bet', { amount: snap.amount, autoCashout: snap.autoCashout });
      updatePanel(n, p => ({
        ...p,
        busy: false,
        queued: null,
        result: null,
        bet: { id: data.bet.id, amount: data.bet.betAmount, roundId: data.bet.roundId, autoCashout: data.bet.autoCashout }
      }));
      onBalanceRef.current(data.newBalance);
      soundFx.playBet();
    } catch (e) {
      const timing = /before take-off|next round|paused/i.test(e.message || '');
      if (timing) {
        // Too late for this round -> keep it queued for the next one (how real crash games behave)
        updatePanel(n, p => ({ ...p, busy: false, queued: p.queued || snap }));
        if (!fromQueue) pushToast('Bet will be placed in the next round', 'info');
        return;
      }
      updatePanel(n, p => ({ ...p, busy: false, queued: null, autoBet: false }));
      handleApiError(e);
    }
  };

  const submitQueued = (d) => {
    if (!d || d.state !== 'WAITING' || serverNow() > d.flightStart - SAFE_BET_MS) return;
    if (!userRef.current || !token()) return;
    [1, 2].forEach(n => {
      const p = panelsRef.current[n];
      if (p.busy) return;
      if (p.bet && p.bet.roundId === d.roundId && p.result?.type !== 'refunded') return;
      if (attemptRef.current[n] === d.roundId) return;
      let snap = p.queued;
      if (!snap && p.autoBet) {
        const built = buildSnapshot(p);
        if (built.error) { updatePanel(n, { autoBet: false }); pushToast(built.error, 'error'); return; }
        snap = built.snap;
      }
      if (!snap) return;
      attemptRef.current[n] = d.roundId;
      placeBetNow(n, snap, true);
    });
  };

  const onNewRound = (d) => {
    autoFiredRef.current = { 1: null, 2: null };
    let missed = false;
    [1, 2].forEach(n => {
      const p = panelsRef.current[n];
      if (p.bet && p.bet.roundId !== d.roundId) {
        if (p.result) updatePanel(n, { bet: null, result: null });
        else missed = true;
      }
    });
    if (missed) setTimeout(refreshMyBets, 300);
  };

  const onCrash = (d) => {
    [1, 2].forEach(n => {
      const p = panelsRef.current[n];
      if (!p.bet || p.bet.roundId !== d.roundId || p.result || p.busy) return;
      if (d.voided) {
        updatePanel(n, { result: { type: 'refunded', payout: p.bet.amount, multiplier: 0, roundId: d.roundId } });
      } else if (!p.bet.autoCashout || p.bet.autoCashout > d.crashAt) {
        updatePanel(n, { result: { type: 'lost', payout: 0, multiplier: 0, roundId: d.roundId } });
      }
    });
    setTimeout(refreshMyBets, 600);
    setTimeout(refreshMyBets, 2600);
  };

  // ---------- cashout ----------
  const doCashout = async (n, requested) => {
    const p = panelsRef.current[n];
    if (!p.bet || p.result || p.busy) return;
    updatePanel(n, { busy: true });
    try {
      const data = await api('POST', '/api/crash/cashout', { betId: p.bet.id, multiplier: requested || undefined });
      notifiedRef.current.add(p.bet.id);
      updatePanel(n, cur => ({ ...cur, busy: false, result: { type: 'won', payout: data.payout, multiplier: data.multiplier, roundId: cur.bet?.roundId } }));
      onBalanceRef.current(data.newBalance);
      soundFx.playCashout();
      pushWin(data.multiplier, data.payout);
      try { confetti({ particleCount: 45, spread: 65, startVelocity: 32, origin: { y: 0.6 }, colors: ['#28a909', '#ffffff', '#e50539'] }); } catch (e) { /* ignore */ }
    } catch (e) {
      updatePanel(n, { busy: false });
      const d = liveRef.current;
      if (d && d.state === 'CRASHED' && d.roundId === p.bet.roundId) {
        updatePanel(n, cur => (cur.result ? cur : { ...cur, result: { type: 'lost', payout: 0, multiplier: 0, roundId: d.roundId } }));
      }
      handleApiError(e);
      setTimeout(refreshMyBets, 500);
    }
  };

  // Latest handlers for long-lived effects (avoids stale closures without re-subscribing)
  const actionsRef = useRef({});
  actionsRef.current = { refreshMyBets, submitQueued, onNewRound, onCrash, doCashout };

  // ---------- polling the global round ----------
  useEffect(() => {
    let alive = true;
    let pollTimer = null;
    let flightTimer = null;
    let waitRetry = null;
    let waitCtl = null;
    let waitRound = null;
    let waitMode = 'unknown';     // 'unknown' | 'on' | 'off'
    let offReason = null;         // 'unsupported' | 'net'
    let strikes = 0;
    let fails = 0;

    const fetchLive = async (qs, signal) => {
      const t0 = Date.now();
      const res = await fetch(`/api/crash/live?${qs}_t=${t0}`, { cache: 'no-store', signal });
      if (!res.ok) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
      const data = await res.json();
      return { data, t0, t1: Date.now() };
    };

    const apply = (data, t0, t1, sample) => {
      if (!data || !data.serverTime) return false;
      const prev = liveRef.current;
      if (prev && prev.roundId != null && data.roundId != null) {
        if (data.roundId < prev.roundId) return false;                    // out-of-order (older round)
        if (data.roundId === prev.roundId && prev.state === 'CRASHED' && data.state !== 'CRASHED') return false;
      }
      if (sample) {
        // Clock sync: trust samples with the smallest round-trip.
        const rtt = t1 - t0;
        const sampleOffset = data.serverTime - (t0 + t1) / 2;
        bestRttRef.current *= 1.02; // slowly forget, so the estimate can adapt
        if (rtt <= bestRttRef.current * 1.25 || Math.abs(sampleOffset - offsetRef.current) > 1500) {
          bestRttRef.current = Math.min(bestRttRef.current, rtt);
          offsetRef.current = sampleOffset;
        }
      }
      liveRef.current = data;
      fails = 0;
      setConnection('ok');
      const hist = data.history || [];
      setHistory(h => (h.length === hist.length && h[0]?.roundId === hist[0]?.roundId ? h : hist));
      if (Array.isArray(data.bets)) setRoundBets(data.bets);
      if (typeof data.rtp === 'number') setRtp(data.rtp);
      setRoundHash(data.hash || '');

      const A = actionsRef.current;
      const isNewRound = !prev || prev.roundId !== data.roundId;
      if (isNewRound) {
        A.onNewRound(data);
        if (waitMode === 'off' && offReason === 'net') { waitMode = 'unknown'; strikes = 0; }
      }
      if (data.state === 'CRASHED' && !(prev && prev.roundId === data.roundId && prev.state === 'CRASHED')) A.onCrash(data);
      if (data.state === 'WAITING') A.submitQueued(data);
      return true;
    };

    const disableWait = (reason) => { waitMode = 'off'; offReason = reason; schedule(); };

    const ensureWait = () => {
      if (!alive || waitMode === 'off' || document.hidden) return;
      const d = liveRef.current;
      if (!d || d.state === 'CRASHED' || d.state === 'PAUSED' || !d.flightStart) return;
      if (serverNow() < d.flightStart - 50) return;
      if (waitCtl && waitRound === d.roundId) return; // exactly one outstanding request
      runWait(d.roundId);
    };

    const runWait = async (roundId) => {
      if (waitCtl) waitCtl.abort();
      const ctl = new AbortController();
      waitCtl = ctl;
      waitRound = roundId;
      const kill = setTimeout(() => ctl.abort(), 15000);
      let next = null;
      try {
        const { data, t0, t1 } = await fetchLive(`waitCrash=${roundId}&`, ctl.signal);
        if (!alive || waitCtl !== ctl) return;
        waitCtl = null;
        if (!data || !data.serverTime) { next = 600; return; }
        apply(data, t0, t1, false);
        if (data.roundId !== roundId || data.state === 'CRASHED' || data.state === 'PAUSED') {
          if (data.state === 'CRASHED' && t1 - t0 > 250) { waitMode = 'on'; strikes = 0; }
          schedule();
          return;
        }
        if (data.state === 'WAITING') { next = 150; return; }   // our clock is slightly ahead
        // Still flying: the server held the request (~8s cap) -> re-issue immediately.
        if (t1 - t0 < 900) {
          // Returned instantly while flying => server ignores waitCrash (older backend).
          strikes += 1;
          if (waitMode !== 'on' && strikes >= 3) { disableWait('unsupported'); return; }
          next = 300;
        } else {
          waitMode = 'on';
          strikes = 0;
          next = 0;
        }
      } catch (e) {
        if (waitCtl !== ctl) return;  // superseded / aborted on purpose
        waitCtl = null;
        if (!alive) return;
        if (e.status && e.status >= 400 && e.status < 500) { disableWait('unsupported'); return; }
        strikes += 1;
        if (strikes >= 3) { disableWait('net'); return; }
        next = 600;
      } finally {
        clearTimeout(kill);
        if (alive && next != null) {
          clearTimeout(waitRetry);
          waitRetry = setTimeout(ensureWait, next);
        }
      }
    };

    const schedule = () => {
      if (!alive) return;
      clearTimeout(pollTimer);
      clearTimeout(flightTimer);
      const d = liveRef.current;
      const hidden = document.hidden;
      let wait = hidden ? 2500 : 1000;
      if (d && !hidden) {
        const now = serverNow();
        if (d.state === 'CRASHED') {
          if (d.nextRoundAt) wait = clamp(d.nextRoundAt - now + 60, 120, 1500);
        } else if (d.state !== 'PAUSED' && d.flightStart) {
          if (now < d.flightStart) {
            wait = clamp(d.flightStart - now + 80, 120, 1000);
            flightTimer = setTimeout(ensureWait, Math.max(0, d.flightStart - now + 20));
          } else {
            wait = waitMode === 'off' ? 300 : 1000;   // fallback: fast polling for the crash
            ensureWait();
          }
        }
      }
      if (fails > 0) wait = Math.max(wait, Math.min(4000, 600 * fails));
      pollTimer = setTimeout(poll, wait);
    };

    const poll = async () => {
      clearTimeout(pollTimer);
      try {
        const { data, t0, t1 } = await fetchLive('');
        if (!alive) return;
        apply(data, t0, t1, true);
      } catch (e) {
        if (!alive) return;
        fails += 1;
        if (fails >= 2) setConnection('lost');
      } finally {
        schedule();
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (waitCtl) { const c = waitCtl; waitCtl = null; c.abort(); }
      } else {
        poll();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    poll();
    return () => {
      alive = false;
      clearTimeout(pollTimer);
      clearTimeout(flightTimer);
      clearTimeout(waitRetry);
      if (waitCtl) waitCtl.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [serverNow]);

  // Load my bets on login; reset panels on logout
  useEffect(() => {
    if (user?.id) {
      actionsRef.current.refreshMyBets();
    } else {
      setMyBets([]);
      setMyBetsLoaded(false);
      [1, 2].forEach(n => updatePanel(n, p => ({ ...p, bet: null, result: null, queued: null, autoBet: false, busy: false })));
    }
  }, [user?.id, updatePanel]);

  // ---------- 60fps render loop (number + canvas) ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      const r = canvas.parentElement.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(resize);
      ro.observe(canvas.parentElement);
    } else {
      window.addEventListener('resize', resize);
    }

    const plane = new Image();
    plane.src = '/aviator_plane.png';
    let prevState = null;
    let rayAngle = 0;
    let lastT = performance.now();
    let crashAnim = null;
    let lastPlane = null;
    let lastViewKey = '';
    let lastMultText = '';

    const step = (t, dt) => {
      const d = liveRef.current;
      const now = serverNow();
      let state = 'LOADING';
      let mult = 1;
      let elapsed = 0;
      let countdown = 0;
      let roundId = d?.roundId ?? null;
      let predicted = false;
      const total = Math.max(1, (d?.bettingMs || 6000) / 1000);
      if (d) {
        if (d.state === 'PAUSED') state = 'PAUSED';
        else if (d.state === 'CRASHED') {
          if (d.nextRoundAt && now >= d.nextRoundAt) {
            // next round's betting window has opened; real data arrives with the next poll
            state = 'WAITING';
            predicted = true;
            roundId = d.roundId + 1;
            countdown = Math.max(0, (d.nextRoundAt + (d.bettingMs || 6000) - now) / 1000);
          } else {
            state = 'CRASHED';
            mult = d.crashAt;           // frozen at the server's crash point
            elapsed = d.crashTime - d.flightStart;
          }
        } else if (now < d.flightStart) {
          state = 'WAITING';
          countdown = (d.flightStart - now) / 1000;
        } else {
          state = 'FLYING';
          elapsed = now - d.flightStart;
          mult = multiplierAt(elapsed, d.growth);
        }
      }

      // transitions
      if (state !== prevState) {
        if (state === 'FLYING') soundFx.startFlightSound?.();
        if (state !== 'FLYING') soundFx.stopFlightSound?.();
        if (state === 'CRASHED' && prevState === 'FLYING') soundFx.playCrash();
        crashAnim = state === 'CRASHED' ? { t0: t, from: prevState === 'FLYING' ? lastPlane : null } : null;
        prevState = state;
      }

      // DOM writes (no React re-render)
      if (multTextRef.current && (state === 'FLYING' || state === 'CRASHED')) {
        const txt = `${mult.toFixed(2)}x`;
        if (txt !== lastMultText) { multTextRef.current.textContent = txt; lastMultText = txt; }
      }
      if (barRef.current) barRef.current.style.transform = `scaleX(${state === 'WAITING' ? clamp(countdown / total, 0, 1) : 0})`;
      [1, 2].forEach(n => {
        const el = cashAmtRefs.current[n];
        if (!el || state !== 'FLYING') return;
        const p = panelsRef.current[n];
        if (p.bet && !p.result && p.bet.roundId === d.roundId) el.textContent = fmt(p.bet.amount * mult);
      });

      // client-side auto cash-out (the server also settles it, even if this tab is closed)
      if (state === 'FLYING') {
        [1, 2].forEach(n => {
          const p = panelsRef.current[n];
          if (p.bet && !p.result && !p.busy && p.bet.roundId === d.roundId && p.bet.autoCashout
            && mult >= p.bet.autoCashout && autoFiredRef.current[n] !== p.bet.id) {
            autoFiredRef.current[n] = p.bet.id;
            actionsRef.current.doCashout(n, p.bet.autoCashout);
          }
        });
      }

      // React UI only when something discrete changes
      const closing = state === 'WAITING' && !predicted && countdown * 1000 < SAFE_BET_MS;
      const voided = state === 'CRASHED' && !!d?.voided;
      const key = `${state}|${roundId}|${predicted}|${voided}|${closing}`;
      if (key !== lastViewKey) {
        lastViewKey = key;
        setView({ state, roundId, predicted, voided, closing });
      }

      // ---------------- canvas ----------------
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0b0b0d';
      ctx.fillRect(0, 0, w, h);

      const flying = state === 'FLYING';
      const R = Math.hypot(w, h) * 1.15;
      rayAngle += (flying ? 0.00016 : 0.00004) * dt;
      ctx.save();
      ctx.translate(0, h);
      ctx.rotate(rayAngle);
      const N = 20;
      const seg = (Math.PI * 2) / N;
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const a = i * seg;
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, R, a, a + seg / 2);
        ctx.closePath();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fill();
      ctx.restore();

      const glow = ctx.createRadialGradient(0, h, 0, 0, h, R * 0.75);
      glow.addColorStop(0, flying ? 'rgba(229,5,57,0.12)' : 'rgba(229,5,57,0.05)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      // axes + moving dots
      const padL = Math.max(16, Math.round(w * 0.03));
      const padB = Math.max(18, Math.round(h * 0.07));
      const x0 = padL;
      const y0 = h - padB;
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + 0.5);
      ctx.lineTo(w, y0 + 0.5);
      ctx.moveTo(x0 + 0.5, y0);
      ctx.lineTo(x0 + 0.5, 0);
      ctx.stroke();

      const secAll = elapsed / 1000;
      const gapX = Math.max(46, w / 11);
      const gapY = Math.max(30, h / 8);
      const shiftX = flying ? (secAll * gapX * 0.45) % gapX : 0;
      const shiftY = flying ? (secAll * gapY * 0.35) % gapY : 0;
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (let x = x0 + gapX - shiftX; x < w; x += gapX) {
        ctx.beginPath(); ctx.arc(x, y0 + padB / 2, 1.5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(52,180,255,0.65)';
      for (let y = y0 - gapY + shiftY; y > 4; y -= gapY) {
        ctx.beginPath(); ctx.arc(x0 / 2, y, 1.5, 0, Math.PI * 2); ctx.fill();
      }

      // plane + curve
      const ratio = plane.naturalWidth ? plane.naturalHeight / plane.naturalWidth : 0.51;
      const pw = clamp(w * 0.14, 64, 150);
      const ph = pw * ratio;
      const drawPlane = (x, y, rot) => {
        if (!plane.complete || !plane.naturalWidth) return;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.drawImage(plane, -pw * 0.06, -ph * 0.66, pw, ph);
        ctx.restore();
      };
      const drawCurve = (px, py, alpha) => {
        if (alpha <= 0) return;
        const cx = x0 + (px - x0) * 0.62;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx, y0, px, py);
        ctx.lineTo(px, y0);
        ctx.closePath();
        const fill = ctx.createLinearGradient(0, py, 0, y0);
        fill.addColorStop(0, 'rgba(229,5,57,0.42)');
        fill.addColorStop(1, 'rgba(229,5,57,0.10)');
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(cx, y0, px, py);
        ctx.strokeStyle = '#e50539';
        ctx.lineWidth = Math.max(3, Math.min(5, w / 220));
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.restore();
      };

      if (flying) {
        const sec = elapsed / 1000;
        const maxX = w - pw * 0.98 - 8;
        const minY = ph * 0.75 + 12;
        let px = x0 + (maxX - x0) * (1 - Math.exp(-sec / 2.4));
        let py = y0 - (y0 - minY) * 0.9 * (1 - Math.exp(-sec / 3.1));
        const hover = clamp((sec - 3) / 3, 0, 1);
        px += Math.sin(t / 1100) * w * 0.012 * hover;
        py += Math.sin(t / 700) * h * 0.035 * hover;
        drawCurve(px, py, 1);
        drawPlane(px, py, -0.1 * (1 - hover * 0.5));
        lastPlane = { x: px, y: py };
      } else if (state === 'CRASHED' && crashAnim && crashAnim.from) {
        const k = (t - crashAnim.t0) / 1000;
        const { x, y } = crashAnim.from;
        drawCurve(x, y, 1 - k / 0.35);
        const fx = x + k * k * w * 2.2 + k * w * 0.2;
        const fy = y - k * k * h * 1.1 - k * h * 0.1;
        if (fx < w + pw * 1.2 && fy > -ph * 1.5) drawPlane(fx, fy, -0.22);
      }
    };

    const frame = (t) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(64, t - lastT);
      lastT = t;
      try { step(t, dt); } catch (e) { /* never let a frame error stop the loop */ }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
      soundFx.stopFlightSound?.();
    };
  }, [serverNow]);

  // ---------- user actions ----------
  const onBet = (n) => {
    if (!user || !token()) { onOpenAuth?.('login'); pushToast('Log in to place a bet', 'info'); return; }
    const p = panelsRef.current[n];
    if (p.busy) return;
    const built = buildSnapshot(p);
    if (built.error) { pushToast(built.error, 'error'); return; }
    const used = [1, 2].filter(k => k !== n).reduce((s, k) => s + (panelsRef.current[k].queued?.amount || 0), 0);
    if (built.snap.amount + used > (balanceRef.current || 0)) {
      pushToast('Insufficient balance', 'error', onOpenCashier ? { label: 'Deposit', fn: () => onOpenCashier('deposit') } : null);
      return;
    }
    const d = liveRef.current;
    const canNow = d && d.state === 'WAITING' && serverNow() < d.flightStart - SAFE_BET_MS;
    if (canNow) {
      attemptRef.current[n] = d.roundId;
      placeBetNow(n, built.snap);
    } else {
      updatePanel(n, { queued: built.snap });
      soundFx.playBet();
    }
  };

  const onCancel = async (n) => {
    const p = panelsRef.current[n];
    if (p.busy) return;
    if (p.queued) { updatePanel(n, { queued: null, autoBet: false }); return; }
    if (!p.bet) return;
    updatePanel(n, { busy: true });
    try {
      const data = await api('POST', '/api/crash/cancel-bet', { betId: p.bet.id });
      updatePanel(n, { busy: false, bet: null, result: null, autoBet: false });
      if (typeof data.newBalance === 'number') onBalanceRef.current(data.newBalance);
      soundFx.playBet();
    } catch (e) {
      updatePanel(n, { busy: false });
      handleApiError(e);
    }
  };

  // ---------- derived lists ----------
  const listBets = useMemo(() => {
    if (activeTab === 'my') return myBets.filter(b => b.status !== 'cancelled');
    if (activeTab === 'top') return roundBets.filter(b => b.status === 'won').sort((a, b) => (b.payout || 0) - (a.payout || 0));
    return [...roundBets].sort((a, b) => (b.status === 'won') - (a.status === 'won') || (b.amount || 0) - (a.amount || 0));
  }, [activeTab, myBets, roundBets]);
  const totalWagered = roundBets.reduce((s, b) => s + (b.amount || 0), 0);
  const totalWon = roundBets.reduce((s, b) => s + (b.status === 'won' ? b.payout || 0 : 0), 0);

  const showMult = view.state === 'FLYING' || view.state === 'CRASHED';
  const crashed = view.state === 'CRASHED';

  return (
    <div className="max-w-[1400px] mx-auto px-2 sm:px-4 py-2 sm:py-3">
      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)] gap-2.5 sm:gap-3">
        {/* ================= Arena column ================= */}
        <div className="lg:order-2 min-w-0 space-y-2.5">
          {/* Game header */}
          <div className="flex items-center justify-between gap-2 rounded-xl bg-[#1b1c1d] border border-white/[0.06] px-3 h-11">
            <div className="flex items-center gap-2 min-w-0">
              <img src="/aviator_wordmark.png" alt="Aviator" className="h-5 sm:h-6 w-auto object-contain" draggable="false" />
              {typeof rtp === 'number' && (
                <span className="hidden xs:inline sm:inline text-[10px] font-bold text-zinc-300 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded tabular-nums">
                  RTP {rtp}%
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowHowToPlay(true)}
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#e69308] hover:bg-[#f2a01a] text-black text-[11px] font-bold transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>How to play?</span>
            </button>
          </div>

          {/* Arena (history + canvas) */}
          <div className="rounded-2xl bg-[#1b1c1d] border border-white/[0.06] p-1.5 sm:p-2">
            <HistoryBar
              history={history}
              loading={view.state === 'LOADING' && history.length === 0}
              open={historyOpen}
              setOpen={setHistoryOpen}
              onSelect={(h) => { setSelectedRound(h); setHistoryOpen(false); }}
            />

            <div className="relative mt-1.5 w-full h-[230px] xs:h-[250px] sm:h-[330px] lg:h-[380px] xl:h-[420px] rounded-xl overflow-hidden bg-[#0b0b0d] select-none">
              <canvas ref={canvasRef} className="absolute inset-0 block" aria-hidden="true" />

              {/* LOADING */}
              {view.state === 'LOADING' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-400">
                  {connection === 'lost' ? (
                    <>
                      <WifiOff className="w-8 h-8 text-zinc-500" />
                      <span className="text-sm font-semibold">Can’t reach the game server. Retrying…</span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-8 h-8 animate-spin text-[#e50539]" />
                      <span className="text-sm font-semibold">Connecting to live round…</span>
                    </>
                  )}
                </div>
              )}

              {/* PAUSED */}
              {view.state === 'PAUSED' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                  <PauseCircle className="w-12 h-12 text-amber-400 mb-2" />
                  <div className="text-xl sm:text-2xl font-extrabold text-white font-heading">Game paused</div>
                  <div className="text-xs sm:text-sm text-zinc-400 mt-1">Rounds are paused by the operator. Open bets are safe.</div>
                </div>
              )}

              {/* WAITING */}
              <div
                className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-200 pointer-events-none ${view.state === 'WAITING' ? 'opacity-100' : 'opacity-0'}`}
                aria-hidden={view.state !== 'WAITING'}
              >
                <Propeller className="w-14 h-14 sm:w-20 sm:h-20 text-[#e50539]" spinning={view.state === 'WAITING'} />
                <div className="mt-3 text-[11px] sm:text-sm font-heading font-extrabold uppercase tracking-[0.22em] text-white">
                  Waiting for next round
                </div>
                <div className="mt-3 w-40 sm:w-56 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div ref={barRef} className="h-full w-full bg-[#e50539] origin-left rounded-full will-change-transform" style={{ transform: 'scaleX(0)' }} />
                </div>
              </div>

              {/* FLYING / CRASHED */}
              <div className={`absolute inset-0 flex flex-col items-center justify-center pointer-events-none ${showMult ? '' : 'invisible'}`}>
                <div className={`h-6 sm:h-9 flex items-center text-sm sm:text-2xl font-heading font-extrabold uppercase tracking-wide text-white transition-opacity ${crashed ? 'opacity-100' : 'opacity-0'}`}>
                  {view.voided ? 'Round voided — bets refunded' : 'Flew away!'}
                </div>
                <div
                  ref={multTextRef}
                  aria-live="off"
                  className={`font-heading font-extrabold tabular-nums leading-none tracking-tight text-[56px] xs:text-[64px] sm:text-[92px] lg:text-[108px] ${crashed ? 'text-[#e50539]' : 'text-white'}`}
                  style={{ textShadow: '0 6px 30px rgba(0,0,0,0.55)' }}
                />
              </div>

              {/* win notifications (real results of this player) */}
              <div className="absolute top-2 left-0 right-0 flex flex-col items-center gap-1.5 px-2 pointer-events-none">
                {wins.map(wn => (
                  <div key={wn.id} className="toast-in flex items-center gap-3 rounded-full bg-gradient-to-r from-[#1a5c0b] to-[#28800f] border border-[#5fd23b]/50 pl-4 pr-1 py-1 shadow-xl">
                    <div className="leading-tight">
                      <div className="text-[10px] text-white/75">You have cashed out!</div>
                      <div className="text-base sm:text-lg font-extrabold text-white tabular-nums">{Number(wn.multiplier).toFixed(2)}x</div>
                    </div>
                    <div className="rounded-full bg-[#0f3b05] px-3 sm:px-4 py-1 text-center leading-tight">
                      <div className="text-[10px] text-white/70">Win, PKR</div>
                      <div className="text-sm sm:text-base font-bold text-white tabular-nums">{fmt(wn.payout)}</div>
                    </div>
                  </div>
                ))}
              </div>

              {connection === 'lost' && view.state !== 'LOADING' && (
                <div className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold text-amber-300 bg-black/60 border border-amber-500/30 px-2 py-1 rounded-md">
                  <WifiOff className="w-3 h-3" /> Reconnecting…
                </div>
              )}
              <div className="absolute bottom-1.5 left-2 text-[10px] text-zinc-500 tabular-nums">
                {view.roundId ? `Round #${view.roundId}` : ''}
              </div>
              <button
                type="button"
                onClick={() => roundHash && setSelectedRound({ roundId: liveRef.current?.roundId, hash: roundHash, live: true })}
                className="absolute bottom-1.5 right-2 flex items-center gap-1 text-[10px] text-zinc-400 bg-black/50 hover:text-white px-2 py-0.5 rounded-md border border-white/10"
              >
                <Shield className="w-3 h-3 text-[#28a909]" />
                Provably fair
              </button>
            </div>
          </div>

          {/* Bet panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {[1, 2].map(n => (
              <BetPanel
                key={n}
                panel={panels[n]}
                view={view}
                onChange={(patch) => updatePanel(n, patch)}
                onBet={() => onBet(n)}
                onCancel={() => onCancel(n)}
                onCashout={() => actionsRef.current.doCashout(n)}
                cashRef={(el) => { cashAmtRefs.current[n] = el; }}
              />
            ))}
          </div>
        </div>

        {/* ================= Bets feed ================= */}
        <aside className="lg:order-1 min-w-0 rounded-2xl bg-[#1b1c1d] border border-white/[0.06] p-2 flex flex-col h-[440px] lg:h-auto">
          <div role="tablist" aria-label="Bets" className="grid grid-cols-3 bg-[#141516] p-0.5 rounded-full border border-white/[0.06]">
            {[
              { id: 'all', label: 'All Bets' },
              { id: 'my', label: 'My Bets' },
              { id: 'top', label: 'Top' }
            ].map(t => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                onClick={() => setActiveTab(t.id)}
                className={`py-1.5 rounded-full text-xs font-bold transition-colors ${activeTab === t.id ? 'bg-[#2c2d30] text-white shadow' : 'text-zinc-400 hover:text-white'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between px-1.5 pt-2.5 pb-2 text-xs">
            {activeTab === 'all' && (
              <>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">All bets</div>
                  <div className="font-bold text-white tabular-nums">{roundBets.length}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">Total bet / won (PKR)</div>
                  <div className="font-bold tabular-nums"><span className="text-white">{fmt0(totalWagered)}</span><span className="text-zinc-500"> / </span><span className="text-[#5fd23b]">{fmt0(totalWon)}</span></div>
                </div>
              </>
            )}
            {activeTab === 'my' && <div className="text-[11px] text-zinc-400 font-semibold">Your last 30 bets</div>}
            {activeTab === 'top' && <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 font-semibold"><Trophy className="w-3.5 h-3.5 text-amber-400" /> Biggest wins this round</div>}
          </div>

          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_56px_minmax(0,1fr)] gap-1 px-2 pb-1 text-[10px] text-zinc-500 font-bold uppercase tracking-wider border-b border-white/[0.06]">
            <span>{activeTab === 'my' ? 'Time' : 'Player'}</span>
            <span className="text-right">Bet</span>
            <span className="text-center">X</span>
            <span className="text-right">Win</span>
          </div>

          <div className="relative flex-1 min-h-0">
            <div className="absolute inset-0 overflow-y-auto pt-1 space-y-1 pr-0.5">
              {view.state === 'LOADING' && activeTab !== 'my' ? (
                Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 rounded-lg bg-white/[0.03] animate-pulse" />)
              ) : listBets.length === 0 ? (
                <EmptyFeed tab={activeTab} user={user} loaded={myBetsLoaded} onLogin={() => onOpenAuth?.('login')} />
              ) : activeTab === 'my' ? (
                listBets.map(b => <MyBetRow key={b.id} b={b} />)
              ) : (
                listBets.map(b => <BetRow key={b.id} b={b} />)
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Toasts */}
      <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 w-[calc(100%-24px)] max-w-sm pointer-events-none" role="status" aria-live="polite">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold shadow-2xl border ${
              t.type === 'error' ? 'bg-[#2a0d12]/95 border-[#e50539]/40 text-rose-100' : 'bg-[#1f2023]/95 border-white/10 text-white'
            }`}
          >
            {t.type === 'error' ? <AlertCircle className="w-4 h-4 text-[#ff4d6d] shrink-0" /> : <Info className="w-4 h-4 text-sky-400 shrink-0" />}
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button type="button" onClick={t.action.fn} className="shrink-0 rounded-lg bg-[#28a909] hover:bg-[#31c00c] text-white text-xs font-bold px-2.5 py-1">
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {selectedRound && (
        <RoundModal round={selectedRound} rtp={rtp} onClose={() => setSelectedRound(null)} />
      )}

      <HowToPlayModal isOpen={showHowToPlay} onClose={() => setShowHowToPlay(false)} />
    </div>
  );
}

// ===========================================================================
// Sub components
// ===========================================================================
function Propeller({ className = '', spinning }) {
  return (
    <svg viewBox="0 0 64 64" className={`${className} ${spinning ? 'animate-propeller' : ''}`} aria-hidden="true">
      <g fill="currentColor">
        <path d="M32 29c-2-9-1-21 3-26 3 5 2 17-1 26z" />
        <path d="M34.6 33.5c8.7-2.9 20.6-1.7 25.6 2.5-5.4 2.7-17.2 1.4-25.6-2.5z" />
        <path d="M29.4 33.5c-6.8 6.2-17.6 11.3-24 10.6 3.1-5.2 13.9-10.2 24-10.6z" />
        <circle cx="32" cy="32" r="4.5" />
      </g>
      <circle cx="32" cy="32" r="2" fill="#0b0b0d" />
    </svg>
  );
}

function Pill({ h, onClick, size = 'sm' }) {
  const tier = crashTier(h);
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Round #${h.roundId}`}
      className={`shrink-0 rounded-full bg-black/45 border border-white/[0.06] font-bold tabular-nums hover:bg-black/70 transition-colors ${TIER_TEXT[tier]} ${size === 'sm' ? 'px-2.5 py-0.5 text-[11px] sm:text-xs' : 'px-3 py-1 text-xs'}`}
    >
      {h.voided ? 'VOID' : `${Number(h.crashAt).toFixed(2)}x`}
    </button>
  );
}

function HistoryBar({ history, loading, open, setOpen, onSelect }) {
  return (
    <div className="relative">
      <div className="flex items-center gap-1.5 h-8">
        <div className="relative flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {loading
              ? Array.from({ length: 10 }).map((_, i) => <div key={i} className="shrink-0 w-12 h-5 rounded-full bg-white/[0.05] animate-pulse" />)
              : history.length === 0
                ? <span className="text-[11px] text-zinc-500 px-1">No finished rounds yet</span>
                : history.slice(0, 30).map(h => <Pill key={h.roundId} h={h} onClick={() => onSelect(h)} />)}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#1b1c1d] to-transparent" />
        </div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label="Round history"
          className={`shrink-0 flex items-center gap-0.5 h-7 px-2 rounded-full border transition-colors ${open ? 'bg-[#e50539]/15 border-[#e50539]/40 text-white' : 'bg-[#2c2d30] border-white/10 text-zinc-300 hover:text-white'}`}
        >
          <History className="w-3.5 h-3.5" />
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="absolute z-30 left-0 right-0 top-full mt-1.5 rounded-xl bg-[#232427] border border-white/10 shadow-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Round history</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close history" className="text-zinc-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-zinc-500 py-3 text-center">No finished rounds yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
              {history.map(h => <Pill key={h.roundId} h={h} size="md" onClick={() => onSelect(h)} />)}
            </div>
          )}
          <p className="mt-2 text-[10px] text-zinc-500">Tap a result to see its hash, seed and verify it.</p>
        </div>
      )}
    </div>
  );
}

function MultBadge({ value }) {
  const tier = crashTier({ crashAt: Number(value) });
  return (
    <span className={`inline-block rounded-full bg-black/40 px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${TIER_TEXT[tier]}`}>
      {Number(value).toFixed(2)}x
    </span>
  );
}

function BetRow({ b }) {
  const won = b.status === 'won';
  const name = b.username || 'player';
  return (
    <div className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_56px_minmax(0,1fr)] gap-1 items-center px-2 h-8 rounded-lg text-xs ${won ? 'bg-[#123405] border border-[#427f00]' : 'bg-[#141516] border border-transparent'}`}>
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold text-white uppercase" style={{ background: avatarColor(name) }}>
          {name[0]}
        </span>
        <span className="truncate text-zinc-300">{name}</span>
      </span>
      <span className="text-right tabular-nums text-zinc-200">{fmt(b.amount)}</span>
      <span className="text-center">
        {won ? <MultBadge value={b.multiplier} /> : b.status === 'refunded' ? <span className="text-[10px] text-zinc-400">refund</span> : null}
      </span>
      <span className="text-right tabular-nums font-semibold">{won ? <span className="text-white">{fmt(b.payout)}</span> : <span className="text-zinc-600">—</span>}</span>
    </div>
  );
}

function MyBetRow({ b }) {
  const won = b.status === 'won';
  const t = b.createdAt ? new Date(b.createdAt) : null;
  return (
    <div className={`grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_56px_minmax(0,1fr)] gap-1 items-center px-2 h-8 rounded-lg text-xs ${won ? 'bg-[#123405] border border-[#427f00]' : 'bg-[#141516] border border-transparent'}`}>
      <span className="truncate text-zinc-400 tabular-nums">
        {t ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : `#${b.roundId ?? '-'}`}
      </span>
      <span className="text-right tabular-nums text-zinc-200">{fmt(b.betAmount)}</span>
      <span className="text-center">
        {won ? <MultBadge value={b.multiplier} />
          : b.status === 'refunded' ? <span className="text-[10px] text-zinc-400">refund</span>
            : b.status === 'placed' ? <span className="text-[10px] text-amber-300">live</span>
              : <span className="text-[10px] text-zinc-600">lost</span>}
      </span>
      <span className="text-right tabular-nums font-semibold">
        {won ? <span className="text-white">{fmt(b.payout)}</span> : b.status === 'refunded' ? <span className="text-zinc-400">{fmt(b.betAmount)}</span> : <span className="text-zinc-600">—</span>}
      </span>
    </div>
  );
}

function EmptyFeed({ tab, user, loaded, onLogin }) {
  if (tab === 'my' && !user) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-10 gap-2">
        <p className="text-xs text-zinc-400">Log in to see your bets.</p>
        <button type="button" onClick={onLogin} className="text-xs font-bold text-white bg-[#2c2d30] hover:bg-[#36373b] px-3 py-1.5 rounded-full">Log in</button>
      </div>
    );
  }
  if (tab === 'my' && !loaded) {
    return <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>;
  }
  const text = tab === 'my' ? 'You haven’t placed any bets yet.' : tab === 'top' ? 'No wins yet this round.' : 'No bets yet this round.';
  return <p className="text-center text-xs text-zinc-500 py-10">{text}</p>;
}

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full border transition-colors disabled:opacity-40 ${checked ? 'bg-[#28a909] border-[#5fd23b]/60' : 'bg-[#141516] border-white/15'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  );
}

function BetPanel({ panel, view, onChange, onBet, onCancel, onCashout, cashRef }) {
  const bet = panel.bet;
  const inRound = bet && !view.predicted && bet.roundId === view.roundId;
  const active = inRound && !panel.result;
  const locked = Boolean(active || panel.queued || panel.busy);

  const setAmount = (v) => onChange(p => ({ ...p, amount: v }));
  const adjust = (delta) => onChange(p => ({ ...p, amount: clamp(Math.floor((Number(p.amount) || 0) + delta), MIN_BET, MAX_BET) }));

  let action;
  let caption = null;
  if (active && view.state === 'FLYING') {
    action = (
      <button type="button" disabled={panel.busy} onClick={onCashout} className="btn-cashout w-full h-full min-h-[76px] sm:min-h-[84px] rounded-2xl flex flex-col items-center justify-center px-2">
        <span className="text-sm sm:text-base font-semibold uppercase tracking-wide">{panel.busy ? 'Cashing out…' : 'Cash Out'}</span>
        <span className="text-xl sm:text-2xl font-extrabold tabular-nums leading-tight">
          <span ref={cashRef}>{fmt(bet.amount)}</span> <span className="text-sm font-bold">PKR</span>
        </span>
      </button>
    );
  } else if (active && view.state === 'WAITING') {
    action = (
      <button type="button" disabled={panel.busy || view.closing} onClick={onCancel} className="btn-cancel w-full h-full min-h-[76px] sm:min-h-[84px] rounded-2xl flex flex-col items-center justify-center px-2">
        <span className="text-lg sm:text-xl font-extrabold uppercase tracking-wide">{panel.busy ? '…' : 'Cancel'}</span>
        <span className="text-[11px] font-semibold opacity-90 tabular-nums">{fmt(bet.amount)} PKR placed</span>
      </button>
    );
  } else if (active) {
    action = (
      <div className="w-full h-full min-h-[76px] sm:min-h-[84px] rounded-2xl bg-white/5 border border-white/10 text-zinc-300 flex items-center justify-center gap-2 text-sm font-bold">
        <Loader2 className="w-4 h-4 animate-spin" /> Settling…
      </div>
    );
  } else if (panel.queued) {
    caption = 'Waiting for next round';
    action = (
      <button type="button" disabled={panel.busy} onClick={onCancel} className="btn-cancel w-full h-full min-h-[76px] sm:min-h-[84px] rounded-2xl flex flex-col items-center justify-center px-2">
        <span className="text-lg sm:text-xl font-extrabold uppercase tracking-wide">{panel.busy ? 'Placing…' : 'Cancel'}</span>
        <span className="text-[11px] font-semibold opacity-90 tabular-nums">{fmt(panel.queued.amount)} PKR</span>
      </button>
    );
  } else {
    action = (
      <button type="button" disabled={panel.busy || view.state === 'LOADING'} onClick={onBet} className="btn-bet w-full h-full min-h-[76px] sm:min-h-[84px] rounded-2xl flex flex-col items-center justify-center px-2">
        <span className="text-lg sm:text-xl font-extrabold uppercase tracking-wide">{panel.busy ? 'Placing…' : 'Bet'}</span>
        <span className="text-sm sm:text-base font-bold tabular-nums">{fmt(Math.floor(Number(panel.amount) || 0))} PKR</span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-[#1b1c1d] border border-white/[0.06] px-2.5 sm:px-3 pt-2 pb-2.5">
      <div className="flex items-center justify-center mb-2">
        <div className="grid grid-cols-2 w-44 bg-[#141516] rounded-full p-0.5 border border-white/[0.06]" role="tablist">
          {['bet', 'auto'].map(m => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={panel.mode === m}
              onClick={() => onChange({ mode: m })}
              className={`py-1 rounded-full text-xs font-bold capitalize transition-colors ${panel.mode === m ? 'bg-[#2c2d30] text-white' : 'text-zinc-400 hover:text-white'}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-2 items-stretch">
        <div className="space-y-1.5">
          <div className={`flex items-center h-9 rounded-full bg-[#141516] border border-white/10 px-1 ${locked ? 'opacity-60' : ''}`}>
            <button type="button" aria-label="Decrease bet" disabled={locked} onClick={() => adjust(-10)} className="w-7 h-7 shrink-0 rounded-full border border-white/20 text-zinc-300 flex items-center justify-center hover:text-white disabled:opacity-40">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              type="text"
              inputMode="numeric"
              aria-label="Bet amount (PKR)"
              disabled={locked}
              value={panel.amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
              onBlur={() => setAmount(clamp(Math.floor(Number(panel.amount) || MIN_BET), MIN_BET, MAX_BET))}
              className="flex-1 min-w-0 bg-transparent text-center text-white text-base font-bold tabular-nums focus:outline-none"
            />
            <button type="button" aria-label="Increase bet" disabled={locked} onClick={() => adjust(10)} className="w-7 h-7 shrink-0 rounded-full border border-white/20 text-zinc-300 flex items-center justify-center hover:text-white disabled:opacity-40">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {CHIPS.map(c => (
              <button
                key={c}
                type="button"
                disabled={locked}
                onClick={() => { setAmount(c); soundFx.playBet(); }}
                className={`h-7 rounded-full text-xs font-semibold tabular-nums border transition-colors disabled:opacity-40 ${Number(panel.amount) === c ? 'bg-[#2c2d30] border-white/25 text-white' : 'bg-[#141516] border-white/[0.06] text-zinc-400 hover:text-white'}`}
              >
                {fmt0(c)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col">
          <div className="h-4 text-center text-[10px] font-semibold text-zinc-400 leading-4">{caption || '\u00a0'}</div>
          <div className="flex-1 flex">{action}</div>
        </div>
      </div>

      {panel.mode === 'auto' && (
        <div className="mt-2.5 pt-2.5 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-zinc-300 font-semibold">
            <Toggle label="Auto bet" checked={panel.autoBet} onChange={(v) => onChange({ autoBet: v })} />
            Auto bet
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-zinc-300 font-semibold">
              <Toggle label="Auto cash out" checked={panel.autoCashEnabled} disabled={locked} onChange={(v) => onChange({ autoCashEnabled: v })} />
              Auto cash out
            </label>
            <div className={`flex items-center h-7 rounded-full bg-[#141516] border border-white/10 px-2.5 ${panel.autoCashEnabled && !locked ? '' : 'opacity-50'}`}>
              <input
                type="text"
                inputMode="decimal"
                aria-label="Auto cash out multiplier"
                disabled={!panel.autoCashEnabled || locked}
                value={panel.autoCashValue}
                onChange={(e) => onChange({ autoCashValue: e.target.value.replace(/[^\d.]/g, '').slice(0, 7) })}
                onBlur={() => {
                  const v = clamp(Number(panel.autoCashValue) || 1.01, 1.01, 1000);
                  onChange({ autoCashValue: v.toFixed(2) });
                }}
                className="w-12 bg-transparent text-right text-white text-sm font-bold tabular-nums focus:outline-none"
              />
              <span className="text-zinc-400 text-sm font-bold ml-0.5">x</span>
            </div>
          </div>
        </div>
      )}
      {panel.mode === 'bet' && panel.autoCashEnabled && (
        <div className="mt-1.5 text-center text-[10px] text-zinc-500">Auto cash out at <span className="text-zinc-300 font-bold tabular-nums">{Number(panel.autoCashValue).toFixed(2)}x</span></div>
      )}
    </div>
  );
}

function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy"
      onClick={() => { navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }).catch(() => {}); }}
      className="shrink-0 p-1 rounded text-zinc-400 hover:text-white hover:bg-white/5"
    >
      {ok ? <Check className="w-3.5 h-3.5 text-[#5fd23b]" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function RoundModal({ round, rtp, onClose }) {
  const [check, setCheck] = useState(null);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState('');
  const edge = typeof rtp === 'number' ? 100 - rtp : 3;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = useCallback(async () => {
    if (!round.seed) return;
    setChecking(true);
    setErr('');
    try {
      setCheck(await verifyRound({ seed: round.seed, hash: round.hash, edge, crashAt: round.crashAt, voided: round.voided }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setChecking(false);
    }
  }, [round, edge]);

  useEffect(() => { run(); }, [run]);

  const tier = crashTier(round);
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Round ${round.roundId}`} className="w-full sm:max-w-lg bg-[#1b1c1d] border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-bold">Round #{round.roundId}</div>
            {!round.live ? (
              <div className={`text-3xl font-extrabold tabular-nums ${TIER_TEXT[tier]}`}>
                {round.voided ? 'Voided (refunded)' : `${Number(round.crashAt).toFixed(2)}x`}
              </div>
            ) : (
              <div className="text-lg font-bold text-white">Current round</div>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="rounded-xl bg-[#141516] border border-white/[0.06] p-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Hash (published before the round)</div>
            <div className="flex items-start gap-2"><code className="flex-1 break-all text-zinc-200 select-text">{round.hash}</code><CopyBtn text={round.hash || ''} /></div>
          </div>
          <div className="rounded-xl bg-[#141516] border border-white/[0.06] p-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Seed (revealed after the crash)</div>
            {round.seed
              ? <div className="flex items-start gap-2"><code className="flex-1 break-all text-[#5fd23b] select-text">{round.seed}</code><CopyBtn text={round.seed} /></div>
              : <div className="text-zinc-400">The seed is revealed when this round ends.</div>}
          </div>
        </div>

        {round.seed && (
          <div className="rounded-xl border border-white/[0.08] p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">Verified in your browser</span>
              {checking && <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />}
            </div>
            {err && <div className="text-rose-300">{err}</div>}
            {check && (
              <>
                <div className="flex items-center gap-1.5">
                  {check.hashOk ? <CheckCircle2 className="w-4 h-4 text-[#5fd23b]" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
                  <span className={check.hashOk ? 'text-zinc-200' : 'text-rose-300'}>sha256(seed) {check.hashOk ? 'matches' : 'does NOT match'} the published hash</span>
                </div>
                {!round.voided && (
                  <div className="flex items-center gap-1.5">
                    {check.crashOk ? <CheckCircle2 className="w-4 h-4 text-[#5fd23b]" /> : <AlertCircle className="w-4 h-4 text-amber-400" />}
                    <span className="text-zinc-200">
                      Formula result: <b className="tabular-nums">{check.computedCrash.toFixed(2)}x</b>
                      {check.crashOk ? ' — matches' : ` (house edge ${edge}% assumed; differs if the edge was changed for this round)`}
                    </span>
                  </div>
                )}
                {round.voided && <div className="text-zinc-400">This round was stopped by the operator; all open bets were refunded.</div>}
              </>
            )}
          </div>
        )}

        <p className="text-[11px] text-zinc-500 leading-relaxed">
          crash = floor(((100 − edge) / 100) / (1 − r) × 100) / 100, where r = first 13 hex chars of
          HMAC_SHA256(key = seed, "skywin-aviator-crash") ÷ 2^52. The server cannot change a round after its hash is published.
        </p>
      </div>
    </div>
  );
}
