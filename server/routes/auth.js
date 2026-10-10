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
    const base = process.env.BLOB_READ_WRITE_TOKEN || process.env.AVIATOR_SECRET;
    if (base) return crypto.createHash('sha256').update(`jwt:${base}`).digest('hex');
    throw new Error('JWT_SECRET is not configured');
  }
  return 'local-dev-only-jwt-secret';
}
const JWT_SECRET = resolveJwtSecret();

// Middleware to authenticate JWT (only real signed tokens are accepted)
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });

  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Session expired, please log in again' });
    let user = db.findUserById(decoded.id);
    if (!user && db.syncWithCloud) {
      await db.syncWithCloud(true);
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
    const rawUsername = req.body.username || '';
    const rawEmail = req.body.email || '';
    const rawPassword = req.body.password || '';

    const username = rawUsername.trim();
    const email = rawEmail.trim().toLowerCase();
    const password = rawPassword.trim();

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    if (db.syncWithCloud) await db.syncWithCloud();

    if (db.findUserByUsername(username)) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    if (db.findUserByEmail(email)) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const newUser = await db.createUser({
      username,
      email,
      password,
      initialBalance: 0.0,
      authProvider: email.includes('@gmail.com') ? 'google' : 'email',
      lastLogin: new Date().toISOString()
    });
    const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        balance: newUser.balance,
        bonusBalance: newUser.bonusBalance,
        authProvider: newUser.authProvider,
        lastLogin: newUser.lastLogin,
        picture: newUser.picture || ''
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const rawId = req.body.identifier || req.body.username || req.body.email || '';
    const rawPassword = req.body.password || '';

    const cleanId = rawId.trim().toLowerCase();
    const password = rawPassword.trim();

    if (!cleanId || !password) {
      return res.status(400).json({ error: 'Please provide username/email and password' });
    }

    // Always sync with cloud storage before checking credentials to ensure freshest user data & balance
    if (db.syncWithCloud) await db.syncWithCloud(true);
    let user = db.findUserByIdentifier(cleanId);

    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been suspended by administration' });
    }

    const cleanUser = (user.username || '').trim().toLowerCase();
    const cleanEmail = (user.email || '').trim().toLowerCase();
    const isSuperAdminAccount = (cleanUser === 'saqib_admin' || cleanEmail === '60secscriptdoc@gmail.com');
    const envAdminPassword = process.env.ADMIN_PASSWORD || '';

    // No hardcoded passwords: super admin uses the ADMIN_PASSWORD env var, everyone else bcrypt.
    let match = false;
    if (isSuperAdminAccount && envAdminPassword) {
      const a = Buffer.from(password);
      const b = Buffer.from(envAdminPassword);
      match = a.length === b.length && crypto.timingSafeEqual(a, b);
    } else if (user.passwordHash) {
      match = bcrypt.compareSync(password, user.passwordHash);
    }

    if (!match) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    const portal = (req.body.portal || '').trim().toLowerCase();
    const isAdminAccount = (cleanUser === 'saqib_admin' || cleanEmail === '60secscriptdoc@gmail.com' || user.role === 'admin');

    // Admin account CANNOT log in from player form unless portal === 'admin'
    if (isAdminAccount && portal !== 'admin') {
      return res.status(403).json({
        error: '⚠️ Admin account player login se allow nahi hai. Pehly neechay "Super Admin Portal Login" par click karein.'
      });
    }

    const effectiveRole = (isAdminAccount && portal === 'admin') ? 'admin' : (user.role === 'admin' && portal === 'admin' ? 'admin' : 'user');
    user.role = effectiveRole;

    const nowIso = new Date().toISOString();
    user.lastLogin = nowIso;
    if (!user.authProvider) {
      user.authProvider = (cleanEmail && cleanEmail.includes('@gmail.com')) ? 'google' : 'email';
    }

    // Persist login timestamp to DB
    const currentDb = db.readDB();
    const uIdx = currentDb.users.findIndex(u => u.id === user.id);
    if (uIdx !== -1) {
      currentDb.users[uIdx].lastLogin = nowIso;
      currentDb.users[uIdx].authProvider = user.authProvider;
      currentDb.users[uIdx].role = effectiveRole;
      await db.writeDB(currentDb);
      user = currentDb.users[uIdx];
    }

    const token = jwt.sign({ id: user.id, role: effectiveRole }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        balance: user.balance,
        bonusBalance: user.bonusBalance,
        authProvider: user.authProvider,
        lastLogin: user.lastLogin,
        picture: user.picture || ''
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Google OAuth & 1-Click Sign-In
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body || {};
    let email = '';
    let name = '';
    let picture = '';

    // SECURITY: only a Google-signed ID token is accepted. The old "type your Gmail"
    // path let anyone log into ANY account (including admin) with just an email.
    if (!credential || typeof credential !== 'string') {
      return res.status(400).json({ error: 'Google sign-in is not available. Please log in with username and password.' });
    }
    const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!googleRes.ok) {
      return res.status(401).json({ error: 'Google sign-in could not be verified' });
    }
    const googleData = await googleRes.json();
    const expectedAud = process.env.GOOGLE_CLIENT_ID;
    if (!expectedAud || googleData.aud !== expectedAud) {
      return res.status(401).json({ error: 'Google sign-in is not configured for this site' });
    }
    if (!googleData.email || String(googleData.email_verified) !== 'true') {
      return res.status(401).json({ error: 'Google account email is not verified' });
    }
    email = googleData.email.trim().toLowerCase();
    name = googleData.name || googleData.given_name || email.split('@')[0];
    picture = googleData.picture || '';

    // 2. Validate email
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid Google email address is required' });
    }

    // 3. Ensure freshest data from cloud database
    if (db.syncWithCloud) await db.syncWithCloud(true);

    // 4. Check if user already exists
    let user = db.findUserByEmail(email) || db.findUserByIdentifier(email);

    if (user) {
      if (user.isBanned) {
        return res.status(403).json({ error: 'This account has been suspended by administration' });
      }

      const cleanUser = (user.username || '').trim().toLowerCase();
      const cleanEmail = (user.email || '').trim().toLowerCase();
      const effectiveRole = (cleanUser === 'saqib_admin' || cleanEmail === '60secscriptdoc@gmail.com') ? 'admin' : (user.role || 'user');
      user.role = effectiveRole;

      const nowIso = new Date().toISOString();
      user.lastLogin = nowIso;
      user.authProvider = 'google';
      if (picture) user.picture = picture;

      // Update in DB and persist
      const currentDb = db.readDB();
      const uIdx = currentDb.users.findIndex(u => u.id === user.id);
      if (uIdx !== -1) {
        currentDb.users[uIdx].lastLogin = nowIso;
        currentDb.users[uIdx].authProvider = 'google';
        currentDb.users[uIdx].role = effectiveRole;
        if (picture) currentDb.users[uIdx].picture = picture;
        await db.writeDB(currentDb);
      }

      const token = jwt.sign({ id: user.id, role: effectiveRole }, JWT_SECRET, { expiresIn: '7d' });

      return res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          balance: user.balance,
          bonusBalance: user.bonusBalance,
          authProvider: 'google',
          lastLogin: user.lastLogin,
          picture: picture || user.picture || ''
        }
      });
    }

    // 5. Create new user for first-time Google sign up
    let baseUsername = (name || email.split('@')[0])
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 14);

    if (baseUsername.length < 3) {
      baseUsername = `user_${Math.floor(1000 + Math.random() * 9000)}`;
    }

    let finalUsername = baseUsername;
    let counter = 1;
    while (db.findUserByUsername(finalUsername)) {
      finalUsername = `${baseUsername.slice(0, 10)}_${counter++}`;
    }

    const randomPassword = require('crypto').randomBytes(16).toString('hex');
    const isMasterAdmin = (finalUsername.toLowerCase() === 'saqib_admin' || email === '60secscriptdoc@gmail.com');
    const newUserRole = isMasterAdmin ? 'admin' : 'user';

    const newUser = await db.createUser({
      username: finalUsername,
      email: email,
      password: randomPassword,
      role: newUserRole,
      initialBalance: 0.0, // Strictly PKR 0.0 (NO BONUS)
      authProvider: 'google',
      picture: picture || '',
      lastLogin: new Date().toISOString()
    });

    const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      token,
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        balance: newUser.balance,
        bonusBalance: newUser.bonusBalance,
        authProvider: 'google',
        lastLogin: newUser.lastLogin,
        picture: picture || ''
      }
    });
  } catch (err) {
    console.error('Google auth route error:', err);
    res.status(500).json({ error: err.message || 'Google authentication failed' });
  }
});

// Current User profile & fresh balance
router.get('/me', authenticateToken, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if (db.syncWithCloud) await db.syncWithCloud(true);
  const freshUser = db.findUserById(req.user.id) || req.user;
  res.json({
    user: {
      id: freshUser.id,
      username: freshUser.username,
      email: freshUser.email,
      role: freshUser.role,
      balance: Number(freshUser.balance !== undefined ? freshUser.balance : 0),
      bonusBalance: Number(freshUser.bonusBalance !== undefined ? freshUser.bonusBalance : 0),
      balanceUpdatedAt: freshUser.balanceUpdatedAt || 0,
      version: freshUser.version || 0,
      authProvider: freshUser.authProvider || (freshUser.email?.includes('@gmail.com') ? 'google' : 'email'),
      lastLogin: freshUser.lastLogin || freshUser.createdAt || null,
      picture: freshUser.picture || ''
    }
  });
});

module.exports = {
  router,
  authenticateToken,
  JWT_SECRET
};
