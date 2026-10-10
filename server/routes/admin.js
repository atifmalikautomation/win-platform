const express = require('express');
const { authenticateToken } = require('./auth');
const db = require('../db');
const engine = require('../aviatorEngine');

const router = express.Router();

// Admin-only: the role comes from a token issued by the admin portal login.
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Admin privileges required' });
  }
  next();
}

router.use(authenticateToken, requireAdmin, (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const wrap = fn => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
};

function safeUser(u) {
  return {
    id: u.id,
    username: u.username,
    email: u.email || '',
    role: u.role,
    balance: u.balance,
    bonusBalance: u.bonusBalance,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin || u.createdAt || null,
    authProvider: u.authProvider || 'email',
    picture: u.picture || '',
    isBanned: !!u.isBanned
  };
}

// Dashboard overview
router.get('/stats', wrap(async (req, res) => {
  const [stats, settings, recentBets] = await Promise.all([db.getStats(), db.getGameSettings(), db.getRecentBets(15)]);
  res.json({ stats, settings: { ...settings, houseEdge: engine.adminInfo().houseEdge }, recentBets });
}));

router.get('/settings', wrap(async (req, res) => {
  const settings = await db.getGameSettings({ fresh: true });
  res.json({ settings: { ...settings, houseEdge: engine.adminInfo().houseEdge } });
}));

// Limits / maintenance. (House edge is set via /game-control/aviator/house-edge.)
router.put('/settings', wrap(async (req, res) => {
  const { minBet, maxBet, maxPayout, maintenance } = req.body || {};
  const patch = {};
  if (minBet !== undefined) patch.minBet = Math.max(1, Number(minBet));
  if (maxBet !== undefined) patch.maxBet = Math.max(1, Number(maxBet));
  if (maxPayout !== undefined) patch.maxPayout = Math.max(1, Number(maxPayout));
  if (maintenance !== undefined) patch.maintenance = Boolean(maintenance);
  if (patch.minBet && patch.maxBet && patch.minBet > patch.maxBet) throw new Error('Min bet cannot be greater than max bet');
  const updated = await db.updateGameSettings(patch);
  res.json({ message: 'Settings successfully updated', settings: updated });
}));

// Cashier
router.get('/transactions', wrap(async (req, res) => {
  res.json({ transactions: await db.getTransactions(null, { limit: 300 }) });
}));

router.post('/transactions/:id/action', wrap(async (req, res) => {
  const { action, notes } = req.body || {};
  if (!['approve', 'reject'].includes(action)) throw new Error('Action must be approve or reject');
  const tx = await db.processTransaction(req.params.id, action, notes);
  res.json({ message: `Transaction has been ${action}d successfully`, transaction: tx });
}));

// Users
router.get('/users', wrap(async (req, res) => {
  res.json({ users: (await db.listUsers()).map(safeUser) });
}));

// Kept for older dashboard builds: it NO LONGER accepts users from the browser
// (that allowed creating accounts with a known password hash).
router.post('/sync-users', wrap(async (req, res) => {
  res.json({ message: 'Users loaded', users: (await db.listUsers()).map(safeUser) });
}));

router.post('/users/:id/action', wrap(async (req, res) => {
  const { action, amount, isBanned } = req.body || {};
  const user = await db.findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (action === 'delete') {
    const result = await db.deleteUser(user.id);
    return res.json({ message: `User ${user.username} deleted permanently`, ...result });
  }
  if (action === 'adjust_balance') {
    if (!Number.isFinite(Number(amount))) throw new Error('Amount must be a number');
    await db.updateUserBalance(user.id, Number(amount));
  } else if (action === 'set_balance') {
    if (!Number.isFinite(Number(amount)) || Number(amount) < 0) throw new Error('Amount must be a positive number');
    await db.setUserExactBalance(user.id, Number(amount));
  }
  if (typeof isBanned === 'boolean') await db.setUserBanned(user.id, isBanned);

  const fresh = await db.findUserById(user.id);
  res.json({
    message: 'User updated successfully',
    user: safeUser(fresh),
    newBalance: fresh.balance,
    balanceUpdatedAt: fresh.balanceUpdatedAt || Date.now()
  });
}));

router.delete('/users/:id', wrap(async (req, res) => {
  const result = await db.deleteUser(req.params.id);
  res.json({ message: 'User deleted permanently', ...result });
}));

// Wipes bets + transactions and sets every balance to 0. Requires explicit confirmation.
router.post('/reset-stats', wrap(async (req, res) => {
  if ((req.body || {}).confirm !== 'RESET') {
    throw new Error('Type RESET to confirm. This deletes all bets and transactions and sets all balances to 0.');
  }
  const result = await db.resetPlatformData();
  res.json({ message: 'Platform data and stats successfully reset to 0 (Fresh Start)', ...result });
}));

// ==================== AVIATOR OPERATIONS (no crash-point control) ====================
// The admin can NOT choose or force a crash point (that would cheat players
// who are told the game is provably fair). Available tools:
//   * Emergency Stop  -> current round voided, every open bet refunded
//   * Pause / Resume  -> stop starting new rounds (e.g. maintenance)
//   * House edge      -> applies to future rounds, shown publicly as RTP

router.get('/game-control/aviator', wrap(async (req, res) => {
  await engine.loadControl(false);
  const live = engine.publicState();
  const roundBets = live.roundId ? await db.getRoundBets(live.roundId) : [];
  res.json({
    ...live,
    bets: roundBets.map(b => ({
      id: b.id, username: db.maskName(b.username), amount: b.betAmount, status: b.status,
      multiplier: b.status === 'won' ? b.multiplier : null, payout: b.status === 'won' ? b.payout : null
    })),
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
}));

router.post('/game-control/aviator/emergency-stop', wrap(async (req, res) => {
  const r = await engine.emergencyStop();
  // Refund right away (the settlement is idempotent).
  try {
    await db.settleAviatorRound(r.roundId, engine.getRoundResult(r.roundId, Date.now() + 1));
  } catch (e) {
    console.error('emergency refund deferred:', e.message);
  }
  res.json({ success: true, ...r, message: `Round #${r.roundId} stopped. All open bets in this round have been refunded.` });
}));

router.post('/game-control/aviator/pause', wrap(async (req, res) => {
  const r = await engine.pause();
  res.json({ success: true, ...r, message: `Game will pause after round #${r.pauseAfterRound} finishes.` });
}));

router.post('/game-control/aviator/resume', wrap(async (req, res) => {
  const r = await engine.resume();
  res.json({ success: true, ...r, message: `Game resumed. Next round #${r.nextRoundId}.` });
}));

router.post('/game-control/aviator/house-edge', wrap(async (req, res) => {
  const r = await engine.setHouseEdge(req.body?.edge);
  res.json({ success: true, ...r, message: `House edge ${r.edge}% (RTP ${100 - r.edge}%) from round #${r.fromRound}.` });
}));

module.exports = router;
