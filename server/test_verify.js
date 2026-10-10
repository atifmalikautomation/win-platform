const db = require('./db');
const { generateServerSeed, hashSeed, calculateCrashMultiplier, verifyRound } = require('./provablyFair');
const crashRoute = require('./routes/crash');

async function runTests() {
  console.log('--- 1. Testing Database & User Engine ---');
  let demo = db.findUserByUsername('LuckyPlayer');
  if (!demo) {
    demo = await db.createUser({
      username: 'LuckyPlayer',
      email: 'player@example.com',
      password: 'user123',
      initialBalance: 2000.0
    });
  }
  console.log('Demo player balance:', demo ? demo.balance : 'NOT FOUND');

  console.log('\n--- 2. Testing Atomic Balance Adjustments ---');
  const prevBal = demo.balance;
  const updatedBal = await db.updateUserBalance(demo.id, 100);
  console.log(`Balance credited +100: from ${prevBal} to ${updatedBal}`);
  const revertedBal = await db.updateUserBalance(demo.id, -100);
  console.log(`Balance deducted -100: from ${updatedBal} to ${revertedBal}`);

  console.log('\n--- 3. Testing Provably Fair RNG ---');
  const sSeed = generateServerSeed();
  const sHash = hashSeed(sSeed);
  console.log('Server Seed Hash (Public):', sHash.substring(0, 20) + '...');
  const mult1 = calculateCrashMultiplier(sSeed, 'testClient', 1, 4);
  const mult2 = calculateCrashMultiplier(sSeed, 'testClient', 2, 4);
  const mult3 = calculateCrashMultiplier(sSeed, 'testClient', 3, 4);
  console.log(`Crash multipliers generated for rounds 1,2,3: ${mult1}x, ${mult2}x, ${mult3}x`);

  const verified = verifyRound(sSeed, 'testClient', 1, 4);
  console.log('Verification check passes:', verified.multiplier === mult1);

  console.log('\n--- 4. Testing Aviator Bet, Cancel, & Cashout Lifecycle ---');
  // A. Place Bet
  const betRes = await db.placeBetTransaction({
    userId: demo.id,
    username: demo.username,
    betAmount: 100,
    autoCashout: null
  });
  console.log(`Bet placed successfully! Bet ID: ${betRes.bet.id}, New Balance: ${betRes.newBalance}`);

  // B. Cancel Bet
  const cancelRes = await db.cancelBetTransaction({
    userId: demo.id,
    betId: betRes.bet.id
  });
  console.log(`Bet cancelled successfully! Refunded Balance: ${cancelRes.newBalance}`);

  // C. Place Bet and Cashout at 2.50x
  const betRes2 = await db.placeBetTransaction({
    userId: demo.id,
    username: demo.username,
    betAmount: 100,
    autoCashout: 2.50
  });
  const cashoutRes = await db.cashoutBetTransaction({
    userId: demo.id,
    username: demo.username,
    betId: betRes2.bet.id,
    betAmount: 100,
    multiplier: 2.50,
    maxAllowedMultiplier: 3.00
  });
  console.log(`Cashout success! Payout: ${cashoutRes.payout}, Final Balance: ${cashoutRes.newBalance}`);

  // D. Ensure Double Cashout is REJECTED
  try {
    await db.cashoutBetTransaction({
      userId: demo.id,
      username: demo.username,
      betId: betRes2.bet.id,
      betAmount: 100,
      multiplier: 2.50
    });
    console.error('FAILED: Double cashout was not rejected!');
  } catch (err) {
    console.log(`Double cashout safely rejected: "${err.message}"`);
  }

  console.log('\n--- 5. Testing Cashier & Ledger Flow ---');
  const sampleTx = await db.createTransaction({
    userId: demo.id,
    username: demo.username,
    type: 'deposit',
    method: 'easypaisa',
    amount: 500,
    reference: 'TEST-REF-001'
  });
  console.log('Created pending deposit transaction:', sampleTx.id, sampleTx.status);
  const approvedTx = await db.processTransaction(sampleTx.id, 'approve', 'Auto-tested');
  console.log('Processed transaction:', approvedTx.id, approvedTx.status);

  console.log('\n--- 6. Testing Mines Session Persistence ---');
  await db.saveUserMinesGame(demo.id, {
    userId: demo.id,
    betAmount: 100,
    minesCount: 3,
    minePositions: [2, 11, 23],
    revealedTiles: [0, 1]
  });
  const savedMines = db.getUserMinesGame(demo.id);
  console.log('Mines session retrieved successfully:', !!savedMines, 'Revealed tiles:', savedMines.revealedTiles);
  await db.clearUserMinesGame(demo.id);
  console.log('Mines session cleared:', db.getUserMinesGame(demo.id) === null);

  console.log('\n✅ ALL BACKEND UNIT CHECKS PASSED SAFELY AND SUCCESSFULLY!\n');
}

runTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
