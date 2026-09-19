const express = require('express');
const crypto = require('crypto');
const { authenticateToken } = require('./auth');
const db = require('../db');

const router = express.Router();

// Active crash bets in-memory map for fast lookup
const activeCrashBets = new Map();

// ==================== GLOBALLY SYNCHRONIZED AVIATOR ROUND ENGINE ====================
let currentRound = null;
let roundHistory = [1.45, 2.80, 1.10, 14.50, 3.20, 1.95, 5.80, 1.05, 32.10, 2.15, 8.40, 1.72];
const AVIATOR_SALT = 'skywin_provably_fair_salt_v2_2026';

function getDeterministicMultiplier(roundId, mode, forcedMult) {
  if (forcedMult && Number(forcedMult) >= 1.01) {
    return parseFloat(Number(forcedMult).toFixed(2));
  }

  // High-dispersion SHA-256 HMAC ensures completely dynamic & wide-range crash multipliers (like real Spribe Aviator)
  const hmac = crypto.createHmac('sha256', AVIATOR_SALT);
  hmac.update(`round_${roundId}_fair_seed`);
  const hex = hmac.digest('hex');
  const hexSample = parseInt(hex.substring(0, 8), 16);
  const rand = hexSample / 0xffffffff;

  if (mode === 'house_win') {
    return parseFloat((1.01 + rand * 0.24).toFixed(2));
  }
  if (mode === 'high_run') {
    return parseFloat((10.0 + rand * 75.0).toFixed(2));
  }

  // 4% instant bust at 1.00x
  if (rand < 0.04) return 1.00;

  // Provably fair inverse distribution curve (96% RTP)
  const mult = 0.96 / (1.0 - rand);
  return Math.min(250.0, Math.max(1.01, parseFloat(mult.toFixed(2))));
}

function getFlightDurationMs(mult) {
  if (mult <= 1.00) return 100;
  const sec = Math.log(mult) / (0.072 * 1.65);
  return Math.round(sec * 1000);
}

function getOrUpdateLiveRound() {
  const now = Date.now();
  const settings = db.getGameSettings();

  // Load active crash round from db settings if available
  if (!currentRound && settings.activeCrashRound && settings.activeCrashRound.roundId) {
    currentRound = settings.activeCrashRound;
  }

  // 1. If emergency crash was triggered while round is flying
  if (currentRound && currentRound.state === 'FLYING' && settings.crashNowTriggered && settings.crashNowTriggered > (currentRound.crashNowHandled || 0)) {
    currentRound.crashNowHandled = settings.crashNowTriggered;
    currentRound.crashTime = now;
    currentRound.nextRoundStartTime = now + 3500;
    const elapsedSec = Math.max(0.1, (now - currentRound.flightStartTime) / 1000);
    const curM = Math.max(1.01, parseFloat(Math.pow(Math.E, 0.072 * elapsedSec * 1.65).toFixed(2)));
    currentRound.crashedAt = curM;
    currentRound.multiplier = curM;
    currentRound.state = 'CRASHED';
    roundHistory.unshift(curM);
    if (roundHistory.length > 20) roundHistory.pop();
    currentRound.history = roundHistory.slice(0, 12);
    currentRound.serverTime = now;
    settings.activeCrashRound = currentRound;
    db.updateGameSettings({ activeCrashRound: currentRound }).catch(() => {});
    return currentRound;
  }

  // 2. Advance rounds if needed
  if (!currentRound || now >= currentRound.nextRoundStartTime) {
    if (!currentRound) {
      const roundCounter = 1001;
      const startTime = now;
      const flightStartTime = startTime + 5000;
      const mult = getDeterministicMultiplier(roundCounter, settings.aviatorMode, settings.forcedNextMultiplier);
      if (settings.forcedNextMultiplier) {
        db.updateGameSettings({ forcedNextMultiplier: null }).catch(() => {});
      }
      const crashTime = flightStartTime + getFlightDurationMs(mult);
      const nextRoundStartTime = crashTime + 3500;
      currentRound = {
        roundId: roundCounter,
        startTime,
        flightStartTime,
        crashTime,
        nextRoundStartTime,
        crashedAt: mult,
        crashNowHandled: 0
      };
    } else {
      while (now >= currentRound.nextRoundStartTime) {
        // Record the previous completed round in history if not already recorded
        if (currentRound.crashedAt && (!roundHistory.includes(currentRound.crashedAt) || roundHistory[0] !== currentRound.crashedAt)) {
          roundHistory.unshift(currentRound.crashedAt);
          if (roundHistory.length > 20) roundHistory.pop();
        }

        currentRound.roundId = (currentRound.roundId || 1000) + 1;
        currentRound.startTime = currentRound.nextRoundStartTime;
        currentRound.flightStartTime = currentRound.startTime + 5000;
        const mult = getDeterministicMultiplier(currentRound.roundId, settings.aviatorMode, settings.forcedNextMultiplier);
        if (settings.forcedNextMultiplier) {
          settings.forcedNextMultiplier = null;
          db.updateGameSettings({ forcedNextMultiplier: null }).catch(() => {});
        }
        currentRound.crashedAt = mult;
        currentRound.crashTime = currentRound.flightStartTime + getFlightDurationMs(mult);
        currentRound.nextRoundStartTime = currentRound.crashTime + 3500;
        currentRound.crashNowHandled = 0;
        // NOTE: mult is NOT added to history here! It must only appear after the round crashes!
      }
    }
    settings.activeCrashRound = currentRound;
    db.updateGameSettings({ activeCrashRound: currentRound }).catch(() => {});
  }

  // 3. Derive exact state from synchronized timestamp
  if (now < currentRound.flightStartTime) {
    currentRound.state = 'WAITING';
    currentRound.countdown = parseFloat(((currentRound.flightStartTime - now) / 1000).toFixed(1));
    currentRound.multiplier = 1.00;
  } else if (now < currentRound.crashTime) {
    currentRound.state = 'FLYING';
    const elapsedSec = (now - currentRound.flightStartTime) / 1000;
    const curM = parseFloat(Math.pow(Math.E, 0.072 * elapsedSec * 1.65).toFixed(2));
    currentRound.multiplier = Math.min(currentRound.crashedAt, curM);
    currentRound.countdown = 0;
  } else {
    // Round has crashed!
    currentRound.state = 'CRASHED';
    currentRound.multiplier = currentRound.crashedAt;
    currentRound.countdown = 0;
    // Add to history ONLY when actually crashed
    if (!roundHistory.includes(currentRound.crashedAt) || roundHistory[0] !== currentRound.crashedAt) {
      roundHistory.unshift(currentRound.crashedAt);
      if (roundHistory.length > 20) roundHistory.pop();
    }
  }

  // Ensure history NEVER leaks the active round before it actually crashes
  let safeHistory = roundHistory;
  if (currentRound.state !== 'CRASHED' && roundHistory.length > 0 && roundHistory[0] === currentRound.crashedAt) {
    safeHistory = roundHistory.slice(1);
  }

  currentRound.serverTime = now;
  currentRound.history = safeHistory.slice(0, 12);
  currentRound.onlinePlayers = 1820 + (currentRound.roundId % 75);
  return currentRound;
}

// 1. Get Live Synchronized Aviator Round (Public endpoint for all clients & admin)
router.get('/live', (req, res) => {
  try {
    const liveState = getOrUpdateLiveRound();
    res.json(liveState);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Crash Game Controls & State
router.get('/control', (req, res) => {
  try {
    const settings = db.getGameSettings();
    const live = getOrUpdateLiveRound();
    res.json({
      aviatorMode: settings.aviatorMode || 'fair',
      forcedNextMultiplier: settings.forcedNextMultiplier || null,
      crashNowTriggered: settings.crashNowTriggered || 0,
      houseEdge: settings.houseEdge || 4,
      minBet: settings.minBet || 10,
      maxBet: settings.maxBet || 50000,
      liveState: live
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Consume forced next multiplier after it has been used in a round
router.post('/consume-forced', async (req, res) => {
  try {
    const settings = db.getGameSettings();
    if (settings.forcedNextMultiplier) {
      await db.updateGameSettings({ forcedNextMultiplier: null });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Place Crash Bet
router.post('/bet', authenticateToken, async (req, res) => {
  try {
    const { amount, autoCashout } = req.body;
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount < 10) {
      return res.status(400).json({ error: 'Minimum bet is PKR 10' });
    }

    const result = await db.placeBetTransaction({
      userId: req.user.id,
      username: req.user.username,
      betAmount: numAmount,
      autoCashout
    });

    activeCrashBets.set(result.bet.id, result.bet);

    res.json({
      success: true,
      bet: result.bet,
      newBalance: result.newBalance
    });
  } catch (err) {
    const status = (err.message === 'Insufficient balance' || err.message === 'Minimum bet is PKR 10') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// 5. Cashout Crash Bet
router.post('/cashout', authenticateToken, async (req, res) => {
  try {
    const { betId, multiplier, amount } = req.body;
    const numMultiplier = Number(multiplier);

    if (isNaN(numMultiplier) || numMultiplier < 1.01) {
      return res.status(400).json({ error: 'Valid multiplier >= 1.01 required' });
    }

    const cachedBet = activeCrashBets.get(betId);
    const betAmount = (cachedBet && (cachedBet.amount || cachedBet.betAmount)) || Number(amount);

    if (!betAmount || isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({ error: 'Bet not found or invalid amount' });
    }

    if (cachedBet && cachedBet.cashedOut) {
      return res.status(400).json({ error: 'Bet already cashed out' });
    }

    const result = await db.cashoutBetTransaction({
      userId: req.user.id,
      username: req.user.username,
      betId,
      betAmount,
      multiplier: numMultiplier
    });

    if (cachedBet) {
      cachedBet.cashedOut = true;
      cachedBet.cashoutMultiplier = numMultiplier;
      cachedBet.payout = result.payout;
    }

    res.json({
      success: true,
      payout: result.payout,
      multiplier: result.multiplier,
      newBalance: result.newBalance
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.getOrUpdateLiveRound = getOrUpdateLiveRound;

module.exports = router;
module.exports.router = router;
module.exports.getOrUpdateLiveRound = getOrUpdateLiveRound;
