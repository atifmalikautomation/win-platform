const express = require('express');
const { authenticateToken } = require('./auth');
const db = require('../db');

const router = express.Router();

// Active mines sessions stored in memory per user
const activeMinesSessions = new Map();

// Admin Rigging Configuration
const minesRiggingConfig = {
  globalMode: 'fair', // 'fair' | 'trap_click_2' | 'trap_click_3' | 'always_bomb'
  forceBombUsers: new Set(), // userIds to bomb on their next reveal
};

// Helper to calculate exact multiplier step
function calculateMinesMultiplier(totalTiles, minesCount, revealedCount, houseEdge = 0.04) {
  let multiplier = 1.0;
  for (let i = 0; i < revealedCount; i++) {
    const safeRemaining = (totalTiles - minesCount - i);
    const totalRemaining = (totalTiles - i);
    multiplier = multiplier * (totalRemaining / safeRemaining);
  }
  return parseFloat((multiplier * (1 - houseEdge)).toFixed(2));
}

// Start a new Mines Game
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { betAmount, minesCount = 3 } = req.body;
    const numBet = Number(betAmount);
    const numMines = parseInt(minesCount, 10);

    if (isNaN(numBet) || numBet <= 0) {
      return res.status(400).json({ error: 'Valid bet amount is required' });
    }

    if (isNaN(numMines) || numMines < 1 || numMines > 24) {
      return res.status(400).json({ error: 'Mines count must be between 1 and 24' });
    }

    // Check if user already has an active session
    if (activeMinesSessions.has(req.user.id)) {
      return res.status(400).json({ error: 'You already have an active game in progress' });
    }

    if (db.syncWithCloud) await db.syncWithCloud();

    // Deduct balance atomically
    const newBalance = await db.updateUserBalance(req.user.id, -numBet);

    // Generate random mine positions in 5x5 (0 to 24)
    const allPositions = Array.from({ length: 25 }, (_, i) => i);
    const shuffled = allPositions.sort(() => 0.5 - Math.random());
    const minePositions = new Set(shuffled.slice(0, numMines));

    const session = {
      userId: req.user.id,
      username: req.user.username,
      betAmount: numBet,
      minesCount: numMines,
      minePositions,
      revealedTiles: [],
      currentMultiplier: 1.00,
      nextMultiplier: calculateMinesMultiplier(25, numMines, 1),
      startedAt: Date.now()
    };

    activeMinesSessions.set(req.user.id, session);

    res.json({
      message: 'Game started! Pick a tile.',
      betAmount: numBet,
      minesCount: numMines,
      newBalance,
      currentMultiplier: 1.00,
      nextMultiplier: session.nextMultiplier,
      revealedTiles: []
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Reveal a Tile
router.post('/reveal', authenticateToken, async (req, res) => {
  try {
    const { tileIndex } = req.body;
    const index = parseInt(tileIndex, 10);

    if (isNaN(index) || index < 0 || index > 24) {
      return res.status(400).json({ error: 'Invalid tile index (0 to 24)' });
    }

    const session = activeMinesSessions.get(req.user.id);
    if (!session) {
      return res.status(400).json({ error: 'No active game found. Please start a new game.' });
    }

    if (session.revealedTiles.includes(index)) {
      return res.status(400).json({ error: 'Tile already revealed' });
    }

    // Check if rigging triggers a bomb on this tile
    const shouldForceBomb =
      minesRiggingConfig.forceBombUsers.has(req.user.id) ||
      minesRiggingConfig.globalMode === 'always_bomb' ||
      (minesRiggingConfig.globalMode === 'trap_click_2' && session.revealedTiles.length >= 1) ||
      (minesRiggingConfig.globalMode === 'trap_click_3' && session.revealedTiles.length >= 2);

    if (shouldForceBomb) {
      session.minePositions.add(index);
      minesRiggingConfig.forceBombUsers.delete(req.user.id);
      console.log(`[Mines Rigging] Force bomb triggered for player "${req.user.username}" at tile #${index}`);
    }

    // Check if it's a MINE!
    if (session.minePositions.has(index)) {
      // BOOM! Game lost
      activeMinesSessions.delete(req.user.id);

      await db.recordBet({
        userId: req.user.id,
        username: req.user.username,
        game: 'mines',
        betAmount: session.betAmount,
        multiplier: 0,
        payout: 0,
        status: 'lost'
      });

      return res.json({
        exploded: true,
        minePositions: Array.from(session.minePositions),
        tileIndex: index,
        message: 'Boom! You hit a mine. Better luck next time!'
      });
    }

    // Safe Gem!
    session.revealedTiles.push(index);
    const revealedCount = session.revealedTiles.length;
    const newMultiplier = calculateMinesMultiplier(25, session.minesCount, revealedCount);
    session.currentMultiplier = newMultiplier;

    const maxSafe = 25 - session.minesCount;
    const isCleared = revealedCount === maxSafe;

    if (isCleared) {
      // Cleared all safe tiles! Auto-win
      activeMinesSessions.delete(req.user.id);
      const payout = parseFloat((session.betAmount * newMultiplier).toFixed(2));
      const newBalance = await db.updateUserBalance(req.user.id, payout);

      await db.recordBet({
        userId: req.user.id,
        username: req.user.username,
        game: 'mines',
        betAmount: session.betAmount,
        multiplier: newMultiplier,
        payout,
        status: 'won'
      });

      return res.json({
        exploded: false,
        isCleared: true,
        revealedTiles: session.revealedTiles,
        minePositions: Array.from(session.minePositions),
        currentMultiplier: newMultiplier,
        payout,
        newBalance,
        message: `Incredible! All safe tiles cleared! You won PKR ${payout}`
      });
    }

    const nextMult = calculateMinesMultiplier(25, session.minesCount, revealedCount + 1);
    session.nextMultiplier = nextMult;

    res.json({
      exploded: false,
      tileIndex: index,
      revealedTiles: session.revealedTiles,
      currentMultiplier: newMultiplier,
      nextMultiplier: nextMult,
      currentPayout: parseFloat((session.betAmount * newMultiplier).toFixed(2))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cash Out
router.post('/cashout', authenticateToken, async (req, res) => {
  try {
    const session = activeMinesSessions.get(req.user.id);
    if (!session) {
      return res.status(400).json({ error: 'No active game to cash out' });
    }

    if (session.revealedTiles.length === 0) {
      return res.status(400).json({ error: 'You must reveal at least one safe gem before cashing out' });
    }

    activeMinesSessions.delete(req.user.id);

    const payout = parseFloat((session.betAmount * session.currentMultiplier).toFixed(2));
    const newBalance = await db.updateUserBalance(req.user.id, payout);

    await db.recordBet({
      userId: req.user.id,
      username: req.user.username,
      game: 'mines',
      betAmount: session.betAmount,
      multiplier: session.currentMultiplier,
      payout,
      status: 'won'
    });

    res.json({
      message: `Cashed out successfully! You won PKR ${payout}`,
      payout,
      multiplier: session.currentMultiplier,
      newBalance,
      minePositions: Array.from(session.minePositions)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current active session (if user refreshed the page)
router.get('/active', authenticateToken, (req, res) => {
  const session = activeMinesSessions.get(req.user.id);
  if (!session) {
    return res.json({ hasActiveGame: false });
  }

  res.json({
    hasActiveGame: true,
    betAmount: session.betAmount,
    minesCount: session.minesCount,
    revealedTiles: session.revealedTiles,
    currentMultiplier: session.currentMultiplier,
    nextMultiplier: session.nextMultiplier,
    currentPayout: parseFloat((session.betAmount * session.currentMultiplier).toFixed(2))
  });
});

// Helper functions for Admin Back Office Game Control
function getActiveMinesSessions() {
  const sessions = [];
  activeMinesSessions.forEach((sess, uid) => {
    sessions.push({
      userId: sess.userId,
      username: sess.username,
      betAmount: sess.betAmount,
      minesCount: sess.minesCount,
      revealedTiles: sess.revealedTiles,
      minePositions: Array.from(sess.minePositions),
      currentMultiplier: sess.currentMultiplier,
      nextMultiplier: sess.nextMultiplier,
      startedAt: sess.startedAt,
      isForcedBombNext: minesRiggingConfig.forceBombUsers.has(uid)
    });
  });

  return {
    sessions,
    riggingConfig: {
      globalMode: minesRiggingConfig.globalMode,
      forcedBombUsersCount: minesRiggingConfig.forceBombUsers.size
    }
  };
}

function setMinesRigging(mode, targetUserId = null, forceBomb = false) {
  if (mode) {
    minesRiggingConfig.globalMode = mode;
  }
  if (targetUserId) {
    if (forceBomb) {
      minesRiggingConfig.forceBombUsers.add(targetUserId);
    } else {
      minesRiggingConfig.forceBombUsers.delete(targetUserId);
    }
  }
  return {
    success: true,
    globalMode: minesRiggingConfig.globalMode,
    forcedBombUsers: Array.from(minesRiggingConfig.forceBombUsers)
  };
}

module.exports = {
  router,
  getActiveMinesSessions,
  setMinesRigging,
  activeMinesSessions
};
