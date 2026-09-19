const express = require('express');
const { authenticateToken } = require('./auth');
const db = require('../db');

const router = express.Router();

// Active crash bets in-memory map for fast lookup
const activeCrashBets = new Map();

// 1. Get Crash Game Controls & State
router.get('/control', (req, res) => {
  try {
    const settings = db.getGameSettings();
    res.json({
      aviatorMode: settings.aviatorMode || 'fair',
      forcedNextMultiplier: settings.forcedNextMultiplier || null,
      crashNowTriggered: settings.crashNowTriggered || 0,
      houseEdge: settings.houseEdge || 4,
      minBet: settings.minBet || 10,
      maxBet: settings.maxBet || 50000
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Consume forced next multiplier after it has been used in a round
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

// 3. Place Crash Bet
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

// 4. Cashout Crash Bet
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

module.exports = router;
