const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'luckywin_secret_jwt_key_2026';

// Middleware to authenticate JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    const user = db.findUserById(decoded.id);
    if (!user || user.isBanned) return res.status(403).json({ error: 'User banned or not found' });
    req.user = user;
    next();
  });
}

// Register
router.post('/register', (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (db.findUserByUsername(username)) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    if (db.findUserByEmail(email)) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const newUser = db.createUser({ username, email, password, initialBalance: 1500.0 });
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
router.post('/login', (req, res) => {
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

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been suspended by administration' });
    }

    const match = bcrypt.compareSync(password, user.passwordHash);
    if (!match) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

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
router.get('/me', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
      balance: req.user.balance,
      bonusBalance: req.user.bonusBalance
    }
  });
});

module.exports = {
  router,
  authenticateToken,
  JWT_SECRET
};
