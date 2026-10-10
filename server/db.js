const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const blobStore = require('./blobStore');

const DB_PATH = process.env.SKYWIN_DB_PATH
  || (process.env.VERCEL ? path.join('/tmp', 'data.json') : path.join(__dirname, 'data.json'));

// Token comes ONLY from the environment (the repository is public).
const BLOB_FILE_NAME = 'skywin-database.json';

let memoryCache = null;
let lastCloudSync = 0;
let lastLocalWrite = 0;

// Cloud Sync Helpers: Vercel Private Blob is the single persistent source of truth
async function syncWithCloud(force = false) {
  const now = Date.now();

  // If this process just wrote data within the last 1.5 seconds, local memory is newer
  if (memoryCache && Array.isArray(memoryCache.users) && (now - lastLocalWrite < 1500)) {
    return memoryCache;
  }

  // If not forced and synced within the last 800ms, use current cache
  if (!force && memoryCache && Array.isArray(memoryCache.users) && (now - lastCloudSync < 800)) {
    return memoryCache;
  }

  // Vercel Private Blob (single source of truth)
  const res = await blobStore.readJson(BLOB_FILE_NAME);
  if (res.ok && res.data && Array.isArray(res.data.users) && res.data.users.length > 0) {
    const json = res.data;
    // Guard: If a local write occurred while the fetch was in flight, do not overwrite!
    if (Date.now() - lastLocalWrite < 1500 && memoryCache) {
      return memoryCache;
    }
    if (!Array.isArray(json.transactions)) json.transactions = [];
    if (!Array.isArray(json.bets)) json.bets = [];
    if (!json.stats) json.stats = { totalWagered: 0, totalPayouts: 0, grossGamingRevenue: 0 };
    memoryCache = json;
    lastCloudSync = now;
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(memoryCache), 'utf8');
    } catch (e) {}
    return memoryCache;
  }

  return memoryCache || readDB();
}

async function pushToCloud(data) {
  // NOTE: the old public restful-api.dev "backup" was removed: anyone on the
  // internet could read (emails, password hashes) or overwrite it.
  await blobStore.writeJson(BLOB_FILE_NAME, data);
}

// Initialize database structure
function initDB() {
  if (memoryCache) return;

  // If DB_PATH exists, load into memory
  if (fs.existsSync(DB_PATH)) {
    try {
      memoryCache = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      return;
    } catch (e) {
      console.warn('Failed reading existing DB_PATH, will seed fresh:', e.message);
    }
  }

  // If in Vercel, try to copy seed from __dirname/data.json
  const seedPath = path.join(__dirname, 'data.json');
  if (DB_PATH !== seedPath && fs.existsSync(seedPath)) {
    try {
      const seedContent = fs.readFileSync(seedPath, 'utf8');
      memoryCache = JSON.parse(seedContent);
      fs.writeFileSync(DB_PATH, seedContent, 'utf8');
      return;
    } catch (e) {
      console.warn('Could not copy seed to DB_PATH:', e.message);
    }
  }

  const defaultAdminPassword = bcrypt.hashSync(process.env.ADMIN_PASSWORD || require('crypto').randomBytes(24).toString('hex'), 10);
  const defaultUserPassword = bcrypt.hashSync('user123', 10);

  const initialData = {
    users: [
      {
        id: 'usr_saqib_admin',
        username: 'saqib_admin',
        email: '60secscriptdoc@gmail.com',
        passwordHash: defaultAdminPassword,
        role: 'admin',
        balance: 100000.0,
        bonusBalance: 0.0,
        createdAt: new Date().toISOString(),
        isBanned: false
      },
      {
        id: 'usr_demo',
        username: 'LuckyPlayer',
        email: 'player@example.com',
        passwordHash: defaultUserPassword,
        role: 'user',
        balance: 0.0,
        bonusBalance: 0.0,
        createdAt: new Date().toISOString(),
        isBanned: false
      }
    ],
    transactions: [],
    bets: [],
    gameSettings: {
      crashRtp: 96,
      houseEdge: 4,
      minBet: 10,
      maxBet: 50000,
      maxPayout: 1000000,
      maintenance: false
    },
    stats: {
      totalWagered: 0.0,
      totalPayouts: 0.0,
      grossGamingRevenue: 0.0
    }
  };

  memoryCache = initialData;
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(initialData, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not write initialData to DB_PATH (read-only filesystem):', err.message);
  }
}

// Thread-safe read
function readDB() {
  initDB();
  if (fs.existsSync(DB_PATH)) {
    try {
      const raw = fs.readFileSync(DB_PATH, 'utf8');
      memoryCache = JSON.parse(raw);
    } catch (err) {
      console.warn('Error reading DB_PATH file, using memory cache:', err.message);
    }
  }
  if (memoryCache) {
    if (!Array.isArray(memoryCache.users)) memoryCache.users = [];
    if (!Array.isArray(memoryCache.bets)) memoryCache.bets = [];
    if (!Array.isArray(memoryCache.transactions)) memoryCache.transactions = [];
    if (!memoryCache.stats) memoryCache.stats = { totalWagered: 0.0, totalPayouts: 0.0, grossGamingRevenue: 0.0 };
    if (!memoryCache.gameSettings) {
      memoryCache.gameSettings = {
        crashRtp: 96,
        houseEdge: 4,
        minBet: 10,
        maxBet: 50000,
        maxPayout: 1000000,
        maintenance: false,
        aviatorMode: 'fair',
        forcedNextMultiplier: null,
        crashNowTriggered: 0
      };
    }
  }
  return memoryCache;
}

// Atomic write with cloud persistence
async function writeDB(data) {
  memoryCache = data;
  lastCloudSync = Date.now();
  lastLocalWrite = Date.now();
  try {
    const tempPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, DB_PATH);
  } catch (err) {
    console.warn('writeDB filesystem write failed (using memory cache):', err.message);
  }
  // Await cloud push so serverless lambda does not suspend before blob write finishes
  try {
    await pushToCloud(data);
  } catch (err) {
    console.error('Cloud push error:', err.message);
  }
}

// User Helpers
function findUserById(id) {
  if (!id) return null;
  const db = readDB();
  return db.users.find(u => u.id === id);
}

function findUserByUsername(username) {
  if (!username) return null;
  const db = readDB();
  const clean = username.trim().toLowerCase();
  return db.users.find(u => (u.username || '').trim().toLowerCase() === clean);
}

function findUserByEmail(email) {
  if (!email) return null;
  const db = readDB();
  const clean = email.trim().toLowerCase();
  return db.users.find(u => (u.email || '').trim().toLowerCase() === clean);
}

function findUserByIdentifier(identifier) {
  if (!identifier) return null;
  const db = readDB();
  const clean = identifier.trim().toLowerCase();
  return db.users.find(u =>
    (u.username && u.username.trim().toLowerCase() === clean) ||
    (u.email && u.email.trim().toLowerCase() === clean)
  );
}

async function createUser({ username, email, password, role = 'user', initialBalance = 0.0, authProvider = 'email', picture = '', lastLogin = null }) {
  const db = readDB();
  const cleanUsername = (username || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanRole = (cleanUsername.toLowerCase() === 'saqib_admin' || cleanEmail === '60secscriptdoc@gmail.com') ? 'admin' : role;
  const nowIso = new Date().toISOString();

  const newUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    username: cleanUsername,
    email: cleanEmail,
    passwordHash: bcrypt.hashSync(password, 10),
    role: cleanRole,
    balance: Number(initialBalance),
    bonusBalance: 0.0,
    balanceUpdatedAt: Date.now(),
    version: 1,
    createdAt: nowIso,
    lastLogin: lastLogin || nowIso,
    authProvider: authProvider || (cleanEmail.includes('@gmail.com') ? 'google' : 'email'),
    picture: picture || '',
    isBanned: false
  };
  db.users.push(newUser);
  await writeDB(db);
  return newUser;
}

// Atomic Balance Adjustment with safety checks
async function updateUserBalance(userId, deltaAmount) {
  if (syncWithCloud) await syncWithCloud(true);
  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  const newBalance = Math.max(0, Math.round((user.balance + deltaAmount) * 100) / 100);
  if (deltaAmount < 0 && (user.balance + deltaAmount) < -0.01) {
    throw new Error('Insufficient balance');
  }

  user.balance = newBalance;
  user.balanceUpdatedAt = Date.now();
  user.version = (user.version || 0) + 1;
  await writeDB(db);
  return newBalance;
}

// Set Exact User Balance (e.g. from Admin direct set)
async function setUserExactBalance(userId, exactAmount) {
  if (syncWithCloud) await syncWithCloud(true);
  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  const newBalance = Math.max(0, Math.round(Number(exactAmount) * 100) / 100);
  user.balance = newBalance;
  user.balanceUpdatedAt = Date.now();
  user.version = (user.version || 0) + 1;
  await writeDB(db);
  return newBalance;
}

// Permanently Delete User Account
async function deleteUser(userId) {
  if (syncWithCloud) await syncWithCloud(true);
  const db = readDB();
  const userIdx = db.users.findIndex(u => u.id === userId);
  if (userIdx === -1) throw new Error('User not found');

  const user = db.users[userIdx];
  const cleanName = (user.username || '').toLowerCase();
  const cleanEmail = (user.email || '').toLowerCase();
  if (cleanName === 'saqib_admin' || cleanEmail === '60secscriptdoc@gmail.com') {
    throw new Error('Super Admin account cannot be deleted');
  }

  // Remove user
  db.users.splice(userIdx, 1);
  // Remove user bets
  if (Array.isArray(db.bets)) {
    db.bets = db.bets.filter(b => b.userId !== userId);
  }
  // Remove user transactions
  if (Array.isArray(db.transactions)) {
    db.transactions = db.transactions.filter(t => t.userId !== userId);
  }

  await writeDB(db);
  return { success: true, deletedUserId: userId, username: user.username };
}

// Transactions / Cashier
async function createTransaction({ userId, username, type, method, amount, accountNumber, reference, proofUrl = '', proofScreenshot = '' }) {
  if (syncWithCloud) await syncWithCloud(true);
  const db = readDB();
  const tx = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    userId,
    username,
    type, // 'deposit' | 'withdraw'
    method, // 'easypaisa' | 'jazzcash'
    amount: Number(amount),
    accountNumber: accountNumber || '',
    reference: reference || '',
    proofUrl,
    proofScreenshot: proofScreenshot || proofUrl || '',
    status: 'pending', // 'pending' | 'approved' | 'rejected'
    createdAt: new Date().toISOString(),
    approvedAt: null
  };

  // If user requested withdrawal, immediately reserve/deduct the balance
  if (type === 'withdraw') {
    const user = db.users.find(u => u.id === userId);
    if (!user || user.balance < amount) {
      throw new Error('Insufficient balance for withdrawal');
    }
    user.balance = Math.round((user.balance - amount) * 100) / 100;
    user.balanceUpdatedAt = Date.now();
    user.version = (user.version || 0) + 1;
  }

  db.transactions.unshift(tx);
  await writeDB(db);
  return tx;
}

async function processTransaction(txId, action, adminNotes = '') {
  if (syncWithCloud) await syncWithCloud(true);
  const db = readDB();
  const tx = db.transactions.find(t => t.id === txId);
  if (!tx) throw new Error('Transaction not found');
  if (tx.status !== 'pending') throw new Error('Transaction is already processed');

  const user = db.users.find(u => u.id === tx.userId);

  if (action === 'approve') {
    tx.status = 'approved';
    tx.approvedAt = new Date().toISOString();
    tx.notes = adminNotes;

    // For approved deposit, credit user balance
    if (tx.type === 'deposit' && user) {
      user.balance = Math.round((user.balance + tx.amount) * 100) / 100;
      user.balanceUpdatedAt = Date.now();
      user.version = (user.version || 0) + 1;
    }
  } else if (action === 'reject') {
    tx.status = 'rejected';
    tx.notes = adminNotes;

    // If withdrawal was rejected, refund the reserved balance back to user
    if (tx.type === 'withdraw' && user) {
      user.balance = Math.round((user.balance + tx.amount) * 100) / 100;
      user.balanceUpdatedAt = Date.now();
      user.version = (user.version || 0) + 1;
    }
  }

  await writeDB(db);
  return tx;
}

function getTransactions(userId = null) {
  const db = readDB();
  const list = Array.isArray(db.transactions) ? db.transactions : [];
  if (userId) {
    return list.filter(t => t.userId === userId);
  }
  return list;
}

// ==================== AVIATOR BETS (round-aware) ====================
// Every bet is tied to a roundId. Finished rounds are settled from the global
// engine's real result (voided round = refund, autoCashout honoured server-side).

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function ensureCollections(db) {
  if (!Array.isArray(db.bets)) db.bets = [];
  if (!db.stats) db.stats = { totalWagered: 0.0, totalPayouts: 0.0, grossGamingRevenue: 0.0 };
}

function recalcGgr(db) {
  db.stats.grossGamingRevenue = round2((db.stats.totalWagered || 0) - (db.stats.totalPayouts || 0));
}

function touchBalance(user, newBalance) {
  user.balance = round2(Math.max(0, newBalance));
  user.balanceUpdatedAt = Date.now();
  user.version = (user.version || 0) + 1;
}

// Settles a user's finished aviator bets inside an already-loaded db object.
// Returns true when something changed.
function settleAviatorBetsInDb(db, userId, getRoundResult) {
  ensureCollections(db);
  const user = db.users.find(u => u.id === userId);
  if (!user || typeof getRoundResult !== 'function') return false;
  let modified = false;
  for (const b of db.bets) {
    if (b.game !== 'aviator' || b.userId !== userId || b.status !== 'placed') continue;
    if (b.roundId == null) {
      // Legacy bet from the old engine: no round link, cannot be verified.
      b.status = 'lost';
      modified = true;
      continue;
    }
    const result = getRoundResult(b.roundId);
    if (!result) continue; // round not finished yet
    if (result.voided) {
      b.status = 'refunded';
      b.settledAt = new Date().toISOString();
      touchBalance(user, Number(user.balance || 0) + b.betAmount);
      db.stats.totalWagered = round2(Math.max(0, (db.stats.totalWagered || 0) - b.betAmount));
    } else if (b.autoCashout && result.crashAt >= b.autoCashout) {
      const payout = round2(b.betAmount * b.autoCashout);
      b.status = 'won';
      b.multiplier = b.autoCashout;
      b.payout = payout;
      b.settledAt = new Date().toISOString();
      touchBalance(user, Number(user.balance || 0) + payout);
      db.stats.totalPayouts = round2((db.stats.totalPayouts || 0) + payout);
    } else {
      b.status = 'lost';
      b.crashAt = result.crashAt;
      b.settledAt = new Date().toISOString();
    }
    modified = true;
  }
  if (modified) recalcGgr(db);
  return modified;
}

async function settleUserAviatorBets(userId, getRoundResult) {
  if (syncWithCloud) await syncWithCloud(true);
  const db = readDB();
  if (settleAviatorBetsInDb(db, userId, getRoundResult)) {
    await writeDB(db);
  }
  const user = db.users.find(u => u.id === userId);
  return user ? Number(user.balance || 0) : 0;
}

function hasOpenAviatorBets(userId) {
  const db = readDB();
  return Array.isArray(db.bets) && db.bets.some(b => b.game === 'aviator' && b.userId === userId && b.status === 'placed');
}

async function placeBetTransaction({ userId, betAmount, autoCashout, roundId, getRoundResult, minBet = 10, maxBet = 50000 }) {
  if (syncWithCloud) await syncWithCloud(true);
  const db = readDB();
  ensureCollections(db);
  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');
  if (roundId == null) throw new Error('No active round');

  settleAviatorBetsInDb(db, userId, getRoundResult);

  const numAmount = Math.floor(Number(betAmount));
  if (!Number.isFinite(numAmount) || numAmount < minBet) throw new Error(`Minimum bet is PKR ${minBet}`);
  if (numAmount > maxBet) throw new Error(`Maximum bet is PKR ${maxBet}`);

  let auto = null;
  if (autoCashout !== null && autoCashout !== undefined && autoCashout !== '') {
    auto = round2(autoCashout);
    if (!(auto >= 1.01 && auto <= 1000)) throw new Error('Auto cash out must be between 1.01x and 1000x');
  }

  const sameRound = db.bets.filter(b => b.game === 'aviator' && b.userId === userId && b.roundId === roundId && b.status === 'placed');
  if (sameRound.length >= 2) throw new Error('Maximum 2 bets per round');

  const currentBal = Number(user.balance || 0);
  if (currentBal < numAmount) throw new Error('Insufficient balance');
  touchBalance(user, currentBal - numAmount);

  const betRecord = {
    id: `crash_bet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: user.id,
    username: user.username,
    game: 'aviator',
    roundId,
    amount: numAmount,
    betAmount: numAmount,
    multiplier: 0,
    payout: 0,
    status: 'placed', // 'placed' | 'won' | 'lost' | 'cancelled' | 'refunded'
    autoCashout: auto,
    createdAt: new Date().toISOString()
  };

  db.bets.unshift(betRecord);
  if (db.bets.length > 1000) db.bets.length = 1000;

  db.stats.totalWagered = round2((db.stats.totalWagered || 0) + numAmount);
  recalcGgr(db);

  await writeDB(db);
  return { success: true, bet: betRecord, newBalance: user.balance };
}

async function cancelBetTransaction({ userId, betId, roundId }) {
  if (syncWithCloud) await syncWithCloud(true);
  const db = readDB();
  ensureCollections(db);
  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  const betRecord = db.bets.find(b => b.id === betId && b.userId === userId);
  if (!betRecord) throw new Error('Bet not found');
  if (betRecord.status !== 'placed') throw new Error(`Cannot cancel bet: status is already '${betRecord.status}'`);
  if (betRecord.roundId !== roundId) throw new Error('This bet belongs to a round that has already started');

  betRecord.status = 'cancelled';
  betRecord.cancelledAt = new Date().toISOString();
  touchBalance(user, Number(user.balance || 0) + betRecord.betAmount);

  db.stats.totalWagered = round2(Math.max(0, (db.stats.totalWagered || 0) - betRecord.betAmount));
  recalcGgr(db);

  await writeDB(db);
  return { success: true, cancelledBetId: betId, newBalance: user.balance };
}

// multiplier must already be verified by the route against the global engine.
async function cashoutBetTransaction({ userId, betId, roundId, multiplier }) {
  if (syncWithCloud) await syncWithCloud(true);
  const db = readDB();
  ensureCollections(db);
  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  const numMultiplier = Math.floor(Number(multiplier) * 100 + 1e-6) / 100;
  if (!(numMultiplier >= 1.0)) throw new Error('Invalid multiplier');

  const betRecord = db.bets.find(b => b.id === betId && b.userId === userId);
  if (!betRecord) throw new Error('Active bet not found for cashout');
  if (betRecord.status === 'won') throw new Error('Bet has already been cashed out');
  if (betRecord.status === 'cancelled') throw new Error('Bet was cancelled');
  if (betRecord.status === 'refunded') throw new Error('Round was stopped; bet refunded');
  if (betRecord.status === 'lost') throw new Error('Plane already flew away; bet was lost');
  if (betRecord.roundId !== roundId) throw new Error('This bet is not in the current flight');

  const payout = round2(betRecord.betAmount * numMultiplier);
  touchBalance(user, Number(user.balance || 0) + payout);

  betRecord.multiplier = numMultiplier;
  betRecord.payout = payout;
  betRecord.status = 'won';
  betRecord.cashedOutAt = new Date().toISOString();

  db.stats.totalPayouts = round2((db.stats.totalPayouts || 0) + payout);
  recalcGgr(db);

  await writeDB(db);
  return { success: true, payout, multiplier: numMultiplier, newBalance: user.balance, betId: betRecord.id };
}

function getUserAviatorBets(userId, limit = 30) {
  const db = readDB();
  return (db.bets || []).filter(b => b.game === 'aviator' && b.userId === userId).slice(0, limit);
}

// Real bets of a round for the public live feed (names masked).
function getRoundBetsPublic(roundId) {
  const db = readDB();
  return (db.bets || [])
    .filter(b => b.game === 'aviator' && b.roundId === roundId && b.status !== 'cancelled')
    .slice(0, 50)
    .map(b => ({
      id: b.id,
      username: maskName(b.username),
      amount: b.betAmount,
      status: b.status,
      multiplier: b.status === 'won' ? b.multiplier : null,
      payout: b.status === 'won' ? b.payout : null
    }));
}

function maskName(name) {
  const n = String(name || 'player');
  if (n.length <= 3) return `${n[0]}**`;
  return `${n.slice(0, 2)}***${n.slice(-1)}`;
}


// Mines Serverless Persistence Helpers (Stops in-memory loss across lambdas)
async function saveUserMinesGame(userId, session) {
  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  if (user) {
    user.activeMinesGame = session;
    await writeDB(db);
  }
}

function getUserMinesGame(userId) {
  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  return (user && user.activeMinesGame) ? user.activeMinesGame : null;
}

async function clearUserMinesGame(userId) {
  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  if (user) {
    delete user.activeMinesGame;
    await writeDB(db);
  }
}

// Bets & Stats
async function recordBet({ userId, username, game, betAmount, multiplier, payout, status }) {
  const db = readDB();
  if (!Array.isArray(db.bets)) db.bets = [];
  if (!db.stats) db.stats = { totalWagered: 0.0, totalPayouts: 0.0, grossGamingRevenue: 0.0 };

  const bet = {
    id: `bet_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    userId,
    username,
    game,
    betAmount: Number(betAmount),
    multiplier: Number(multiplier),
    payout: Number(payout),
    status, // 'won' | 'lost'
    createdAt: new Date().toISOString()
  };

  db.bets.unshift(bet);
  if (db.bets.length > 500) db.bets.pop(); // Keep last 500 records

  // Update overall platform statistics
  db.stats.totalWagered = Math.round(((db.stats.totalWagered || 0) + betAmount) * 100) / 100;
  db.stats.totalPayouts = Math.round(((db.stats.totalPayouts || 0) + payout) * 100) / 100;
  db.stats.grossGamingRevenue = Math.round((db.stats.totalWagered - db.stats.totalPayouts) * 100) / 100;

  await writeDB(db);
  return bet;
}

function getRecentBets(limit = 20) {
  const db = readDB();
  const list = Array.isArray(db.bets) ? db.bets : [];
  return list.slice(0, limit);
}

function getGameSettings() {
  const db = readDB();
  if (!db.gameSettings) {
    db.gameSettings = {
      crashRtp: 96,
      houseEdge: 4,
      minBet: 10,
      maxBet: 50000,
      maxPayout: 1000000,
      maintenance: false,
      aviatorMode: 'fair',
      forcedNextMultiplier: null,
      crashNowTriggered: 0
    };
  }
  return db.gameSettings;
}

async function updateGameSettings(newSettings) {
  const db = readDB();
  db.gameSettings = { ...getGameSettings(), ...newSettings };
  await writeDB(db);
  return db.gameSettings;
}

function getStats() {
  const db = readDB();
  return {
    ...db.stats,
    totalUsers: db.users.length,
    pendingTransactions: db.transactions.filter(t => t.status === 'pending').length
  };
}

// Complete Platform Reset to 0 (Fresh Start)
async function resetPlatformData() {
  const db = readDB();
  db.transactions = [];
  db.bets = [];
  db.stats = {
    totalWagered: 0.0,
    totalPayouts: 0.0,
    grossGamingRevenue: 0.0
  };
  // Reset balances for users to 0.0
  db.users.forEach(u => {
    u.balance = 0.0;
    u.bonusBalance = 0.0;
  });
  await writeDB(db);
  return {
    stats: db.stats,
    transactionsCount: 0,
    usersCount: db.users.length
  };
}

module.exports = {
  readDB,
  writeDB,
  findUserById,
  findUserByUsername,
  findUserByEmail,
  findUserByIdentifier,
  createUser,
  updateUserBalance,
  setUserExactBalance,
  deleteUser,
  createTransaction,
  processTransaction,
  getTransactions,
  recordBet,
  placeBetTransaction,
  cancelBetTransaction,
  cashoutBetTransaction,
  settleUserAviatorBets,
  hasOpenAviatorBets,
  getUserAviatorBets,
  getRoundBetsPublic,
  saveUserMinesGame,
  getUserMinesGame,
  clearUserMinesGame,
  getRecentBets,
  getGameSettings,
  updateGameSettings,
  getStats,
  resetPlatformData,
  syncWithCloud
};

