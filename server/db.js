const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.VERCEL
  ? path.join('/tmp', 'data.json')
  : path.join(__dirname, 'data.json');

const CLOUD_DB_URL = 'https://api.restful-api.dev/objects/ff808181a09d98f701a0b68e3a7539c1';
let memoryCache = null;
let lastCloudSync = 0;

// Cloud Sync Helpers
async function syncWithCloud() {
  try {
    const res = await fetch(CLOUD_DB_URL, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json && json.data && Array.isArray(json.data.users)) {
        memoryCache = json.data;
        lastCloudSync = Date.now();
        try {
          fs.writeFileSync(DB_PATH, JSON.stringify(json.data, null, 2), 'utf8');
        } catch (e) {}
        return memoryCache;
      }
    }
  } catch (e) {}
  return memoryCache;
}

async function pushToCloud(data) {
  try {
    const payload = JSON.stringify({ name: 'skywin_database', data });
    await fetch(CLOUD_DB_URL, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
  } catch (e) {
    console.error('Cloud push error:', e.message);
  }
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

  const defaultAdminPassword = bcrypt.hashSync('SkyWin#Saqib2026!', 10);
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
      return memoryCache;
    } catch (err) {
      console.warn('Error reading DB_PATH file, using memory cache:', err.message);
    }
  }
  return memoryCache;
}

// Atomic write with cloud persistence
async function writeDB(data) {
  memoryCache = data;
  try {
    const tempPath = `${DB_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tempPath, DB_PATH);
  } catch (err) {
    console.warn('writeDB filesystem write failed (using memory cache):', err.message);
  }
  await pushToCloud(data);
}

// User Helpers
function findUserById(id) {
  const db = readDB();
  return db.users.find(u => u.id === id);
}

function findUserByUsername(username) {
  const db = readDB();
  return db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
}

function findUserByEmail(email) {
  const db = readDB();
  return db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

async function createUser({ username, email, password, role = 'user', initialBalance = 0.0 }) {
  const db = readDB();
  const newUser = {
    id: `usr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    username,
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    role,
    balance: Number(initialBalance),
    bonusBalance: 0.0,
    createdAt: new Date().toISOString(),
    isBanned: false
  };
  db.users.push(newUser);
  await writeDB(db);
  return newUser;
}

// Atomic Balance Adjustment with safety checks
async function updateUserBalance(userId, deltaAmount) {
  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) throw new Error('User not found');

  const newBalance = Math.round((user.balance + deltaAmount) * 100) / 100;
  if (newBalance < 0) {
    throw new Error('Insufficient balance');
  }

  user.balance = newBalance;
  await writeDB(db);
  return newBalance;
}

// Transactions / Cashier
async function createTransaction({ userId, username, type, method, amount, accountNumber, reference, proofUrl = '', proofScreenshot = '' }) {
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
  }

  db.transactions.unshift(tx);
  await writeDB(db);
  return tx;
}

async function processTransaction(txId, action, adminNotes = '') {
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
    }
  } else if (action === 'reject') {
    tx.status = 'rejected';
    tx.notes = adminNotes;

    // If withdrawal was rejected, refund the reserved balance back to user
    if (tx.type === 'withdraw' && user) {
      user.balance = Math.round((user.balance + tx.amount) * 100) / 100;
    }
  }

  await writeDB(db);
  return tx;
}

function getTransactions(userId = null) {
  const db = readDB();
  if (userId) {
    return db.transactions.filter(t => t.userId === userId);
  }
  return db.transactions;
}

// Bets & Stats
async function recordBet({ userId, username, game, betAmount, multiplier, payout, status }) {
  const db = readDB();
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
  db.stats.totalWagered = Math.round((db.stats.totalWagered + betAmount) * 100) / 100;
  db.stats.totalPayouts = Math.round((db.stats.totalPayouts + payout) * 100) / 100;
  db.stats.grossGamingRevenue = Math.round((db.stats.totalWagered - db.stats.totalPayouts) * 100) / 100;

  await writeDB(db);
  return bet;
}

function getRecentBets(limit = 20) {
  const db = readDB();
  return db.bets.slice(0, limit);
}

function getGameSettings() {
  const db = readDB();
  return db.gameSettings;
}

async function updateGameSettings(newSettings) {
  const db = readDB();
  db.gameSettings = { ...db.gameSettings, ...newSettings };
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
  createUser,
  updateUserBalance,
  createTransaction,
  processTransaction,
  getTransactions,
  recordBet,
  getRecentBets,
  getGameSettings,
  updateGameSettings,
  getStats,
  resetPlatformData,
  syncWithCloud
};

