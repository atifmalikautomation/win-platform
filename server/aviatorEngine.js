// ============================================================================
//  SKYWIN AVIATOR ENGINE — one global round for every player
// ----------------------------------------------------------------------------
//  Why this exists:
//  On Vercel every request can land on a different serverless instance. The old
//  engine kept the round in each instance's memory, so different players saw
//  different rounds (one crashed at 2x, another at 7x).
//
//  How it works now:
//  * The whole schedule is a pure function of (time, control document).
//    Every instance computes exactly the same round, multiplier and crash point.
//  * The control document (anchor, emergency stops, pause, house edge) lives in
//    ONE small blob file, separate from the user database, so it never clobbers
//    balances.
//  * Crash points are provably fair: seed = HMAC(secret, roundId); players get
//    sha256(seed) before the round and the seed after it crashes.
//  * The admin cannot pick or force a crash point. Admin tools are limited to
//    an Emergency Stop (round voided, all open bets refunded), Pause/Resume, and
//    a publicly displayed house edge for future rounds.
// ============================================================================
const crypto = require('crypto');
const db = require('./db');

// Stored in Postgres (kv table). The old Vercel Blob copy was CDN-cached, so
// instances could read a stale control document and drift apart.
const CONTROL_KEY = 'aviator-control';
const BETTING_MS = 6000;          // betting window before take-off
const POST_CRASH_MS = 3500;       // "flew away" screen before next round
const GROWTH = 0.09;              // multiplier = e^(GROWTH * seconds)  (2x ≈ 7.7s, 10x ≈ 25.6s)
const MAX_CRASH = 1000;
const DEFAULT_EDGE = 3;           // % (RTP 97%)
const HISTORY_SIZE = 30;
const CONTROL_TTL_MS = 1500;      // how often an instance re-reads the control blob
const REBASE_AFTER_MS = 6 * 60 * 60 * 1000;
const GENESIS = { roundId: 1, startTime: Date.UTC(2026, 9, 10, 0, 0, 0) };

const SECRET = process.env.AVIATOR_SECRET
  || process.env.JWT_SECRET
  || (process.env.VERCEL ? null : 'local-dev-only-aviator-secret');
if (!SECRET) {
  console.error('AVIATOR_SECRET is not configured. Set it in the Vercel environment.');
}

// ---------------------------------------------------------------- math helpers
function multiplierAt(elapsedMs) {
  if (elapsedMs <= 0) return 1.0;
  return Math.floor(Math.exp(GROWTH * elapsedMs / 1000) * 100) / 100;
}

function flightDurationMs(crashAt) {
  if (crashAt <= 1.0) return 0;
  return Math.ceil(Math.log(crashAt) / GROWTH * 1000);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function roundSeed(roundId) {
  return crypto.createHmac('sha256', SECRET || 'unset').update(`skywin-aviator-round-${roundId}`).digest('hex');
}

// Public, verifiable formula
function crashFromSeed(seed, edge) {
  const h = crypto.createHmac('sha256', seed).update('skywin-aviator-crash').digest('hex');
  const r = parseInt(h.slice(0, 13), 16) / Math.pow(2, 52); // [0, 1)
  const m = ((100 - edge) / 100) / (1 - r);
  return Math.min(MAX_CRASH, Math.max(1.0, Math.floor(m * 100) / 100));
}

// ---------------------------------------------------------------- control doc
function defaultControl() {
  return {
    version: 0,
    anchor: { roundId: GENESIS.roundId, startTime: GENESIS.startTime, history: [] },
    overrides: {},          // { [roundId]: { type: 'stop', stoppedAt } }
    edges: [{ fromRound: 0, edge: DEFAULT_EDGE }],
    pauseAfterRound: null,
    updatedAt: null
  };
}

function normalize(doc) {
  const base = defaultControl();
  const c = { ...base, ...doc };
  c.anchor = { ...base.anchor, ...(doc.anchor || {}) };
  if (!Array.isArray(c.anchor.history)) c.anchor.history = [];
  if (!c.overrides || typeof c.overrides !== 'object') c.overrides = {};
  if (!Array.isArray(c.edges) || c.edges.length === 0) c.edges = base.edges;
  c.edges = [...c.edges].sort((a, b) => a.fromRound - b.fromRound);
  return c;
}

let control = defaultControl();
let controlLoadedAt = 0;
let controlLoaded = false;
let inflightLoad = null;
let lastRebaseAttempt = 0;

let cursor = null;                 // walking position + rolling history
const recentResults = new Map();   // roundId -> { crashAt, voided, crashTime }

function resetCursor() {
  cursor = null;
}

async function loadControl(force = false) {
  if (!force && controlLoaded && Date.now() - controlLoadedAt < CONTROL_TTL_MS) return control;
  if (inflightLoad) return inflightLoad;
  inflightLoad = (async () => {
    let doc = null;
    let ok = false;
    try {
      doc = await db.kvGet(CONTROL_KEY);
      ok = true;
    } catch (e) {
      console.error('Aviator control read failed:', e.message);
    }
    if (ok && doc && doc.anchor) {
      if (!controlLoaded || doc.version !== control.version) {
        control = normalize(doc);
        resetCursor();
      }
    } else if (ok && !doc && !controlLoaded) {
      control = defaultControl();
      resetCursor();
    }
    controlLoaded = controlLoaded || ok;
    controlLoadedAt = Date.now();
    return control;
  })();
  try {
    return await inflightLoad;
  } finally {
    inflightLoad = null;
  }
}

// ---------------------------------------------------------------- scheduling
function edgeFor(roundId) {
  let edge = DEFAULT_EDGE;
  for (const e of control.edges) {
    if (roundId >= e.fromRound) edge = e.edge;
  }
  return edge;
}

function roundPlan(roundId, startTime) {
  const seed = roundSeed(roundId);
  const ov = control.overrides[roundId];
  let flightStart = startTime + BETTING_MS;
  let crashAt;
  let crashTime;
  let voided = false;

  if (ov && ov.type === 'stop') {
    voided = true;
    if (ov.stoppedAt <= flightStart) {
      flightStart = Math.max(startTime, ov.stoppedAt);
      crashTime = flightStart;
      crashAt = 1.0;
    } else {
      crashTime = ov.stoppedAt;
      crashAt = multiplierAt(crashTime - flightStart);
    }
  } else {
    crashAt = crashFromSeed(seed, edgeFor(roundId));
    crashTime = flightStart + flightDurationMs(crashAt);
  }

  return {
    roundId,
    startTime,
    flightStart,
    crashTime,
    endTime: crashTime + POST_CRASH_MS,
    crashAt,
    voided,
    seed,
    hash: sha256(seed),
    edge: edgeFor(roundId)
  };
}

function historyEntry(plan) {
  return { roundId: plan.roundId, crashAt: plan.crashAt, voided: plan.voided, hash: plan.hash, seed: plan.seed };
}

function remember(plan) {
  recentResults.set(plan.roundId, { crashAt: plan.crashAt, voided: plan.voided, crashTime: plan.crashTime });
  if (recentResults.size > 400) {
    const oldest = recentResults.keys().next().value;
    recentResults.delete(oldest);
  }
}

// Walk the schedule forward until the round that contains `now`.
function locate(now) {
  if (!cursor || cursor.version !== control.version || cursor.start > now) {
    cursor = {
      version: control.version,
      id: control.anchor.roundId,
      start: control.anchor.startTime,
      history: control.anchor.history.slice(0, HISTORY_SIZE)
    };
  }
  for (let guard = 0; guard < 5000000; guard++) {
    if (control.pauseAfterRound != null && cursor.id > control.pauseAfterRound) {
      return { paused: true, plan: null };
    }
    const plan = roundPlan(cursor.id, cursor.start);
    if (now >= plan.crashTime) remember(plan);
    if (now < plan.endTime) return { paused: false, plan };
    cursor.history.unshift(historyEntry(plan));
    if (cursor.history.length > HISTORY_SIZE) cursor.history.length = HISTORY_SIZE;
    cursor.id += 1;
    cursor.start = plan.endTime;
  }
  throw new Error('Aviator schedule walk overflow');
}

function stateAt(now = Date.now()) {
  const { paused, plan } = locate(now);
  if (paused) {
    return { paused: true, state: 'PAUSED', roundId: cursor.id, history: cursor.history.slice(0, HISTORY_SIZE) };
  }
  let state;
  if (now < plan.flightStart) state = 'WAITING';
  else if (now < plan.crashTime) state = 'FLYING';
  else state = 'CRASHED';
  return { paused: false, state, plan, history: cursor.history.slice(0, HISTORY_SIZE) };
}

// Result of a finished round (for settling bets). null = not finished / unknown.
function getRoundResult(roundId, now = Date.now()) {
  stateAt(now); // make sure the walk is up to date
  if (recentResults.has(roundId)) return recentResults.get(roundId);
  const fromHistory = (cursor?.history || []).find(h => h.roundId === roundId);
  if (fromHistory) return { crashAt: fromHistory.crashAt, voided: fromHistory.voided };
  if (roundId >= control.anchor.roundId && roundId < (cursor?.id || 0)) {
    // Recompute by walking from the anchor (rare).
    let id = control.anchor.roundId;
    let start = control.anchor.startTime;
    while (id <= roundId) {
      const p = roundPlan(id, start);
      if (id === roundId) return { crashAt: p.crashAt, voided: p.voided, crashTime: p.crashTime };
      id += 1;
      start = p.endTime;
    }
  }
  return null;
}

// Public JSON for players (never leaks the crash point of a live round).
function publicState(now = Date.now()) {
  const s = stateAt(now);
  const history = s.history.map(h => ({
    roundId: h.roundId, crashAt: h.crashAt, voided: !!h.voided, hash: h.hash, seed: h.seed
  }));
  const base = {
    serverTime: now,
    state: s.state,
    growth: GROWTH,
    bettingMs: BETTING_MS,
    rtp: 100 - edgeFor(s.plan ? s.plan.roundId : cursor.id),
    history
  };
  if (s.paused) return { ...base, roundId: s.roundId, paused: true };

  const p = s.plan;
  const out = {
    ...base,
    roundId: p.roundId,
    hash: p.hash,
    startTime: p.startTime,
    flightStart: p.flightStart,
    countdown: s.state === 'WAITING' ? Math.max(0, (p.flightStart - now) / 1000) : 0,
    multiplier: s.state === 'WAITING' ? 1.0 : s.state === 'FLYING' ? multiplierAt(now - p.flightStart) : p.crashAt
  };
  if (s.state === 'CRASHED') {
    out.crashAt = p.crashAt;
    out.crashTime = p.crashTime;
    out.voided = p.voided;
    out.seed = p.seed;
    out.nextRoundAt = p.endTime;
  }
  return out;
}

// ---------------------------------------------------------------- admin writes
async function mutateControl(mutator) {
  await loadControl(true);
  const now = Date.now();
  const s = stateAt(now);
  const next = normalize(JSON.parse(JSON.stringify(control)));

  // Re-anchor at the current round so future walks stay short and history survives.
  if (!s.paused && s.plan) {
    next.anchor = { roundId: s.plan.roundId, startTime: s.plan.startTime, history: s.history.slice(0, HISTORY_SIZE) };
  }
  const result = mutator(next, s, now);
  // Drop overrides that are older than the anchor.
  Object.keys(next.overrides).forEach(k => {
    if (Number(k) < next.anchor.roundId) delete next.overrides[k];
  });
  next.edges = next.edges.slice(-6);
  next.version = now;
  next.updatedAt = new Date(now).toISOString();

  try {
    await db.kvSet(CONTROL_KEY, next);
  } catch (e) {
    throw new Error('Could not save Aviator control. Please try again.');
  }
  control = next;
  controlLoaded = true;
  controlLoadedAt = Date.now();
  resetCursor();
  return result;
}

// Emergency stop: ends the current round now. Every open bet in it is refunded.
async function emergencyStop() {
  return mutateControl((c, s, now) => {
    if (s.paused || !s.plan) throw new Error('Game is paused, there is no running round.');
    if (s.state === 'CRASHED') throw new Error('This round has already finished.');
    c.overrides[s.plan.roundId] = { type: 'stop', stoppedAt: now };
    return { roundId: s.plan.roundId, stoppedDuring: s.state };
  });
}

// Pause after the current round finishes.
async function pause() {
  return mutateControl((c, s) => {
    if (s.paused) throw new Error('Game is already paused.');
    c.pauseAfterRound = s.plan.roundId;
    return { pauseAfterRound: s.plan.roundId };
  });
}

async function resume() {
  return mutateControl((c, s, now) => {
    if (control.pauseAfterRound == null) throw new Error('Game is not paused.');
    const nextId = control.pauseAfterRound + 1;
    const startTime = s.paused ? now : Math.max(now, s.plan.endTime);
    c.anchor = { roundId: nextId, startTime, history: s.history.slice(0, HISTORY_SIZE) };
    c.pauseAfterRound = null;
    return { nextRoundId: nextId };
  });
}

// House edge for FUTURE rounds only (shown publicly as RTP).
async function setHouseEdge(edge) {
  const e = Number(edge);
  if (!(e >= 1 && e <= 10)) throw new Error('House edge must be between 1% and 10%.');
  return mutateControl((c, s) => {
    const fromRound = (s.plan ? s.plan.roundId : cursor.id) + 1;
    c.edges = c.edges.filter(x => x.fromRound < fromRound);
    c.edges.push({ fromRound, edge: e });
    return { fromRound, edge: e };
  });
}

// Keep the walk short: re-anchor occasionally (does not change any outcome).
async function maybeRebase() {
  const now = Date.now();
  if (now - control.anchor.startTime < REBASE_AFTER_MS) return;
  if (now - lastRebaseAttempt < 10 * 60 * 1000) return;
  lastRebaseAttempt = now;
  try {
    await mutateControl(() => null);
  } catch (e) {
    console.warn('Aviator rebase skipped:', e.message);
  }
}

async function getLiveState() {
  await loadControl(false);
  await maybeRebase();
  return publicState(Date.now());
}

function adminInfo() {
  return {
    pauseAfterRound: control.pauseAfterRound,
    houseEdge: edgeFor((cursor?.id || 0) + 1),
    edges: control.edges,
    updatedAt: control.updatedAt
  };
}

module.exports = {
  BETTING_MS,
  GROWTH,
  loadControl,
  stateAt,
  publicState,
  getLiveState,
  getRoundResult,
  multiplierAt,
  flightDurationMs,
  crashFromSeed,
  roundSeed,
  emergencyStop,
  pause,
  resume,
  setHouseEdge,
  adminInfo,
  _resetForTests: () => { control = defaultControl(); controlLoaded = false; resetCursor(); recentResults.clear(); }
};
