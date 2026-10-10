const express = require('express');
const { authenticateToken } = require('./auth');
const db = require('../db');
const engine = require('../aviatorEngine');

const router = express.Router();

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
}

function limits() {
  const s = db.getGameSettings();
  return { minBet: Number(s.minBet) || 10, maxBet: Number(s.maxBet) || 50000 };
}

// 1. Public live round (same for every player on every server instance)
router.get('/live', async (req, res) => {
  noStore(res);
  try {
    const live = await engine.getLiveState();
    // Real bets of this round (no fake bots). Uses the cached DB (refreshed ≤ ~1s).
    try {
      if (db.syncWithCloud) await db.syncWithCloud(false);
      live.bets = live.roundId ? db.getRoundBetsPublic(live.roundId) : [];
    } catch (e) {
      live.bets = [];
    }
    res.json(live);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. My bets + settlement of finished rounds (also returns fresh balance)
router.get('/my-bets', authenticateToken, async (req, res) => {
  noStore(res);
  try {
    await engine.loadControl(false);
    const balance = await db.settleUserAviatorBets(req.user.id, id => engine.getRoundResult(id));
    res.json({ balance, bets: db.getUserAviatorBets(req.user.id, 30) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Place bet (only during the betting countdown of the current round)
router.post('/bet', authenticateToken, async (req, res) => {
  noStore(res);
  try {
    const settings = db.getGameSettings();
    if (settings.maintenance) return res.status(503).json({ error: 'Game is under maintenance' });

    await engine.loadControl(true);
    const now = Date.now();
    const s = engine.stateAt(now);
    if (s.paused) return res.status(400).json({ error: 'Game is paused. Please wait for the next round.' });
    if (s.state !== 'WAITING' || now > s.plan.flightStart - 300) {
      return res.status(400).json({ error: 'Bets are only accepted before take-off. Wait for the next round.' });
    }

    const { amount, autoCashout } = req.body || {};
    const { minBet, maxBet } = limits();
    const result = await db.placeBetTransaction({
      userId: req.user.id,
      betAmount: amount,
      autoCashout,
      roundId: s.plan.roundId,
      getRoundResult: id => engine.getRoundResult(id),
      minBet,
      maxBet
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
