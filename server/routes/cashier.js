const express = require('express');
const { authenticateToken } = require('./auth');
const db = require('../db');

const router = express.Router();

const METHODS = ['easypaisa', 'jazzcash', 'bank', 'usdt'];
const MAX_PROOF_CHARS = 6 * 1024 * 1024; // ~4.5MB image as base64
const MAX_PENDING_DEPOSITS = 5;
const MIN_DEPOSIT = 3000;

// Payment details shown to players (configure via env so they can change without code edits).
router.get('/config', (req, res) => {
  res.json({
    local: {
      easypaisa: {
        accountTitle: process.env.EASYPAISA_TITLE || 'Farzana Kausar',
        accountNumber: process.env.EASYPAISA_NUMBER || '03004968550',
        instructions: 'Send via Easypaisa mobile app and submit the TID reference number'
      },
      jazzcash: {
        accountTitle: process.env.JAZZCASH_TITLE || '',
        accountNumber: process.env.JAZZCASH_NUMBER || '',
        instructions: 'Send via JazzCash mobile app and submit the TID reference number'
      }
    }
  });
});

// Submit a deposit request (admin verifies and approves)
router.post('/deposit', authenticateToken, async (req, res) => {
  try {
    const { method, amount, accountNumber, reference, proofUrl, proofScreenshot } = req.body || {};
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount < MIN_DEPOSIT) {
      return res.status(400).json({ error: `Minimum deposit amount is PKR ${MIN_DEPOSIT.toLocaleString('en-US')}` });
    }
    if (numAmount > 500000) return res.status(400).json({ error: 'Maximum deposit amount is PKR 500,000' });
    const m = String(method || '').toLowerCase();
    if (!METHODS.includes(m)) return res.status(400).json({ error: 'Payment method is required' });
    const ref = String(reference || '').trim();
    const proof = String(proofScreenshot || proofUrl || '');
    if (!ref && !proof) return res.status(400).json({ error: 'Please enter the transaction ID (TID) or upload the payment screenshot' });
    if (proof.length > MAX_PROOF_CHARS) return res.status(400).json({ error: 'Screenshot is too large (max ~4MB)' });

    const pending = (await db.getTransactions(req.user.id, { limit: 50, withProof: false }))
      .filter(t => t.type === 'deposit' && t.status === 'pending').length;
    if (pending >= MAX_PENDING_DEPOSITS) {
      return res.status(400).json({ error: 'You already have several pending deposits. Please wait for them to be verified.' });
    }

    const tx = await db.createTransaction({
      userId: req.user.id,
      username: req.user.username,
      type: 'deposit',
      method: m,
      amount: numAmount,
      accountNumber: String(accountNumber || '').slice(0, 60),
      reference: ref.slice(0, 80) || 'Receipt Uploaded',
      proofUrl: '',
      proofScreenshot: proof
    });
    const { proofScreenshot: _p, ...publicTx } = tx;
    res.json({
      message: 'Deposit request submitted! Admin will verify and credit your balance.',
      transaction: publicTx
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not submit deposit, please try again' });
  }
});

// Submit a withdrawal request (amount is reserved immediately)
router.post('/withdraw', authenticateToken, async (req, res) => {
  try {
    const { method, amount, accountNumber, accountTitle } = req.body || {};
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount < 500) {
      return res.status(400).json({ error: 'Minimum withdrawal amount is PKR 500' });
    }
    const m = String(method || '').toLowerCase();
    if (!METHODS.includes(m)) return res.status(400).json({ error: 'Payment method is required' });
    const acc = String(accountNumber || '').trim();
    if (!acc) return res.status(400).json({ error: 'Receiving account number is required' });
    const title = String(accountTitle || '').trim();

    const tx = await db.createTransaction({
      userId: req.user.id,
      username: req.user.username,
      type: 'withdraw',
      method: m,
      amount: numAmount,
      accountNumber: `${title ? title.slice(0, 60) + ' - ' : ''}${acc.slice(0, 40)}`,
      reference: 'User Withdrawal Request'
    });
    res.json({
      message: 'Withdrawal request submitted! Payout will be processed to your account.',
      transaction: tx,
      newBalance: await db.getUserBalance(req.user.id)
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// User's own transaction history (without the heavy screenshot payload)
router.get('/history', authenticateToken, async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ transactions: await db.getTransactions(req.user.id, { limit: 100, withProof: false }) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load history' });
  }
});

module.exports = router;
