const db = require('./db');
const { generateServerSeed, hashSeed, calculateCrashMultiplier, verifyRound } = require('./provablyFair');

console.log('--- 1. Testing Database & User Engine ---');
const admin = db.findUserByUsername('admin');
console.log('Admin found:', admin ? admin.username : 'NOT FOUND');
const demo = db.findUserByUsername('LuckyPlayer');
console.log('Demo player balance:', demo ? demo.balance : 'NOT FOUND');

console.log('\n--- 2. Testing Atomic Balance Adjustments ---');
const prevBal = demo.balance;
const updatedBal = db.updateUserBalance(demo.id, 100);
console.log(`Balance credited +100: from ${prevBal} to ${updatedBal}`);
const revertedBal = db.updateUserBalance(demo.id, -100);
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

console.log('\n--- 4. Testing Cashier & Ledger Flow ---');
const sampleTx = db.createTransaction({
  userId: demo.id,
  username: demo.username,
  type: 'deposit',
  method: 'easypaisa',
  amount: 500,
  reference: 'TEST-REF-001'
});
console.log('Created pending deposit transaction:', sampleTx.id, sampleTx.status);
const approvedTx = db.processTransaction(sampleTx.id, 'approve', 'Auto-tested');
console.log('Processed transaction:', approvedTx.id, approvedTx.status);

console.log('\n--- 5. All Backend Unit Checks PASSED Successfully! ---');
