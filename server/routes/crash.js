const express = require('express');
const { authenticateToken } = require('./auth');
const db = require('../db');
const engine = require('../aviatorEngine');

const router = express.Router();

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const WAIT_MAX_MS = 8000;

// Opportunistic global settlement (auto cash-outs, refunds, losses) so balances
// are correct even for players who closed the tab. Throttled per instance; the
// SQL itself is idempotent, so concurrent instances are safe.
let lastSettle = 0;
let settling = null;
function settleInBackground(currentRoundId) {
  if (settling || Date.now() - lastSettle < 2500) return settling;
  lastSettle = Date.now();
  settling = db.settleFinishedRounds(id => engine.getRoundResult(id), currentRoundId)
    .catch(err => console.error('settle failed:', err.message))
    .finally(() => { settling = null; });
  return settling;
}

async function livePayload({ betsPromise = null, deferSettle = false } = {}) {
  // deferSettle = waitCrash path: control was just loaded, answer without extra round-trips.
  const live = deferSettle ? engine.publicState(Date.now()) : await engine.getLiveState();
  try {
    live.bets = live.roundId ? await (betsPromise || db.getRoundBetsPublic(live.roundId)) : [];
  } catch (e) {
    live.bets = [];
  }
  if (live.state === 'CRASHED' || live.state === 'WAITING') {
    const p = settleInBackground(live.roundId);
    if (deferSettle) runAfterResponse(p);
    else await p;
  }
  return live;
}

// Keep the serverless function alive for background work after responding.
let waitUntil = null;
try { ({ waitUntil } = require('@vercel/functions')); } catch (e) {}
function runAfterResponse(promise) {
  if (!promise) return;
  if (waitUntil) {
    try { waitUntil(promise); return; } catch (e) {}
  }
  promise.catch(() => {});
}

// 1. Public live round (identical for every player on every server instance).
//    ?waitCrash=<roundId> holds the request while that round is flying and
//    answers the moment it crashes (or after ~8s / emergency stop), so clients
//    show the crash with network latency only, without knowing it in advance.
router.get('/live', async (req, res) => {
  noStore(res);
  try {
    const waitRound = Number(req.query.waitCrash);
    if (Number.isFinite(waitRound) && waitRound > 0) {
      await engine.loadControl(false);
      const deadline = Date.now() + WAIT_MAX_MS;
      let betsPromise = null;
      for (;;) {
        const s = engine.stateAt(Date.now());
        if (s.paused || !s.plan || s.plan.roundId !== waitRound || s.state !== 'FLYING') break;
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        const untilCrash = s.plan.crashTime - Date.now();
        if (untilCrash <= 400 && !betsPromise) {
          // Prefetch the feed so the response leaves right at the crash.
          betsPromise = new Promise(r => setTimeout(r, Math.max(0, untilCrash - 150)))
            .then(() => db.getRoundBetsPublic(waitRound));
          betsPromise.catch(() => {});
        }
        await sleep(Math.max(1, Math.min(untilCrash, remaining, 1000)));
        if (Date.now() < s.plan.crashTime - 5) await engine.loadControl(false); // emergency stop within ~1.5s
      }
      const s = engine.stateAt(Date.now());
      const usePrefetch = betsPromise && s.plan && s.plan.roundId === waitRound;
      return res.json(await livePayload({ betsPromise: usePrefetch ? betsPromise : null, deferSettle: true }));
    }
    res.json(await livePayload());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. My bets + settlement of my finished rounds (also returns fresh balance)
router.get('/my-bets', authenticateToken, async (req, res) => {
  noStore(res);
  try {
    await engine.loadControl(false);
    const s = engine.stateAt(Date.now());
    const currentRoundId = s.plan ? s.plan.roundId : s.roundId;
    await db.settleFinishedRounds(id => engine.getRoundResult(id), currentRoundId, { userId: req.user.id });
    const [balance, bets] = await Promise.all([
      db.getUserBalance(req.user.id),
      db.getUserAviatorBets(req.user.id, 30)
    ]);
    res.json({ balance, bets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Place bet (only during the betting countdown of the current round)
router.post('/bet', authenticateToken, async (req, res) => {
  noStore(res);
  try {
    const settings = await db.getGameSettings();
    if (settings.maintenance) return res.status(503).json({ error: 'Game is under maintenance' });

    await engine.loadControl(true);
    const now = Date.now();
    const s = engine.stateAt(now);
    if (s.paused) return res.status(400).json({ error: 'Game is paused. Please wait for the next round.' });
    if (s.state !== 'WAITING' || now > s.plan.flightStart - 300) {
      return res.status(400).json({ error: 'Bets are only accepted before take-off. Wait for the next round.' });
    }

    const { amount, autoCashout } = req.body || {};
    const result = await db.placeBetTransaction({
      userId: req.user.id,
      betAmount: amount,
      autoCashout,
      roundId: s.plan.roundId,
      minBet: Number(settings.minBet) || 10,
      maxBet: Number(settings.maxBet) || 50000
    });
    res.json({ success: true, bet: result.bet, newBalance: result.newBalance });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Cancel bet (only before take-off)
router.post('/cancel-bet', authenticateToken, async (req, res) => {
  noStore(res);
  try {
    const { betId } = req.body || {};
    if (!betId) return res.status(400).json({ error: 'Bet ID is required' });

    await engine.loadControl(true);
    const now = Date.now();
    const s = engine.stateAt(now);
    if (s.paused || s.state !== 'WAITING' || now > s.plan.flightStart - 300) {
      return res.status(400).json({ error: 'Bets can only be cancelled before take-off' });
    }
    const result = await db.cancelBetTransaction({ userId: req.user.id, betId, roundId: s.plan.roundId });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. Cash out — the SERVER decides the multiplier from its own clock.
router.post('/cashout', authenticateToken, async (req, res) => {
  noStore(res);
  try {
    const { betId, multiplier } = req.body || {};
    if (!betId) return res.status(400).json({ error: 'Bet ID is required' });

    const receivedAt = Date.now();
    await engine.loadControl(true); // fresh: an emergency stop must be respected
    const s = engine.stateAt(receivedAt);
    if (s.paused || !s.plan || s.state !== 'FLYING') {
      return res.status(400).json({ error: 'Too late — the plane has already flown away' });
    }

    const serverMult = engine.multiplierAt(receivedAt - s.plan.flightStart);
    if (serverMult >= s.plan.crashAt) {
      return res.status(400).json({ error: 'Too late — the plane has already flown away' });
    }
    // Client may ask for a LOWER value (auto cash-out target); never higher than the server clock.
    const requested = Number(multiplier);
    const finalMult = Number.isFinite(requested) && requested >= 1.01 ? Math.min(requested, serverMult) : serverMult;

    const result = await db.cashoutBetTransaction({
      userId: req.user.id,
      betId,
      roundId: s.plan.roundId,
      multiplier: finalMult
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Verify any finished round (provably fair)
router.get('/verify/:roundId', async (req, res) => {
  try {
    await engine.loadControl(false);
    const id = Number(req.params.roundId);
    const live = engine.publicState();
    const entry = (live.history || []).find(h => h.roundId === id) || (live.roundId === id && live.seed ? live : null);
    if (!entry) return res.status(404).json({ error: 'Round not finished or too old' });
    res.json({
      roundId: id,
      seed: entry.seed,
      hash: entry.hash,
      crashAt: entry.crashAt,
      voided: !!entry.voided,
      formula: "r = int(HMAC_SHA256(key=seed, 'skywin-aviator-crash')[0:13], 16) / 2^52; crash = floor(((100-edge)/100)/(1-r) * 100) / 100 (min 1.00); sha256(seed) must equal hash"
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.router = router;
