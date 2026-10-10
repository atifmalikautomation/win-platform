const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

// SECURITY: the repository is public, so the secret must come from the environment.
function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.VERCEL) {
    // Last-resort: derive from another server-only secret so it is never public.
    const base = process.env.AVIATOR_SECRET || process.env.DATABASE_URL;
    if (base) return crypto.createHash('sha256').update(`jwt:${base}`).digest('hex');
    throw new Error('JWT_SECRET is not configured');
  }
  return 'local-dev-only-jwt-secret';
}
const JWT_SECRET = resolveJwtSecret();

function publicUser(u, overrides = {}) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    balance: Number(u.balance || 0),
    bonusBalance: Number(u.bonusBalance || 0),
    balanceUpdatedAt: u.balanceUpdatedAt || 0,
    version: u.version || 0,
    authProvider: u.authProvider || 'email',
    lastLogin: u.lastLogin || u.createdAt || null,
    picture: u.picture || '',
    ...overrides
  };
}

function signToken(user, role) {
  return jwt.sign({ id: user.id, role }, JWT_SECRET, { expiresIn: '7d' });
}

// Simple per-instance login throttle (best effort on serverless).
const attempts = new Map();
function tooManyAttempts(key) {
  const now = Date.now();
  const a = attempts.get(key) || { n: 0, at: now };
  if (now - a.at > 10 * 60 * 1000) { a.n = 0; a.at = now; }
  a.n += 1;
  attempts.set(key, a);
  if (attempts.size > 5000) attempts.clear();
  return a.n > 10;
}

// Middleware: only real signed tokens are accepted. The role comes from the
// token (admin tokens are only issued through the admin portal login).
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Session expired, please log in again' });
    try {
      const user = await db.findUserById(decoded.id);
      if (!user) return res.status(401).json({ error: 'Account not found, please log in again' });
      if (user.isBanned) return res.status(403).json({ error: 'This account has been suspended' });
      const isAdmin = decoded.role === 'admin' && (user.role === 'admin' || db.isSuperAdmin(user));
      req.user = { ...user, role: isAdmin ? 'admin' : 'user' };
      next();
    } catch (e) {
      console.error('auth lookup failed:', e.message);
      res.status(503).json({ error: 'Service temporarily unavailable, please retry' });
    }
  });
}

// Register
router.post('/register', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }
    if (!/^[A-Za-z0-9_.]{3,20}$/.test(username)) {
      return res.status(400).json({ error: 'Username must be 3-20 characters (letters, numbers, _ or .)' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (db.isSuperAdmin({ username, email })) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const newUser = await db.createUser({
      username,
      email,
      password,
      initialBalance: 0,
      authProvider: 'email',
      lastLogin: new Date().toISOString()
    });
    res.json({ token: signToken(newUser, 'user'), user: publicUser(newUser, { role: 'user' }) });
  } catch (err) {
    const known = /already (taken|registered)/.test(err.message);
    res.status(known ? 400 : 500).json({ error: known ? err.message : 'Registration failed, please try again' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const cleanId = String(req.body.identifier || req.body.username || req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();
    const portal = String(req.body.portal || '').trim().toLowerCase();

    if (!cleanId || !password) {
      return res.status(400).json({ error: 'Please provide username/email and password' });
    }
    if (tooManyAttempts(`${cleanId}|${req.headers['x-forwarded-for'] || req.ip}`)) {
      return res.status(429).json({ error: 'Too many attempts. Please wait 10 minutes and try again.' });
    }

    const user = await db.findUserByIdentifier(cleanId);
    // Same message for unknown user and wrong password (no account enumeration).
    const invalid = () => res.status(400).json({ error: 'Incorrect username/email or password' });
    if (!user) return invalid();

    const superAdmin = db.isSuperAdmin(user);
    const envAdminPassword = process.env.ADMIN_PASSWORD || '';
    let match = false;
    if (superAdmin && envAdminPassword) {
      const a = Buffer.from(password);
      const b = Buffer.from(envAdminPassword);
      match = a.length === b.length && crypto.timingSafeEqual(a, b);
    } else if (user.passwordHash) {
      match = bcrypt.compareSync(password, user.passwordHash);
    }
    if (!match) return invalid();

    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been suspended by administration' });
    }

    const isAdminAccount = superAdmin || user.role === 'admin';
    if (isAdminAccount && portal !== 'admin') {
      return res.status(403).json({
        error: '⚠️ Admin account player login se allow nahi hai. Pehly neechay "Super Admin Portal Login" par click karein.'
      });
    }
    if (!isAdminAccount && portal === 'admin') {
      return res.status(403).json({ error: 'This account does not have admin access' });
    }
    const role = isAdminAccount ? 'admin' : 'user';
    const fresh = (await db.recordLogin(user.id)) || user;
    res.json({ token: signToken(fresh, role), user: publicUser(fresh, { role }) });
  } catch (err) {
    console.error('login failed:', err.message);
    res.status(500).json({ error: 'Login failed, please try again' });
  }
});

// Google sign-in (only a Google-signed ID token for THIS site is accepted)
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body || {};
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ error: 'Google sign-in is not available. Please log in with username and password.' });
    }
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!googleRes.ok) return res.status(401).json({ error: 'Google sign-in could not be verified' });
    const g = await googleRes.json();
    const expectedAud = process.env.GOOGLE_CLIENT_ID;
    if (!expectedAud || g.aud !== expectedAud) {
      return res.status(401).json({ error: 'Google sign-in is not configured for this site' });
    }
    if (!g.email || String(g.email_verified) !== 'true') {
      return res.status(401).json({ error: 'Google account email is not verified' });
    }
    const email = g.email.trim().toLowerCase();
    const name = g.name || g.given_name || email.split('@')[0];
    const picture = g.picture || '';

    let user = await db.findUserByEmail(email);
    if (user) {
      if (user.isBanned) return res.status(403).json({ error: 'This account has been suspended by administration' });
      if (db.isSuperAdmin(user) || user.role === 'admin') {
        return res.status(403).json({ error: 'Admin accounts must use the Super Admin Portal login' });
      }
      user = (await db.recordLogin(user.id, { authProvider: 'google', picture })) || user;
      return res.json({ token: signToken(user, 'user'), user: publicUser(user, { role: 'user' }) });
    }

    let base = name.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 14);
    if (base.length < 3) base = `user_${Math.floor(1000 + Math.random() * 9000)}`;
    let finalUsername = base;
    for (let i = 1; await db.findUserByUsername(finalUsername); i++) {
      finalUsername = `${base.slice(0, 10)}_${i}`;
    }
    const newUser = await db.createUser({
      username: finalUsername,
      email,
      password: crypto.randomBytes(16).toString('hex'),
      role: 'user',
      initialBalance: 0,
      authProvider: 'google',
      picture,
      lastLogin: new Date().toISOString()
    });
    res.json({ token: signToken(newUser, 'user'), user: publicUser(newUser, { role: 'user' }) });
  } catch (err) {
    console.error('Google auth route error:', err.message);
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

// Current user profile & fresh balance
router.get('/me', authenticateToken, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.json({ user: publicUser(req.user) });
});

// Change password (players)
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const current = String(req.body.currentPassword || '');
    const next = String(req.body.newPassword || '');
    if (db.isSuperAdmin(req.user)) {
      return res.status(400).json({ error: 'Super admin password is managed in the server environment (ADMIN_PASSWORD).' });
    }
    if (next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });
    const user = await db.findUserById(req.user.id);
    if (!user || !bcrypt.compareSync(current, user.passwordHash)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    await db.setPassword(user.id, next);
    res.json({ success: true, message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ error: 'Could not update password' });
  }
});

module.exports = {
  router,
  authenticateToken,
  JWT_SECRET
};
