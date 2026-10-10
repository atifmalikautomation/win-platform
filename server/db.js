// SkyWin data layer (Postgres). Every money movement is a single atomic SQL
// statement or transaction, guarded by status checks, so concurrent requests on
// different serverless instances can never lose or double-count a balance.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pg = require('./pg');

const SUPER_ADMIN_USERNAME = 'saqib_admin';
const SUPER_ADMIN_EMAIL = '60secscriptdoc@gmail.com';

const DEFAULT_SETTINGS = {
  crashRtp: 97,
  houseEdge: 3,
  minBet: 10,
  maxBet: 50000,
  maxPayout: 1000000,
  maintenance: false
};

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function newId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function isSuperAdmin(u) {
  if (!u) return false;
  return (u.username || '').trim().toLowerCase() === SUPER_ADMIN_USERNAME
    || (u.email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;
}

const iso = v => (v ? new Date(v).toISOString() : null);

// ---------------------------------------------------------------- row mappers
function mapUser(r) {
  if (!r) return null;
  return {
    id: r.id,
    username: r.username,
    email: r.email || '',
    passwordHash: r.password_hash || '',
    role: r.role,
    balance: Number(r.balance || 0),
    bonusBalance: Number(r.bonus_balance || 0),
    authProvider: r.auth_provider || 'email',
    picture: r.picture || '',
    isBanned: !!r.is_banned,
    createdAt: iso(r.created_at),
    lastLogin: iso(r.last_login),
    balanceUpdatedAt: Number(r.balance_updated_at || 0),
    version: r.version || 0
  };
}

function mapTx(r, { withProof = true } = {}) {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    type: r.type,
    method: r.method,
    amount: Number(r.amount),
    accountNumber: r.account_number,
    reference: r.reference,
    proofUrl: withProof ? r.proof_url : '',
    proofScreenshot: withProof ? r.proof_screenshot : '',
    status: r.status,
    notes: r.notes || '',
    createdAt: iso(r.created_at),
    approvedAt: iso(r.approved_at)
  };
}

function mapBet(r) {
  return {
    id: r.id,
    userId: r.user_id,
    username: r.username,
    game: r.game,
    roundId: r.round_id,
    amount: Number(r.bet_amount),
    betAmount: Number(r.bet_amount),
    autoCashout: r.auto_cashout === null ? null : Number(r.auto_cashout),
    multiplier: Number(r.multiplier || 0),
    payout: Number(r.payout || 0),
    status: r.status,
    crashAt: r.crash_at === null ? null : Number(r.crash_at),
    createdAt: iso(r.created_at),
    settledAt: iso(r.settled_at)
  };
}

function maskName(name) {
  const n = String(name || 'player');
  if (n.length <= 3) return `${n[0]}**`;
  return `${n.slice(0, 2)}***${n.slice(-1)}`;
}

// ---------------------------------------------------------------- bootstrap
let bootstrapped = null;
function bootstrap() {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      await pg.ensureSchema();
      // Make sure the super admin account exists (login uses ADMIN_PASSWORD env).
      const { rows } = await pg.query('SELECT id FROM users WHERE lower(username) = $1 OR lower(email) = $2 LIMIT 1',
        [SUPER_ADMIN_USERNAME, SUPER_ADMIN_EMAIL]);
      if (rows.length === 0) {
        const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || crypto.randomBytes(24).toString('hex'), 10);
        await pg.query(
          `INSERT INTO users (id, username, email, password_hash, role, balance, auth_provider, balance_updated_at)
           VALUES ('usr_saqib_admin', $1, $2, $3, 'admin', 0, 'email', $4) ON CONFLICT DO NOTHING`,
          [SUPER_ADMIN_USERNAME, SUPER_ADMIN_EMAIL, hash, Date.now()]);
      }
    })().catch(err => { bootstrapped = null; throw err; });
  }
  return bootstrapped;
}

async function q(text, params) {
  await bootstrap();
  return pg.query(text, params);
}

async function tx(fn) {
  await bootstrap();
  return pg.tx(fn);
}

// ---------------------------------------------------------------- users
async function findUserById(id) {
  if (!id) return null;
  const { rows } = await q('SELECT * FROM users WHERE id = $1', [id]);
  return mapUser(rows[0]);
}

async function findUserByUsername(username) {
  if (!username) return null;
  const { rows } = await q('SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1', [username.trim()]);
  return mapUser(rows[0]);
}

async function findUserByEmail(email) {
  if (!email) return null;
  const { rows } = await q("SELECT * FROM users WHERE email <> '' AND lower(email) = lower($1) LIMIT 1", [email.trim()]);
  return mapUser(rows[0]);
}

async function findUserByIdentifier(identifier) {
  if (!identifier) return null;
  const clean = identifier.trim();
  const { rows } = await q(
    "SELECT * FROM users WHERE lower(username) = lower($1) OR (email <> '' AND lower(email) = lower($1)) ORDER BY (lower(username) = lower($1)) DESC LIMIT 1",
    [clean]);
  return mapUser(rows[0]);
}

async function createUser({ username, email, password, role = 'user', initialBalance = 0, authProvider = 'email', picture = '', lastLogin = null }) {
  const cleanUsername = (username || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanRole = isSuperAdmin({ username: cleanUsername, email: cleanEmail }) ? 'admin' : role;
  const id = newId('usr');
  try {
    const { rows } = await q(
      `INSERT INTO users (id, username, email, password_hash, role, balance, auth_provider, picture, last_login, balance_updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [id, cleanUsername, cleanEmail, bcrypt.hashSync(password, 10), cleanRole, round2(initialBalance),
        authProvider || 'email', picture || '', lastLogin || new Date().toISOString(), Date.now()]);
    return mapUser(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      if (String(err.constraint || '').includes('email')) throw new Error('Email already registered');
      throw new Error('Username already taken');
    }
    throw err;
  }
}

async function recordLogin(userId, { authProvider, picture } = {}) {
  const { rows } = await q(
    `UPDATE users SET last_login = now(),
       auth_provider = COALESCE($2, auth_provider),
       picture = CASE WHEN $3::text IS NOT NULL AND $3::text <> '' THEN $3::text ELSE picture END
     WHERE id = $1 RETURNING *`,
    [userId, authProvider || null, picture || null]);
  return mapUser(rows[0]);
}

async function setPassword(userId, password) {
  await q('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, bcrypt.hashSync(password, 10)]);
}

async function listUsers() {
  const { rows } = await q('SELECT * FROM users ORDER BY created_at DESC');
  return rows.map(mapUser);
}

// Atomic balance change. Throws on insufficient funds.
async function updateUserBalance(userId, deltaAmount) {
  const delta = round2(deltaAmount);
  const { rows } = await q(
    `UPDATE users SET balance = balance + $2, balance_updated_at = $3, version = version + 1
     WHERE id = $1 AND balance + $2 >= 0 RETURNING balance`,
    [userId, delta, Date.now()]);
  if (rows.length) return Number(rows[0].balance);
  const exists = await findUserById(userId);
  if (!exists) throw new Error('User not found');
  throw new Error('Insufficient balance');
}

async function setUserExactBalance(userId, exactAmount) {
  const amount = Math.max(0, round2(exactAmount));
  const { rows } = await q(
    'UPDATE users SET balance = $2, balance_updated_at = $3, version = version + 1 WHERE id = $1 RETURNING balance',
    [userId, amount, Date.now()]);
  if (!rows.length) throw new Error('User not found');
  return Number(rows[0].balance);
}

async function setUserBanned(userId, isBanned) {
  const target = await findUserById(userId);
  if (!target) throw new Error('User not found');
  if (isSuperAdmin(target) && isBanned) throw new Error('Super Admin account cannot be banned');
  await q('UPDATE users SET is_banned = $2 WHERE id = $1', [userId, !!isBanned]);
}

async function deleteUser(userId) {
  return tx(async c => {
    const { rows } = await c.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const user = mapUser(rows[0]);
    if (!user) throw new Error('User not found');
    if (isSuperAdmin(user)) throw new Error('Super Admin account cannot be deleted');
    await c.query('DELETE FROM bets WHERE user_id = $1', [userId]);
    await c.query('DELETE FROM transactions WHERE user_id = $1', [userId]);
    await c.query("DELETE FROM kv WHERE key = $1", [`mines:${userId}`]);
    await c.query('DELETE FROM users WHERE id = $1', [userId]);
    return { success: true, deletedUserId: userId, username: user.username };
  });
}

// ---------------------------------------------------------------- cashier
async function createTransaction({ userId, username, type, method, amount, accountNumber, reference, proofUrl = '', proofScreenshot = '' }) {
  const numAmount = round2(amount);
  return tx(async c => {
    if (type === 'withdraw') {
      // Reserve the money immediately (refunded if the admin rejects).
      const r = await c.query(
        `UPDATE users SET balance = balance - $2, balance_updated_at = $3, version = version + 1
         WHERE id = $1 AND balance >= $2 RETURNING balance`,
        [userId, numAmount, Date.now()]);
      if (!r.rows.length) throw new Error('Insufficient balance for withdrawal');
    }
    const { rows } = await c.query(
      `INSERT INTO transactions (id, user_id, username, type, method, amount, account_number, reference, proof_url, proof_screenshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [newId('tx'), userId, username || '', type, method || '', numAmount, accountNumber || '', reference || '',
        proofUrl || '', proofScreenshot || proofUrl || '']);
    return mapTx(rows[0]);
  });
}

async function processTransaction(txId, action, adminNotes = '') {
  return tx(async c => {
    const { rows } = await c.query('SELECT * FROM transactions WHERE id = $1 FOR UPDATE', [txId]);
    if (!rows.length) throw new Error('Transaction not found');
    const t = rows[0];
    if (t.status !== 'pending') throw new Error('Transaction is already processed');

    const status = action === 'approve' ? 'approved' : 'rejected';
    const credit = (action === 'approve' && t.type === 'deposit') || (action === 'reject' && t.type === 'withdraw');
    if (credit) {
      await c.query(
        'UPDATE users SET balance = balance + $2, balance_updated_at = $3, version = version + 1 WHERE id = $1',
        [t.user_id, Number(t.amount), Date.now()]);
    }
    const upd = await c.query(
      `UPDATE transactions SET status = $2, notes = $3, approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE approved_at END
       WHERE id = $1 RETURNING *`,
      [txId, status, adminNotes || '']);
    return mapTx(upd.rows[0]);
  });
}

async function getTransactions(userId = null, { limit = 300, withProof = true } = {}) {
  const { rows } = userId
    ? await q('SELECT * FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit])
    : await q('SELECT * FROM transactions ORDER BY created_at DESC LIMIT $1', [limit]);
  return rows.map(r => mapTx(r, { withProof }));
}

// ---------------------------------------------------------------- aviator bets
// Settles every open bet of ONE finished round for ALL players in one atomic
// statement. Safe to run concurrently from many instances (status guard).
async function settleAviatorRound(roundId, result) {
  if (!result) return { settled: 0 };
  const now = Date.now();
  if (result.voided) {
    const { rows } = await q(
      `WITH s AS (
         UPDATE bets SET status = 'refunded', settled_at = now()
         WHERE round_id = $1 AND game = 'aviator' AND status = 'placed'
         RETURNING user_id, bet_amount
       ), c AS (
         UPDATE users u SET balance = u.balance + t.amt, balance_updated_at = $2, version = u.version + 1
         FROM (SELECT user_id, sum(bet_amount) AS amt FROM s GROUP BY user_id) t
         WHERE u.id = t.user_id RETURNING u.id
       )
       SELECT (SELECT count(*) FROM s) AS settled`,
      [roundId, now]);
    return { settled: Number(rows[0].settled) };
  }
  const crashAt = round2(result.crashAt);
  const { rows } = await q(
    `WITH w AS (
       UPDATE bets SET status = 'won', multiplier = auto_cashout, payout = round(bet_amount * auto_cashout, 2),
              crash_at = $2, settled_at = now()
       WHERE round_id = $1 AND game = 'aviator' AND status = 'placed'
         AND auto_cashout IS NOT NULL AND auto_cashout <= $2
       RETURNING user_id, payout
     ), l AS (
       UPDATE bets SET status = 'lost', crash_at = $2, settled_at = now()
       WHERE round_id = $1 AND game = 'aviator' AND status = 'placed'
         AND (auto_cashout IS NULL OR auto_cashout > $2)
       RETURNING id
     ), c AS (
       UPDATE users u SET balance = u.balance + t.amt, balance_updated_at = $3, version = u.version + 1
       FROM (SELECT user_id, sum(payout) AS amt FROM w GROUP BY user_id) t
       WHERE u.id = t.user_id RETURNING u.id
     )
     SELECT (SELECT count(*) FROM w) + (SELECT count(*) FROM l) AS settled`,
    [roundId, crashAt, now]);
  return { settled: Number(rows[0].settled) };
}

// Settle all rounds older than `currentRoundId` that still have open bets.
async function settleFinishedRounds(getRoundResult, currentRoundId, { userId = null, maxRounds = 25 } = {}) {
  const { rows } = userId
    ? await q(`SELECT DISTINCT round_id FROM bets WHERE status = 'placed' AND game = 'aviator' AND user_id = $1 ORDER BY round_id LIMIT $2`, [userId, maxRounds])
    : await q(`SELECT DISTINCT round_id FROM bets WHERE status = 'placed' AND game = 'aviator' ORDER BY round_id LIMIT $1`, [maxRounds]);
  let settled = 0;
  for (const r of rows) {
    const roundId = r.round_id;
    if (roundId === null) {
      // legacy bet without a round: cannot be verified, close it
      await q(`UPDATE bets SET status = 'lost', settled_at = now() WHERE round_id IS NULL AND status = 'placed' AND game = 'aviator'`);
      continue;
    }
    if (currentRoundId != null && roundId > currentRoundId) continue;
    const result = getRoundResult(roundId);
    if (!result) continue; // not finished yet
    settled += (await settleAviatorRound(roundId, result)).settled;
  }
  return settled;
}

async function placeBetTransaction({ userId, betAmount, autoCashout, roundId, minBet = 10, maxBet = 50000 }) {
  if (roundId == null) throw new Error('No active round');
  const numAmount = Math.floor(Number(betAmount));
  if (!Number.isFinite(numAmount) || numAmount < minBet) throw new Error(`Minimum bet is PKR ${minBet}`);
  if (numAmount > maxBet) throw new Error(`Maximum bet is PKR ${maxBet}`);

  let auto = null;
  if (autoCashout !== null && autoCashout !== undefined && autoCashout !== '' && autoCashout !== false) {
    auto = round2(autoCashout);
    if (!(auto >= 1.01 && auto <= 1000)) throw new Error('Auto cash out must be between 1.01x and 1000x');
  }

  return tx(async c => {
    // Row lock on the user serialises this player's bets (max 2 per round, no overdraft).
    const u = await c.query('SELECT id, username, balance, is_banned FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!u.rows.length || u.rows[0].is_banned) throw new Error('User not found');
    const open = await c.query(
      `SELECT count(*)::int AS n FROM bets WHERE user_id = $1 AND round_id = $2 AND game = 'aviator' AND status = 'placed'`,
      [userId, roundId]);
    if (open.rows[0].n >= 2) throw new Error('Maximum 2 bets per round');
    if (Number(u.rows[0].balance) < numAmount) throw new Error('Insufficient balance');

    const bal = await c.query(
      'UPDATE users SET balance = balance - $2, balance_updated_at = $3, version = version + 1 WHERE id = $1 RETURNING balance',
      [userId, numAmount, Date.now()]);
    const ins = await c.query(
      `INSERT INTO bets (id, user_id, username, game, round_id, bet_amount, auto_cashout, status)
       VALUES ($1,$2,$3,'aviator',$4,$5,$6,'placed') RETURNING *`,
      [newId('crash_bet'), userId, u.rows[0].username, roundId, numAmount, auto]);
    return { success: true, bet: mapBet(ins.rows[0]), newBalance: Number(bal.rows[0].balance) };
  });
}

async function describeBetFailure(userId, betId, roundId) {
  const { rows } = await q('SELECT status, round_id FROM bets WHERE id = $1 AND user_id = $2', [betId, userId]);
  if (!rows.length) return 'Bet not found';
  const b = rows[0];
  if (b.status === 'won') return 'Bet has already been cashed out';
  if (b.status === 'cancelled') return 'Bet was cancelled';
  if (b.status === 'refunded') return 'Round was stopped; bet refunded';
  if (b.status === 'lost') return 'Too late — the plane has already flown away';
  if (b.round_id !== roundId) return 'This bet is not in the current round';
  return 'Bet could not be updated';
}

async function cancelBetTransaction({ userId, betId, roundId }) {
  const result = await tx(async c => {
    const upd = await c.query(
      `UPDATE bets SET status = 'cancelled', settled_at = now()
       WHERE id = $1 AND user_id = $2 AND round_id = $3 AND status = 'placed' RETURNING bet_amount`,
      [betId, userId, roundId]);
    if (!upd.rows.length) return null;
    const bal = await c.query(
      'UPDATE users SET balance = balance + $2, balance_updated_at = $3, version = version + 1 WHERE id = $1 RETURNING balance',
      [userId, Number(upd.rows[0].bet_amount), Date.now()]);
    return { success: true, cancelledBetId: betId, newBalance: Number(bal.rows[0].balance) };
  });
  if (!result) throw new Error(await describeBetFailure(userId, betId, roundId));
  return result;
}

// `multiplier` must already be validated by the route against the engine clock.
async function cashoutBetTransaction({ userId, betId, roundId, multiplier }) {
  const m = Math.floor(Number(multiplier) * 100 + 1e-6) / 100;
  if (!(m >= 1.0)) throw new Error('Invalid multiplier');
  const result = await tx(async c => {
    const upd = await c.query(
      `UPDATE bets SET status = 'won', multiplier = $4, payout = round(bet_amount * $4, 2), settled_at = now()
       WHERE id = $1 AND user_id = $2 AND round_id = $3 AND status = 'placed' RETURNING payout`,
      [betId, userId, roundId, m]);
    if (!upd.rows.length) return null;
    const payout = Number(upd.rows[0].payout);
    const bal = await c.query(
      'UPDATE users SET balance = balance + $2, balance_updated_at = $3, version = version + 1 WHERE id = $1 RETURNING balance',
      [userId, payout, Date.now()]);
    return { success: true, payout, multiplier: m, newBalance: Number(bal.rows[0].balance), betId };
  });
  if (!result) throw new Error(await describeBetFailure(userId, betId, roundId));
  return result;
}

async function getUserAviatorBets(userId, limit = 30) {
  const { rows } = await q(
    `SELECT * FROM bets WHERE user_id = $1 AND game = 'aviator' ORDER BY created_at DESC LIMIT $2`, [userId, limit]);
  return rows.map(mapBet);
}

async function getRoundBets(roundId) {
  const { rows } = await q(
    `SELECT * FROM bets WHERE round_id = $1 AND game = 'aviator' AND status <> 'cancelled' ORDER BY bet_amount DESC, created_at LIMIT 200`,
    [roundId]);
  return rows.map(mapBet);
}

// Real bets of a round for the public live feed (names masked, no ids of users).
async function getRoundBetsPublic(roundId) {
  const bets = await getRoundBets(roundId);
  return bets.slice(0, 50).map(b => ({
    id: b.id,
    username: maskName(b.username),
    amount: b.betAmount,
    status: b.status,
    multiplier: b.status === 'won' ? b.multiplier : null,
    payout: b.status === 'won' ? b.payout : null
  }));
}

async function getUserBalance(userId) {
  const { rows } = await q('SELECT balance FROM users WHERE id = $1', [userId]);
  return rows.length ? Number(rows[0].balance) : 0;
}

// ---------------------------------------------------------------- mines (disabled by default)
async function saveUserMinesGame(userId, session) {
  await kvSet(`mines:${userId}`, session);
}
async function getUserMinesGame(userId) {
  return kvGet(`mines:${userId}`);
}
async function clearUserMinesGame(userId) {
  await q('DELETE FROM kv WHERE key = $1', [`mines:${userId}`]);
}

async function recordBet({ userId, username, game, betAmount, multiplier, payout, status }) {
  const { rows } = await q(
    `INSERT INTO bets (id, user_id, username, game, bet_amount, multiplier, payout, status, settled_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now()) RETURNING *`,
    [newId('bet'), userId, username || '', game, round2(betAmount), round2(multiplier), round2(payout), status]);
  return mapBet(rows[0]);
}

async function getRecentBets(limit = 20) {
  const { rows } = await q(`SELECT * FROM bets WHERE status <> 'cancelled' ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map(mapBet);
}

// ---------------------------------------------------------------- kv / settings / stats
async function kvGet(key) {
  const { rows } = await q('SELECT value FROM kv WHERE key = $1', [key]);
  return rows.length ? rows[0].value : null;
}

async function kvSet(key, value) {
  await q(
    `INSERT INTO kv (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]);
}

let settingsCache = null;
let settingsAt = 0;
async function getGameSettings({ fresh = false } = {}) {
  if (!fresh && settingsCache && Date.now() - settingsAt < 3000) return settingsCache;
  const stored = await kvGet('gameSettings');
  settingsCache = { ...DEFAULT_SETTINGS, ...(stored || {}) };
  settingsAt = Date.now();
  return settingsCache;
}

async function updateGameSettings(newSettings) {
  const current = await getGameSettings({ fresh: true });
  const next = { ...current };
  for (const [k, v] of Object.entries(newSettings || {})) {
    if (!(k in DEFAULT_SETTINGS)) continue;
    if (k === 'maintenance') next[k] = Boolean(v);
    else if (Number.isFinite(Number(v))) next[k] = Number(v);
  }
  await kvSet('gameSettings', next);
  settingsCache = next;
  settingsAt = Date.now();
  return next;
}

async function getStats() {
  const { rows } = await q(`
    SELECT
      (SELECT COALESCE(sum(bet_amount), 0) FROM bets WHERE status IN ('placed','won','lost')) AS wagered,
      (SELECT COALESCE(sum(payout), 0) FROM bets WHERE status = 'won') AS payouts,
      (SELECT count(*) FROM users) AS users,
      (SELECT count(*) FROM transactions WHERE status = 'pending') AS pending,
      (SELECT COALESCE(sum(amount), 0) FROM transactions WHERE type = 'deposit' AND status = 'approved') AS deposits,
      (SELECT COALESCE(sum(amount), 0) FROM transactions WHERE type = 'withdraw' AND status = 'approved') AS withdrawals,
      (SELECT COALESCE(sum(balance), 0) FROM users) AS player_balances`);
  const r = rows[0];
  const wagered = round2(r.wagered);
  const payouts = round2(r.payouts);
  return {
    totalWagered: wagered,
    totalPayouts: payouts,
    grossGamingRevenue: round2(wagered - payouts),
    totalUsers: Number(r.users),
    pendingTransactions: Number(r.pending),
    totalDeposits: round2(r.deposits),
    totalWithdrawals: round2(r.withdrawals),
    playerBalances: round2(r.player_balances)
  };
}

async function resetPlatformData() {
  return tx(async c => {
    await c.query('DELETE FROM bets');
    await c.query('DELETE FROM transactions');
    await c.query("DELETE FROM kv WHERE key LIKE 'mines:%'");
    const u = await c.query('UPDATE users SET balance = 0, bonus_balance = 0, balance_updated_at = $1, version = version + 1', [Date.now()]);
    return { stats: { totalWagered: 0, totalPayouts: 0, grossGamingRevenue: 0 }, transactionsCount: 0, usersCount: u.rowCount };
  });
}

module.exports = {
  SUPER_ADMIN_USERNAME,
  SUPER_ADMIN_EMAIL,
  isSuperAdmin,
  maskName,
  bootstrap,
  // users
  findUserById,
  findUserByUsername,
  findUserByEmail,
  findUserByIdentifier,
  createUser,
  recordLogin,
  setPassword,
  listUsers,
  updateUserBalance,
  setUserExactBalance,
  setUserBanned,
  deleteUser,
  getUserBalance,
  // cashier
  createTransaction,
  processTransaction,
  getTransactions,
  // aviator
  placeBetTransaction,
  cancelBetTransaction,
  cashoutBetTransaction,
  settleAviatorRound,
  settleFinishedRounds,
  getUserAviatorBets,
  getRoundBets,
  getRoundBetsPublic,
  // mines / generic bets
  saveUserMinesGame,
  getUserMinesGame,
  clearUserMinesGame,
  recordBet,
  getRecentBets,
  // settings / stats / kv
  kvGet,
  kvSet,
  getGameSettings,
  updateGameSettings,
  getStats,
  resetPlatformData
};
