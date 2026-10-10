const express = require('express');
const { authenticateToken } = require('./auth');
const db = require('../db');
const engine = require('../aviatorEngine');

const router = express.Router();

// Admin-only middleware
function requireAdmin(req, res, next) {
  const cleanName = (req.user?.username || '').toLowerCase();
  const cleanEmail = (req.user?.email || '').toLowerCase();
  const isAdmin = req.user?.role === 'admin' || cleanName === 'saqib_admin' || cleanEmail === '60secscriptdoc@gmail.com';
  if (!isAdmin) {
    return res.status(403).json({ error: 'Access denied: Admin privileges required' });
  }
  next();
}

// Get Dashboard Overview & Metrics
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  if (db.syncWithCloud) await db.syncWithCloud();
  const stats = db.getStats();
  const settings = db.getGameSettings();
  const recentBets = db.getRecentBets(15);
  res.json({ stats, settings, recentBets });
});

// Get Game Settings & House Edge
router.get('/settings', authenticateToken, requireAdmin, (req, res) => {
  res.json({ settings: db.getGameSettings() });
});

// Update RTP / House Edge / Limits
router.put('/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { crashRtp, houseEdge, minBet, maxBet, maxPayout, maintenance } = req.body;
    if (db.syncWithCloud) await db.syncWithCloud();
    const updated = await db.updateGameSettings({
      crashRtp: Number(crashRtp),
      houseEdge: Number(houseEdge),
      minBet: Number(minBet),
      maxBet: Number(maxBet),
      maxPayout: Number(maxPayout),
      maintenance: Boolean(maintenance)
    });
    res.json({ message: 'Settings successfully updated', settings: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all cashier transactions (pending, approved, rejected)
router.get('/transactions', authenticateToken, requireAdmin, async (req, res) => {
  if (db.syncWithCloud) await db.syncWithCloud();
  const transactions = db.getTransactions();
  res.json({ transactions });
});

// Approve or Reject Cashier Transaction
router.post('/transactions/:id/action', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { action, notes } = req.body; // action: 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }

    if (db.syncWithCloud) await db.syncWithCloud();
    const tx = await db.processTransaction(req.params.id, action, notes);
    res.json({ message: `Transaction has been ${action}d successfully`, transaction: tx });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// List all registered users
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  if (db.syncWithCloud) await db.syncWithCloud();
  const currentDb = db.readDB();
  const safeUsers = currentDb.users.map(u => ({
    id: u.id,
    username: u.username,
    email: u.email || '',
    role: u.role,
    balance: u.balance,
    bonusBalance: u.bonusBalance,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin || u.createdAt || null,
    authProvider: u.authProvider || (u.email && u.email.toLowerCase().includes('@gmail.com') ? 'google' : 'email'),
    picture: u.picture || '',
    isBanned: !!u.isBanned
  }));
  res.json({ users: safeUsers });
});

// Sync local users to server database
router.post('/sync-users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { users } = req.body;
    if (db.syncWithCloud) await db.syncWithCloud();
    if (Array.isArray(users)) {
      const currentDb = db.readDB();
      let modified = 0;
      users.forEach(u => {
        const usernameClean = (u.username || '').toLowerCase();
        const emailClean = (u.email || '').toLowerCase();
        const existsIdx = currentDb.users.findIndex(existing => 
          existing.id === u.id || 
          (emailClean && existing.email && existing.email.toLowerCase() === emailClean) || 
          (usernameClean && existing.username && existing.username.toLowerCase() === usernameClean)
        );
        if (existsIdx === -1 && (usernameClean || emailClean)) {
          currentDb.users.push({
            id: u.id || `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            username: u.username,
            email: u.email || '',
            passwordHash: '$2b$10$Whzk8jMkMaVStBl1AONWpOuftjz2u.8BS1RKXrErlLP5aWtUZXFu2',
            role: u.role || 'user',
            balance: Number(u.balance || 0),
            bonusBalance: Number(u.bonusBalance || 0),
            createdAt: u.createdAt || new Date().toISOString(),
            lastLogin: u.lastLogin || u.createdAt || new Date().toISOString(),
            authProvider: u.authProvider || u.provider || (emailClean.includes('@gmail.com') ? 'google' : 'email'),
            picture: u.picture || '',
            isBanned: !!u.isBanned
          });
          modified++;
        } else if (existsIdx !== -1) {
          const existing = currentDb.users[existsIdx];
          let updated = false;
          if (!existing.email && u.email) {
            existing.email = u.email;
            updated = true;
          }
          if (u.lastLogin && (!existing.lastLogin || new Date(u.lastLogin) > new Date(existing.lastLogin))) {
            existing.lastLogin = u.lastLogin;
            updated = true;
          }
          if (!existing.authProvider && (u.authProvider || u.provider)) {
            existing.authProvider = u.authProvider || u.provider;
            updated = true;
          }
          if (!existing.picture && u.picture) {
            existing.picture = u.picture;
            updated = true;
          }
          if (updated) modified++;
        }
      });
      if (modified > 0) {
        await db.writeDB(currentDb);
      }
    }
    const currentDb = db.readDB();
    const safeUsers = currentDb.users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email || '',
      role: u.role,
      balance: u.balance,
      bonusBalance: u.bonusBalance,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin || u.createdAt || null,
      authProvider: u.authProvider || (u.email && u.email.toLowerCase().includes('@gmail.com') ? 'google' : 'email'),
      picture: u.picture || '',
      isBanned: !!u.isBanned
    }));
    res.json({ message: 'Users synced successfully', users: safeUsers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual Balance Adjustment, Set Exact Balance, Ban, or Delete user
router.post('/users/:id/action', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { action, amount, isBanned } = req.body;
    if (db.syncWithCloud) await db.syncWithCloud(true);
    const currentDb = db.readDB();
    const user = currentDb.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (action === 'delete') {
      const result = await db.deleteUser(user.id);
      return res.json({ message: `User ${user.username} deleted permanently`, ...result });
    }

    if (action === 'adjust_balance' && typeof amount === 'number') {
      await db.updateUserBalance(user.id, amount);
    } else if (action === 'set_balance' && typeof amount === 'number') {
      await db.setUserExactBalance(user.id, amount);
    }

    if (typeof isBanned === 'boolean') {
      const latestDb = db.readDB();
      const targetUser = latestDb.users.find(u => u.id === user.id);
      if (targetUser) {
        targetUser.isBanned = isBanned;
        await db.writeDB(latestDb);
      }
    }

    const freshUser = db.findUserById(user.id) || user;
    res.json({
      message: 'User updated successfully',
      user: freshUser,
      newBalance: freshUser.balance,
      balanceUpdatedAt: freshUser.balanceUpdatedAt || Date.now()
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Permanently Delete User
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.deleteUser(req.params.id);
    res.json({ message: `User deleted permanently`, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Reset All Platform Data & Stats to 0 (Fresh Start)
router.post('/reset-stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    if (db.syncWithCloud) await db.syncWithCloud();
    const result = await db.resetPlatformData();
    res.json({ message: 'Platform data and stats successfully reset to 0 (Fresh Start)', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== AVIATOR OPERATIONS (no crash-point control) ====================
// The admin can NOT choose or force a crash point (that would cheat players
// who are told the game is provably fair). Available tools:
//   * Emergency Stop  -> current round voided, every open bet refunded
//   * Pause / Resume  -> stop starting new rounds (e.g. maintenance)
//   * House edge      -> applies to future rounds, shown publicly as RTP

function maskedBets(roundId) {
  return db.getRoundBetsPublic(roundId);
}

router.get('/game-control/aviator', authenticateToken, requireAdmin, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    await engine.loadControl(false);
    if (db.syncWithCloud) await db.syncWithCloud(false);
    const live = engine.publicState();
    const roundBets = live.roundId ? db.readDB().bets.filter(b => b.game === 'aviator' && b.roundId === live.roundId && b.status !== 'cancelled') : [];
    res.json({
      ...live,
      bets: maskedBets(live.roundId),
      realBets: roundBets.map(b => ({
        id: b.id,
        username: b.username,
        amount: b.betAmount,
        autoCashout: b.autoCashout,
        status: b.status,
        multiplier: b.multiplier,
        payout: b.payout
      })),
      roundTotals: {
        count: roundBets.length,
        wagered: roundBets.reduce((s, b) => s + (b.betAmount || 0), 0),
        paid: roundBets.reduce((s, b) => s + (b.status === 'won' ? b.payout || 0 : 0), 0)
      },
      control: engine.adminInfo()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/game-control/aviator/emergency-stop', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const r = await engine.emergencyStop();
    res.json({ success: true, ...r, message: `Round #${r.roundId} stopped. All open bets in this round will be refunded.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/game-control/aviator/pause', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const r = await engine.pause();
    res.json({ success: true, ...r, message: `Game will pause after round #${r.pauseAfterRound} finishes.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/game-control/aviator/resume', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const r = await engine.resume();
    res.json({ success: true, ...r, message: `Game resumed. Next round #${r.nextRoundId}.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/game-control/aviator/house-edge', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const r = await engine.setHouseEdge(req.body?.edge);
    res.json({ success: true, ...r, message: `House edge ${r.edge}% (RTP ${100 - r.edge}%) from round #${r.fromRound}.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
