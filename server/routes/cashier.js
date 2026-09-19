const express = require('express');
const { authenticateToken } = require('./auth');
const db = require('../db');

const router = express.Router();

// Cashier deposit configuration / addresses
router.get('/config', (req, res) => {
  res.json({
    crypto: {
      usdtTrc20Address: 'TN3W4H6rK25vZsN8kL1Q9eT2j4pM7aX8bY',
      network: 'TRON (TRC-20)',
      minDeposit: 5.0,
      exchangeRatePkrPerUsdt: 280.0
    },
    local: {
      easypaisa: {
        accountTitle: 'Farzana Kausar',
        accountNumber: '03004968550',
        instructions: 'Send via Easypaisa mobile app and submit the TID reference number'
      },
      bank: {
        bankName: 'Meezan Bank Ltd',
        accountTitle: 'Apex Gaming Tech Ltd',
        accountNumber: '010101029384756',
        iban: 'PK45MEZN0001010102938475'
      }
    }
  });
});

// Submit a Deposit Request
router.post('/deposit', authenticateToken, async (req, res) => {
  try {
    const { method, amount, accountNumber, reference, proofUrl, proofScreenshot } = req.body;
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount < 100) {
      return res.status(400).json({ error: 'Minimum deposit amount is PKR 100' });
    }

    if (!method) {
      return res.status(400).json({ error: 'Payment method is required' });
    }

    if (db.syncWithCloud) await db.syncWithCloud();

    const tx = await db.createTransaction({
      userId: req.user.id,
      username: req.user.username,
      type: 'deposit',
      method,
      amount: numAmount,
      accountNumber,
      reference: reference || 'Receipt Uploaded',
      proofUrl: proofUrl || '',
      proofScreenshot: proofScreenshot || proofUrl || ''
    });

    res.json({
      message: 'Deposit request submitted successfully! Admin will verify and credit your balance.',
      transaction: tx
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit a Withdrawal Request
router.post('/withdraw', authenticateToken, async (req, res) => {
  try {
    const { method, amount, accountNumber, accountTitle } = req.body;
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount < 500) {
      return res.status(400).json({ error: 'Minimum withdrawal amount is PKR 500' });
    }

    if (!accountNumber) {
      return res.status(400).json({ error: 'Receiving account / wallet address is required' });
    }

    if (db.syncWithCloud) await db.syncWithCloud();

    const tx = await db.createTransaction({
      userId: req.user.id,
      username: req.user.username,
      type: 'withdraw',
      method,
      amount: numAmount,
      accountNumber: `${accountTitle ? accountTitle + ' - ' : ''}${accountNumber}`,
      reference: 'User Withdrawal Request'
    });

    // Fetch updated balance after withdrawal deduction
    const updatedUser = db.findUserById(req.user.id);

    res.json({
      message: 'Withdrawal request submitted! Payout will be processed to your account.',
      transaction: tx,
      newBalance: updatedUser ? updatedUser.balance : 0
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// User's own transaction history
router.get('/history', authenticateToken, async (req, res) => {
  if (db.syncWithCloud) await db.syncWithCloud();
  const history = db.getTransactions(req.user.id);
  res.json({ transactions: history });
});

module.exports = router;
