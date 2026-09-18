const crypto = require('crypto');

/**
 * Provably Fair Cryptographic Algorithm for Crash / Lucky Jet
 * Uses HMAC-SHA256 of serverSeed + clientSeed:nonce
 */
function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

function hashSeed(seed) {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

/**
 * Calculates Crash Multiplier based on serverSeed, clientSeed, nonce, and houseEdge
 * Default houseEdge is 4% (96% RTP)
 */
function calculateCrashMultiplier(serverSeed, clientSeed, nonce, houseEdgePercent = 4) {
  const message = `${clientSeed}:${nonce}`;
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(message);
  const hex = hmac.digest('hex');

  // Use the first 52 bits of the hash (13 hex characters)
  const subHex = hex.substring(0, 13);
  const r = parseInt(subHex, 16);
  const max = Math.pow(2, 52);

  // House edge instant crash check:
  // e.g. if houseEdge is 4%, 1 in 25 rounds crashes instantly at 1.00x
  const instantCrashDivisor = Math.floor(100 / houseEdgePercent);
  if (r % instantCrashDivisor === 0) {
    return 1.00;
  }

  // Standard Provably Fair crash distribution:
  // multiplier = floor((100 * e - h) / (e - h)) / 100
  const X = r / max;
  const rawMultiplier = (100 - houseEdgePercent) / ((1 - X) * 100);

  // Cap minimum at 1.00 and round to 2 decimals
  const finalMultiplier = Math.max(1.00, Math.floor(rawMultiplier * 100) / 100);
  return finalMultiplier;
}

/**
 * Public Verifier Function
 * Players can provide serverSeed, clientSeed, and nonce to verify round authenticity
 */
function verifyRound(serverSeed, clientSeed, nonce, houseEdgePercent = 4) {
  const serverSeedHash = hashSeed(serverSeed);
  const multiplier = calculateCrashMultiplier(serverSeed, clientSeed, nonce, houseEdgePercent);
  return {
    serverSeed,
    serverSeedHash,
    clientSeed,
    nonce,
    multiplier
  };
}

module.exports = {
  generateServerSeed,
  hashSeed,
  calculateCrashMultiplier,
  verifyRound
};
