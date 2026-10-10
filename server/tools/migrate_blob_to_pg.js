// One-time migration: old Vercel Blob JSON database  ->  Postgres (Neon).
// Usage: node server/tools/migrate_blob_to_pg.js <path-to-env-file> [--dry]
// The env file must contain BLOB_READ_WRITE_TOKEN and DATABASE_URL.
// Safe to re-run: existing rows are kept (ON CONFLICT DO NOTHING).
const fs = require('fs');

const [envFile, flag] = process.argv.slice(2);
if (!envFile) {
  console.error('usage: node server/tools/migrate_blob_to_pg.js <envFile> [--dry]');
  process.exit(1);
}
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const DRY = flag === '--dry';

async function readBlob(fileName) {
  const token = process.env.BLOB_READ_WRITE_TOKEN || '';
  const parts = token.split('_');
  if (parts.length < 5) throw new Error('BLOB_READ_WRITE_TOKEN missing');
  const host = `${parts[3].toLowerCase()}.private.blob.vercel-storage.com`;
  const res = await fetch(`https://${host}/${fileName}?download=1&_t=${Date.now()}`, {
    headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' },
    cache: 'no-store'
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`blob read ${fileName}: ${res.status}`);
  return res.json();
}

const num = v => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 100) / 100 : 0);
const ts = v => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

(async () => {
  const data = await readBlob('skywin-database.json');
  const control = await readBlob('skywin-aviator-control.json');
  if (!data) throw new Error('No blob database found');
  const users = data.users || [];
  const txs = data.transactions || [];
  const bets = data.bets || [];
  console.log(`blob: ${users.length} users, ${txs.length} transactions, ${bets.length} bets, control: ${control ? 'yes' : 'no'}`);
  if (DRY) {
    console.log('users:', users.map(u => `${u.username} (${u.role}) bal=${u.balance}`).join(', '));
    console.log('open bets:', bets.filter(b => b.status === 'placed').length);
    return;
  }

  const pg = require('../pg');
  await pg.ensureSchema();

  let nu = 0;
  const seen = new Set();
  for (const u of users) {
    const uname = String(u.username || '').trim();
    const key = uname.toLowerCase();
    if (!uname || !u.id || seen.has(key)) continue;
    seen.add(key);
    const r = await pg.query(
      `INSERT INTO users (id, username, email, password_hash, role, balance, bonus_balance, auth_provider, picture,
                          is_banned, created_at, last_login, balance_updated_at, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz, now()),$12,$13,1)
       ON CONFLICT DO NOTHING`,
      [u.id, uname, String(u.email || '').trim().toLowerCase(), u.passwordHash || '',
        u.role === 'admin' ? 'admin' : 'user', Math.max(0, num(u.balance)), num(u.bonusBalance),
        u.authProvider || 'email', u.picture || '', !!u.isBanned, ts(u.createdAt), ts(u.lastLogin),
        Number(u.balanceUpdatedAt) || Date.now()]);
    nu += r.rowCount;
  }

  let nt = 0;
  for (const t of txs) {
    if (!t.id || !t.userId) continue;
    const r = await pg.query(
      `INSERT INTO transactions (id, user_id, username, type, method, amount, account_number, reference, proof_url,
                                 proof_screenshot, status, notes, created_at, approved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13::timestamptz, now()),$14) ON CONFLICT DO NOTHING`,
      [t.id, t.userId, t.username || '', t.type || 'deposit', t.method || '', num(t.amount), t.accountNumber || '',
        t.reference || '', t.proofUrl || '', t.proofScreenshot || '', t.status || 'pending', t.notes || '',
        ts(t.createdAt), ts(t.approvedAt)]);
    nt += r.rowCount;
  }

  let nb = 0;
  for (const b of bets) {
    if (!b.id || !b.userId) continue;
    // Open bets from the old storage cannot be trusted any more -> refund them.
    const refund = b.status === 'placed';
    const r = await pg.query(
      `INSERT INTO bets (id, user_id, username, game, round_id, bet_amount, auto_cashout, multiplier, payout, status,
                         crash_at, created_at, settled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::timestamptz, now()),$13) ON CONFLICT DO NOTHING`,
      [b.id, b.userId, b.username || '', b.game || 'aviator', b.roundId ?? null, num(b.betAmount ?? b.amount),
        b.autoCashout ?? null, num(b.multiplier), num(b.payout), refund ? 'refunded' : (b.status || 'lost'),
        b.crashAt ?? null, ts(b.createdAt), ts(b.settledAt || b.cashedOutAt || b.cancelledAt)]);
    if (r.rowCount && refund) {
      await pg.query('UPDATE users SET balance = balance + $2 WHERE id = $1', [b.userId, num(b.betAmount ?? b.amount)]);
    }
    nb += r.rowCount;
  }

  if (control && control.anchor) {
    await pg.query(
      `INSERT INTO kv (key, value) VALUES ('aviator-control', $1::jsonb) ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(control)]);
  }
  const gs = data.gameSettings || {};
  await pg.query(
    `INSERT INTO kv (key, value) VALUES ('gameSettings', $1::jsonb) ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify({
      minBet: Number(gs.minBet) || 10,
      maxBet: Number(gs.maxBet) || 50000,
      maxPayout: Number(gs.maxPayout) || 1000000,
      maintenance: !!gs.maintenance
    })]);

  console.log(`inserted: ${nu} users, ${nt} transactions, ${nb} bets`);
  await pg.end();
})().catch(err => {
  console.error('MIGRATION FAILED:', err.message);
  process.exit(1);
});
