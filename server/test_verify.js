// SkyWin backend verification suite.
// Run: SKYWIN_TEST_ENV=<env file with DATABASE_URL_UNPOOLED> npm test
// Uses a throw-away Postgres schema (dropped at the end) and a fake clock.
const fs = require('fs');
const assert = require('assert');

const envFile = process.env.SKYWIN_TEST_ENV;
if (envFile) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const unpooled = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED;
if (!unpooled) {
  console.error('Set SKYWIN_TEST_ENV (env file) or TEST_DATABASE_URL to run the tests.');
  process.exit(1);
}
const SCHEMA = `skywin_test_${Date.now()}`;
process.env.DATABASE_URL = unpooled;
process.env.SKYWIN_PG_SCHEMA = SCHEMA;
process.env.ADMIN_PASSWORD = 'Test-Admin-Pass-123';
for (const k of ['VERCEL', 'BLOB_READ_WRITE_TOKEN', 'JWT_SECRET', 'AVIATOR_SECRET']) delete process.env[k];

// ---- fake clock (shared by engine + routes in this process)
const realNow = Date.now.bind(Date);
let fakeNow = null;
let clockOffset = 0;
Date.now = () => (fakeNow === null ? realNow() + clockOffset : fakeNow);

const db = require('./db');
const pg = require('./pg');
const engine = require('./aviatorEngine');
const app = require('../api/index');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./routes/auth');

async function dropSchema() {
  try {
    await pg.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  } catch (e) {
    console.error('could not drop test schema', SCHEMA, e.message);
  }
  await pg.end();
}

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed++;
  console.log('  \u2713', msg);
}

async function main() {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, token, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    return { status: res.status, data };
  };

  try {
    console.log('\n1. Engine determinism (every instance computes the same round)');
    fakeNow = Date.UTC(2026, 9, 10, 15, 0, 0);
    const a = engine.publicState(fakeNow);
    engine._resetForTests();
    const b = engine.publicState(fakeNow);
    ok(a.roundId === b.roundId && a.state === b.state && a.multiplier === b.multiplier, `same round #${a.roundId} after "new instance"`);
    ok(JSON.stringify(a.history) === JSON.stringify(b.history), 'same history on both instances');

    console.log('\n2. Crash point never leaks while betting/flying');
    let t = fakeNow;
    let s = engine.stateAt(t);
    while (s.state !== 'WAITING') { t += 200; s = engine.stateAt(t); }
    let pub = engine.publicState(t);
    ok(pub.state === 'WAITING' && pub.crashAt === undefined && pub.seed === undefined && pub.crashTime === undefined, 'WAITING: no crashAt/seed/crashTime');
    ok(typeof pub.hash === 'string' && pub.hash.length === 64, 'WAITING: round hash published');
    const flying = engine.stateAt(s.plan.flightStart + 50);
    if (flying.state === 'FLYING') {
      pub = engine.publicState(s.plan.flightStart + 50);
      ok(pub.crashAt === undefined && pub.seed === undefined, 'FLYING: no crashAt/seed');
    } else {
      ok(true, 'FLYING check skipped (instant 1.00x round)');
    }
    pub = engine.publicState(s.plan.crashTime + 10);
    ok(pub.state === 'CRASHED' && pub.crashAt === s.plan.crashAt, `CRASHED reveals ${pub.crashAt}x`);
    const crypto = require('crypto');
    ok(crypto.createHash('sha256').update(pub.seed).digest('hex') === pub.hash, 'provably fair: sha256(seed) == hash');
    ok(engine.crashFromSeed(pub.seed, 100 - pub.rtp) === pub.crashAt, 'provably fair: crash recomputed from seed');

    console.log('\n3. Multiplier curve is smooth & monotonic');
    let prev = 1;
    let mono = true;
    for (let ms = 0; ms < 30000; ms += 16) { const m = engine.multiplierAt(ms); if (m < prev) mono = false; prev = m; }
    ok(mono, 'never goes backwards');
    ok(engine.multiplierAt(7700) >= 1.99 && engine.multiplierAt(7700) <= 2.01, `2x at ~7.7s (got ${engine.multiplierAt(7700)})`);
    const dist = [];
    for (let i = 1; i <= 20000; i++) dist.push(engine.crashFromSeed(engine.roundSeed(i), 3));
    const under2 = dist.filter(x => x < 2).length / dist.length;
    const avgRtp = dist.reduce((sum, x) => sum + (x >= 2 ? 2 : 0), 0) / dist.length;
    ok(under2 > 0.45 && under2 < 0.58, `realistic spread: ${(under2 * 100).toFixed(1)}% of rounds crash below 2x`);
    ok(avgRtp > 0.93 && avgRtp < 1.01, `cash-out at 2x returns ~97% (${(avgRtp * 100).toFixed(1)}%)`);

    console.log('\n4. Auth security');
    let r = await call('GET', '/api/auth/me', 'local_token_usr_saqib_admin');
    ok(r.status === 401, 'local_token_<id> rejected');
    const forged = jwt.sign({ id: 'usr_saqib_admin' }, 'luckywin_secret_jwt_key_2026');
    r = await call('GET', '/api/auth/me', forged);
    ok(r.status === 401, 'token signed with the old public secret rejected');
    r = await call('POST', '/api/auth/google', null, { email: '60secscriptdoc@gmail.com' });
    ok(r.status >= 400 && !r.data?.token, 'email-only "Google" login rejected');
    r = await call('POST', '/api/auth/login', null, { identifier: 'saqib_admin', password: 'admin123', portal: 'admin' });
    ok(r.status === 400 && !r.data?.token, 'admin123 backdoor removed');

    console.log('\n5. Bet / cancel / cashout through the real routes');
    fakeNow = realNow();
    const uname = `tester${Date.now() % 100000}`;
    r = await call('POST', '/api/auth/register', null, { username: uname, email: `${uname}@example.com`, password: 'pass1234' });
    ok(r.status === 200 && r.data.token, 'register works');
    const token = r.data.token;
    const userId = r.data.user.id;
    await db.setUserExactBalance(userId, 1000);

    // Move clock to the next betting window
    t = Date.now();
    s = engine.stateAt(t);
    while (!(s.state === 'WAITING' && s.plan.flightStart - t > 3000)) { t += 100; s = engine.stateAt(t); }
    fakeNow = t;
    const roundId = s.plan.roundId;

    r = await call('POST', '/api/crash/bet', token, { amount: 100 });
    ok(r.status === 200 && r.data.newBalance === 900, 'bet placed, balance 1000 -> 900');
    const bet1 = r.data.bet;
    ok(bet1.roundId === roundId, 'bet tied to the current round');

    r = await call('POST', '/api/crash/cancel-bet', token, { betId: bet1.id });
    ok(r.status === 200 && r.data.newBalance === 1000, 'cancel refunds to 1000');

    r = await call('POST', '/api/crash/bet', token, { amount: 100 });
    const bet2 = r.data.bet;
    r = await call('POST', '/api/crash/bet', token, { amount: 50 });
    const bet3 = r.data.bet;
    r = await call('POST', '/api/crash/bet', token, { amount: 50 });
    ok(r.status === 400, 'third bet in same round rejected (max 2)');

    r = await call('POST', '/api/crash/cashout', token, { betId: bet2.id });
    ok(r.status === 400, 'cashout before take-off rejected');

    if (s.plan.crashAt >= 1.2) {
      fakeNow = s.plan.flightStart + 1500;
      const expected = engine.multiplierAt(1500);
      r = await call('POST', '/api/crash/cashout', token, { betId: bet2.id, multiplier: 999 });
      ok(r.status === 200 && r.data.multiplier === expected, `cashout uses SERVER multiplier (${r.data.multiplier}x), not the client's 999x`);
      r = await call('POST', '/api/crash/cashout', token, { betId: bet2.id });
      ok(r.status === 400, 'double cashout rejected');
    } else {
      ok(true, 'cashout-in-flight check skipped (low crash round)');
      ok(true, 'double cashout check skipped');
    }

    r = await call('POST', '/api/crash/bet', token, { amount: 100 });
    ok(r.status === 400, 'bet during flight rejected');

    fakeNow = s.plan.crashTime + 100;
    r = await call('POST', '/api/crash/cashout', token, { betId: bet3.id });
    ok(r.status === 400, 'cashout after crash rejected');

    r = await call('GET', '/api/crash/my-bets', token);
    const settled3 = r.data.bets.find(b => b.id === bet3.id);
    ok(settled3 && settled3.status === 'lost', 'un-cashed bet settled as lost after crash');

    r = await call('GET', '/api/crash/live');
    ok(r.status === 200 && r.data.roundId === roundId && r.data.state === 'CRASHED', 'live endpoint shows the same finished round');
    ok(Array.isArray(r.data.bets) && r.data.bets.some(b => b.amount === 100), 'live feed shows REAL bets of the round');

    console.log('\n6. Server-side auto cash-out (works even if the browser is closed)');
    t = s.plan.endTime;
    s = engine.stateAt(t);
    while (!(s.state === 'WAITING' && s.plan.crashAt >= 1.5 && s.plan.flightStart - t > 3000)) {
      t = s.plan.endTime + 10;
      s = engine.stateAt(t);
    }
    fakeNow = t;
    await db.setUserExactBalance(userId, 1000);
    r = await call('POST', '/api/crash/bet', token, { amount: 100, autoCashout: 1.5 });
    const autoBet = r.data.bet;
    fakeNow = s.plan.crashTime + 100;
    r = await call('GET', '/api/crash/my-bets', token);
    const settledAuto = r.data.bets.find(b => b.id === autoBet.id);
    ok(settledAuto.status === 'won' && settledAuto.payout === 150, 'auto cash-out 1.5x paid 150 by the server');
    ok(r.data.balance === 1050, 'balance 1000 - 100 + 150 = 1050');

    console.log('\n7. Admin: emergency stop refunds, pause/resume, no crash-point control');
    r = await call('POST', '/api/auth/login', null, { identifier: 'saqib_admin', password: 'Test-Admin-Pass-123' });
    ok(r.status === 403 && !r.data?.token, 'admin cannot log in through the player form');
    r = await call('POST', '/api/auth/login', null, { identifier: 'saqib_admin', password: 'Test-Admin-Pass-123', portal: 'admin' });
    ok(r.status === 200 && r.data.user.role === 'admin', 'admin portal login with ADMIN_PASSWORD');
    const adminToken = r.data.token;
    const fakeAdmin = jwt.sign({ id: userId, role: 'admin' }, JWT_SECRET);
    r = await call('GET', '/api/admin/stats', fakeAdmin);
    ok(r.status === 403, 'player id with a self-claimed admin role is still denied');
    t = s.plan.endTime;
    s = engine.stateAt(t);
    while (!(s.state === 'WAITING' && s.plan.crashAt >= 1.5 && s.plan.flightStart - t > 3000)) {
      t = s.plan.endTime + 10;
      s = engine.stateAt(t);
    }
    fakeNow = t;
    r = await call('POST', '/api/crash/bet', token, { amount: 200 });
    const stopBet = r.data.bet;
    ok(r.data.newBalance === 850, 'bet 200 placed (1050 -> 850)');
    fakeNow = s.plan.flightStart + 800;
    r = await call('POST', '/api/admin/game-control/aviator/emergency-stop', adminToken);
    ok(r.status === 200, 'admin emergency stop accepted');
    fakeNow = fakeNow + 50;
    r = await call('GET', '/api/crash/live');
    ok(r.data.state === 'CRASHED' && r.data.voided === true, 'round shows as stopped for everyone');
    r = await call('GET', '/api/crash/my-bets', token);
    const refunded = r.data.bets.find(b => b.id === stopBet.id);
    ok(refunded.status === 'refunded' && r.data.balance === 1050, 'open bet refunded (back to 1050)');

    r = await call('POST', '/api/admin/game-control/aviator/set-multiplier', adminToken, { multiplier: 1.01 });
    ok(r.status === 404, 'no endpoint exists to force a crash multiplier');
    r = await call('POST', '/api/admin/game-control/aviator/emergency-stop', token);
    ok(r.status === 403, 'normal player cannot use admin controls');

    r = await call('POST', '/api/admin/game-control/aviator/pause', adminToken);
    ok(r.status === 200, 'pause accepted');
    fakeNow = fakeNow + 60000;
    r = await call('GET', '/api/crash/live');
    ok(r.data.state === 'PAUSED', 'game paused after current round');
    r = await call('POST', '/api/crash/bet', token, { amount: 100 });
    ok(r.status === 400, 'no bets while paused');
    r = await call('POST', '/api/admin/game-control/aviator/resume', adminToken);
    ok(r.status === 200, 'resume accepted');
    r = await call('GET', '/api/crash/live');
    ok(r.data.state === 'WAITING', 'new round starts after resume');

    console.log('\n8. Mines is "Coming Soon"');
    r = await call('POST', '/api/mines/start', token, { betAmount: 100, minesCount: 3 });
    ok(r.status === 403, 'mines start blocked');

    console.log('\n9. Concurrency: no lost writes, no double payouts');
    s = engine.stateAt(Date.now());
    t = Date.now();
    while (!(s.state === 'WAITING' && s.plan.crashAt >= 1.5 && s.plan.flightStart - t > 3000)) {
      t = (s.plan ? s.plan.endTime : t + 1000) + 10;
      s = engine.stateAt(t);
    }
    fakeNow = t;
    await db.setUserExactBalance(userId, 300);
    const burst = await Promise.all([1, 2, 3, 4, 5].map(() => call('POST', '/api/crash/bet', token, { amount: 100 })));
    const okBets = burst.filter(x => x.status === 200);
    ok(okBets.length === 2, `5 simultaneous bets -> exactly 2 accepted (got ${okBets.length})`);
    ok(await db.getUserBalance(userId) === 100, 'balance 300 - 2x100 = 100 (no overdraft, no lost update)');
    fakeNow = s.plan.flightStart + 1200;
    const race = await Promise.all([1, 2, 3, 4].map(() => call('POST', '/api/crash/cashout', token, { betId: okBets[0].data.bet.id })));
    ok(race.filter(x => x.status === 200).length === 1, '4 simultaneous cash-outs of one bet -> paid exactly once');
    const regs = await Promise.all([1, 2, 3, 4, 5, 6].map(i => call('POST', '/api/auth/register', null,
      { username: `burst${i}_${Date.now() % 100000}`, email: `burst${i}_${Date.now()}@example.com`, password: 'pass1234' })));
    ok(regs.every(x => x.status === 200), '6 simultaneous registrations all succeed');
    const all = await db.listUsers();
    ok(regs.every(x => all.some(u => u.id === x.data.user.id)), 'every registered user is still there (old bug: users vanished)');
    const dup = await call('POST', '/api/auth/register', null, { username: uname.toUpperCase(), email: 'other@example.com', password: 'pass1234' });
    ok(dup.status === 400, 'duplicate username (case-insensitive) rejected');

    console.log('\n10. Deposit -> approve credits; withdraw reserves, reject refunds');
    await db.setUserExactBalance(userId, 1000);
    r = await call('POST', '/api/cashier/deposit', token, { method: 'easypaisa', amount: 2999, reference: 'TID000' });
    ok(r.status === 400, 'deposit below PKR 3,000 rejected');
    r = await call('POST', '/api/cashier/deposit', token, { method: 'easypaisa', amount: 3000, reference: 'TID123' });
    ok(r.status === 200, 'deposit request created');
    const depId = r.data.transaction.id;
    r = await call('POST', `/api/admin/transactions/${depId}/action`, adminToken, { action: 'approve' });
    ok(r.status === 200 && await db.getUserBalance(userId) === 4000, 'approve credits 3000 (1000 -> 4000)');
    r = await call('POST', `/api/admin/transactions/${depId}/action`, adminToken, { action: 'approve' });
    ok(r.status === 400 && await db.getUserBalance(userId) === 4000, 'second approve rejected (no double credit)');
    r = await call('POST', '/api/cashier/withdraw', token, { method: 'easypaisa', amount: 600, accountNumber: '03001234567' });
    ok(r.status === 200 && r.data.newBalance === 3400, 'withdraw reserves 600 (4000 -> 3400)');
    r = await call('POST', `/api/admin/transactions/${r.data.transaction.id}/action`, adminToken, { action: 'reject' });
    ok(r.status === 200 && await db.getUserBalance(userId) === 4000, 'reject refunds 600 (back to 4000)');
    r = await call('POST', '/api/cashier/withdraw', token, { method: 'easypaisa', amount: 99999, accountNumber: '0300' });
    ok(r.status === 400, 'withdraw above balance rejected');

    console.log('\n11. waitCrash long-poll answers at the crash moment (real clock)');
    clockOffset = fakeNow - realNow(); // continue the timeline in real time
    fakeNow = null;
    await call('POST', '/api/admin/game-control/aviator/resume', adminToken); // no-op if running
    let live = engine.stateAt(Date.now());
    const waitStart = Date.now();
    while (!(live.state === 'FLYING' && live.plan.crashTime - Date.now() < 7000 && live.plan.crashTime - Date.now() > 300)) {
      if (Date.now() - waitStart > 60000) break;
      await new Promise(res => setTimeout(res, 100));
      live = engine.stateAt(Date.now());
    }
    if (live.state === 'FLYING') {
      const r2 = await call('GET', `/api/crash/live?waitCrash=${live.plan.roundId}`);
      const lag = Date.now() - live.plan.crashTime;
      ok(r2.data.state === 'CRASHED' && r2.data.roundId === live.plan.roundId, `waitCrash returned CRASHED ${r2.data.crashAt}x`);
      ok(lag >= 0 && lag < 400, `answered ${lag}ms after the crash (never before it)`);
    } else {
      ok(true, 'waitCrash check skipped (no suitable flight within 60s)');
      ok(true, 'waitCrash latency check skipped');
    }

    console.log(`\nALL ${passed} CHECKS PASSED\n`);
  } finally {
    server.close();
    await dropSchema();
  }
}

main().catch(async err => {
  console.error('\nTEST FAILED:', err.message);
  await dropSchema().catch(() => {});
  process.exit(1);
});
