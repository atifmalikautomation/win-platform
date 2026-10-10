// Postgres (Neon) access layer.
// Why: the old storage was ONE JSON file on Vercel Blob. Blob reads are CDN-cached
// and every lambda wrote its whole (often stale) copy back, so users, balances and
// bets silently disappeared. Postgres gives atomic, row-level updates.
const { Pool, types } = require('pg');

// numeric -> JS number, int8 -> JS number (amounts are small enough)
types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));
types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));

const CONNECTION_STRING = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
const SCHEMA = process.env.SKYWIN_PG_SCHEMA || ''; // tests only (needs an unpooled URL)

// TLS is configured explicitly below; drop libpq-only params that pg warns about.
function cleanUrl(raw) {
  try {
    const u = new URL(raw);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('channel_binding');
    return u.toString();
  } catch (e) {
    return raw;
  }
}

let pool = null;
function getPool() {
  if (!CONNECTION_STRING) throw new Error('DATABASE_URL is not configured');
  if (!pool) {
    if (SCHEMA && !/^[a-z_][a-z0-9_]*$/.test(SCHEMA)) throw new Error('Invalid SKYWIN_PG_SCHEMA');
    const local = /localhost|127\.0\.0\.1/.test(CONNECTION_STRING);
    pool = new Pool({
      connectionString: cleanUrl(CONNECTION_STRING),
      max: Number(process.env.PG_POOL_MAX || 5),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 8000,
      ssl: local ? false : { rejectUnauthorized: true },
      ...(SCHEMA ? { options: `-c search_path=${SCHEMA}` } : {})
    });
    pool.on('error', err => console.error('pg pool error:', err.message));
  }
  return pool;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id                 text PRIMARY KEY,
  username           text NOT NULL,
  email              text NOT NULL DEFAULT '',
  password_hash      text NOT NULL DEFAULT '',
  role               text NOT NULL DEFAULT 'user',
  balance            numeric(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  bonus_balance      numeric(14,2) NOT NULL DEFAULT 0,
  auth_provider      text NOT NULL DEFAULT 'email',
  picture            text NOT NULL DEFAULT '',
  is_banned          boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_login         timestamptz,
  balance_updated_at bigint NOT NULL DEFAULT 0,
  version            integer NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower ON users (lower(email)) WHERE email <> '';

CREATE TABLE IF NOT EXISTS transactions (
  id               text PRIMARY KEY,
  user_id          text NOT NULL,
  username         text NOT NULL DEFAULT '',
  type             text NOT NULL,
  method           text NOT NULL DEFAULT '',
  amount           numeric(14,2) NOT NULL,
  account_number   text NOT NULL DEFAULT '',
  reference        text NOT NULL DEFAULT '',
  proof_url        text NOT NULL DEFAULT '',
  proof_screenshot text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'pending',
  notes            text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now(),
  approved_at      timestamptz
);
CREATE INDEX IF NOT EXISTS transactions_user ON transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS transactions_status ON transactions (status);

CREATE TABLE IF NOT EXISTS bets (
  id           text PRIMARY KEY,
  user_id      text NOT NULL,
  username     text NOT NULL DEFAULT '',
  game         text NOT NULL,
  round_id     bigint,
  bet_amount   numeric(14,2) NOT NULL,
  auto_cashout numeric(10,2),
  multiplier   numeric(10,2) NOT NULL DEFAULT 0,
  payout       numeric(14,2) NOT NULL DEFAULT 0,
  status       text NOT NULL,
  crash_at     numeric(10,2),
  created_at   timestamptz NOT NULL DEFAULT now(),
  settled_at   timestamptz
);
CREATE INDEX IF NOT EXISTS bets_user ON bets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bets_round ON bets (round_id);
CREATE INDEX IF NOT EXISTS bets_open ON bets (round_id) WHERE status = 'placed';
CREATE INDEX IF NOT EXISTS bets_created ON bets (created_at DESC);

CREATE TABLE IF NOT EXISTS kv (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
`;

let ready = null;
function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const p = getPool();
      if (SCHEMA) await p.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA}`);
      await p.query(SCHEMA_SQL);
    })().catch(err => { ready = null; throw err; });
  }
  return ready;
}

async function query(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}

// Runs fn(client) inside BEGIN/COMMIT; rolls back on any error.
async function tx(fn) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) {}
    throw err;
  } finally {
    client.release();
  }
}

async function end() {
  if (pool) { const p = pool; pool = null; ready = null; await p.end(); }
}

function isConfigured() {
  return Boolean(CONNECTION_STRING);
}

module.exports = { query, tx, ensureSchema, end, isConfigured, SCHEMA };
