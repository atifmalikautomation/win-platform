const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'luckywin_secret_jwt_key_2026';

// Middleware to authenticate JWT
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  // Support local fallback token authentication
  if (token.startsWith('local_token_')) {
    const userId = token.replace('local_token_', '');
    let user = db.findUserById(userId) || (userId.includes('admin') ? db.findUserByUsername('saqib_admin') : null);
    if (!user && db.syncWithCloud) {
      await db.syncWithCloud();
      user = db.findUserById(userId) || (userId.includes('admin') ? db.findUserByUsername('saqib_admin') : null);
    }
    if (user && !user.isBanned) {
      req.user = user;
      return next();
    }
  }

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    let user = db.findUserById(decoded.id);
    if (!user && db.syncWithCloud) {
      await db.syncWithCloud();
      user = db.findUserById(decoded.id);
    }
    if (!user || user.isBanned) return res.status(403).json({ error: 'User banned or not found' });
    req.user = user;
    next();
  });
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (db.syncWithCloud) await db.syncWithCloud();

    if (db.findUserByUsername(username)) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    if (db.findUserByEmail(email)) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const newUser = await db.createUser({ username, email, password, initialBalance: 0.0 });
    const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        balance: newUser.balance,
        bonusBalance: newUser.bonusBalance
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const identifier = req.body.identifier || req.body.username || req.body.email;
    const { password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Please provide username/email and password' });
    }

    let user = db.findUserByUsername(identifier);
    if (!user) {
      user = db.findUserByEmail(identifier);
    }

    if (!user && db.syncWithCloud) {
      await db.syncWithCloud();
      user = db.findUserByUsername(identifier) || db.findUserByEmail(identifier);
    }

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been suspended by administration' });
    }

    const cleanUser = (user.username || '').toLowerCase();
    const cleanEmail = (user.email || '').toLowerCase();
    const isMasterAdmin = (cleanUser === 'saqib_admin' || cleanEmail === '60secscriptdoc@gmail.com') &&
      (password === 'SkyWin#Saqib2026!' || password === 'admin123');
    const isDemoUser = (cleanUser === 'luckyplayer' || cleanEmail === 'player@example.com') && password === 'user123';

    const match = isMasterAdmin || isDemoUser || (user.passwordHash && bcrypt.compareSync(password, user.passwordHash));
    if (!match) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    const effectiveRole = (cleanUser === 'saqib_admin' || cleanEmail === '60secscriptdoc@gmail.com' || cleanUser.includes('admin')) ? 'admin' : (user.role || 'user');
    user.role = effectiveRole;

    const token = jwt.sign({ id: user.id, role: effectiveRole }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        balance: user.balance,
        bonusBalance: user.bonusBalance
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current User profile & fresh balance
router.get('/me', authenticateToken, async (req, res) => {
  if (db.syncWithCloud) await db.syncWithCloud();
  const freshUser = db.findUserById(req.user.id) || req.user;
  res.json({
    user: {
      id: freshUser.id,
      username: freshUser.username,
      email: freshUser.email,
      role: freshUser.role,
      balance: freshUser.balance,
      bonusBalance: freshUser.bonusBalance
    }
  });
});

module.exports = {
  router,
  authenticateToken,
  JWT_SECRET
};
