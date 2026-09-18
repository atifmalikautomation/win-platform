const express = require('express');
const cors = require('cors');
const { router: authRouter } = require('../server/routes/auth');
const cashierRouter = require('../server/routes/cashier');
const adminRouter = require('../server/routes/admin');
const { router: minesRouter } = require('../server/routes/mines');
const { verifyRound } = require('../server/provablyFair');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// Provably Fair Verifier
const handleVerify = (req, res) => {
  try {
    const { serverSeed, clientSeed, nonce, houseEdge } = req.body;
    if (!serverSeed || !clientSeed || nonce === undefined) {
      return res.status(400).json({ error: 'serverSeed, clientSeed, and nonce are required' });
    }
    const result = verifyRound(serverSeed, clientSeed, Number(nonce), houseEdge ? Number(houseEdge) : 4);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
app.post('/api/verify', handleVerify);
app.post('/verify', handleVerify);

// Mount modular REST routes for both /api/* and /* (handles rewritten and non-rewritten paths)
app.use(['/api/auth', '/auth'], authRouter);
app.use(['/api/cashier', '/cashier'], cashierRouter);
app.use(['/api/admin', '/admin'], adminRouter);
app.use(['/api/mines', '/mines'], minesRouter);

// Health check
app.get(['/api/health', '/health'], (req, res) => {
  res.json({ status: 'ok', server: 'SKYWIN Vercel Serverless Engine', time: new Date().toISOString() });
});

module.exports = app;
