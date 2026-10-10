const express = require('express');

const router = express.Router();

// Mines is "Coming Soon". The previous implementation contained admin rigging
// (forced bombs) and an unfair Math.random shuffle, so it has been removed
// entirely. It must be rebuilt as a provably-fair game before it goes live.
const COMING_SOON = { error: 'Mines is coming soon. Only Aviator is available right now.' };

router.get('/active', (req, res) => res.json({ hasActiveGame: false }));
router.post(['/start', '/reveal', '/cashout'], (req, res) => res.status(403).json(COMING_SOON));

module.exports = { router };
