// Small helper around the private Vercel Blob store.
// The token MUST come from the environment (never hardcode it: the repo is public).
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || '';

function storeHost() {
  // Token format: vercel_blob_rw_<storeId>_<secret>
  const parts = BLOB_TOKEN.split('_');
  if (parts.length < 5) return null;
  return `${parts[3].toLowerCase()}.private.blob.vercel-storage.com`;
}

function isConfigured() {
  return Boolean(BLOB_TOKEN && storeHost());
}

// Returns { ok: true, data } | { ok: true, data: null, notFound: true } | { ok: false }
async function readJson(fileName) {
  if (!isConfigured()) return { ok: false };
  try {
    const url = `https://${storeHost()}/${fileName}?download=1&_t=${Date.now()}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${BLOB_TOKEN}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache'
      },
      cache: 'no-store'
    });
    if (res.status === 404) return { ok: true, data: null, notFound: true };
    if (!res.ok) return { ok: false };
    return { ok: true, data: await res.json() };
  } catch (e) {
    return { ok: false };
  }
}

async function writeJson(fileName, data) {
  if (!isConfigured()) return false;
  try {
    const { put } = require('@vercel/blob');
    await put(fileName, JSON.stringify(data), {
      access: 'private',
      token: BLOB_TOKEN,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json'
    });
    return true;
  } catch (e) {
    console.error(`Blob write failed for ${fileName}:`, e.message);
    return false;
  }
}

module.exports = { readJson, writeJson, isConfigured, BLOB_TOKEN };
