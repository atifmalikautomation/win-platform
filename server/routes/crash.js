const express = require('express');
const { authenticateToken } = require('./auth');
const db = require('../db');

const router = express.Router();

// Active crash bets in-memory map for fast lookup
const activeCrashBets = new Map();

// ==================== GLOBALLY SYNCHRONIZED AVIATOR ROUND ENGINE ====================
let currentRound = null;
let roundHistory = [1.45, 2.80, 1.10, 14.50, 3.20, 1.95, 5.80, 1.05, 32.10, 2.15, 8.40, 1.72];

function getDeterministicMultiplier(roundId, mode, forcedMult) {
  if (forcedMult && Number(forcedMult) >= 1.01) {
    return parseFloat(Number(forcedMult).toFixed(2));
  }
  if (mode === 'house_win') {
    const hash = ((roundId * 9301 + 49297) % 233280) / 233280;
    return parseFloat((1.02 + hash * 0.23).toFixed(2));
  }
  if (mode === 'high_run') {
    const hash = ((roundId * 9301 + 49297) % 233280) / 233280;
    return parseFloat((10.0 + hash * 25.0).toFixed(2));
  }
  const seed = (roundId * 1664525 + 1013904223) % 4294967296;
  const rand = seed / 4294967296;
  if (rand < 0.04) return 1.00;
  const point = parseFloat((0.96 / (1 - rand)).toFixed(2));
  return Math.min(100.0, Math.max(1.02, point));
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
        if (!roundHistory.includes(mult) || roundHistory[0] !== mult) {
          roundHistory.unshift(mult);
          if (roundHistory.length > 20) roundHistory.pop();
        }
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
    currentRound.state = 'CRASHED';
    currentRound.multiplier = currentRound.crashedAt;
    currentRound.countdown = 0;
    if (!roundHistory.includes(currentRound.crashedAt) || roundHistory[0] !== currentRound.crashedAt) {
      roundHistory.unshift(currentRound.crashedAt);
      if (roundHistory.length > 20) roundHistory.pop();
    }
  }

  currentRound.serverTime = now;
  currentRound.history = roundHistory.slice(0, 12);
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

    if (db.syncWithCloud) await db.syncWithCloud();

    const user = db.findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.balance < numAmount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Atomically deduct balance
    const newBalance = await db.updateUserBalance(user.id, -numAmount);

    const betId = `crash_bet_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const betRecord = {
      id: betId,
      userId: user.id,
      username: user.username,
      amount: numAmount,
      autoCashout: autoCashout ? Number(autoCashout) : null,
      cashedOut: false,
      createdAt: Date.now()
    };

    activeCrashBets.set(betId, betRecord);

    // Initial record in DB
    await db.recordBet({
      userId: user.id,
      username: user.username,
      game: 'aviator',
      betAmount: numAmount,
      multiplier: 0,
      payout: 0,
      status: 'lost'
    });

    res.json({
      success: true,
      bet: betRecord,
      newBalance
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

    const bet = activeCrashBets.get(betId);
    const betAmount = bet ? bet.amount : Number(amount);

    if (!betAmount || isNaN(betAmount) || betAmount <= 0) {
      return res.status(400).json({ error: 'Bet not found or invalid amount' });
    }

    if (bet && bet.cashedOut) {
      return res.status(400).json({ error: 'Bet already cashed out' });
    }

    const payout = parseFloat((betAmount * numMultiplier).toFixed(2));

    if (db.syncWithCloud) await db.syncWithCloud();

    // Atomically credit balance
    const newBalance = await db.updateUserBalance(req.user.id, payout);

    if (bet) {
      bet.cashedOut = true;
      bet.cashoutMultiplier = numMultiplier;
      bet.payout = payout;
    }

    // Record won bet
    await db.recordBet({
      userId: req.user.id,
      username: req.user.username,
      game: 'aviator',
      betAmount: betAmount,
      multiplier: numMultiplier,
      payout,
      status: 'won'
    });

    res.json({
      success: true,
      payout,
      multiplier: numMultiplier,
      newBalance
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.getOrUpdateLiveRound = getOrUpdateLiveRound;

module.exports = router;
module.exports.router = router;
module.exports.getOrUpdateLiveRound = getOrUpdateLiveRound;
