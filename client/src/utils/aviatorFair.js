// Provably-fair helpers for SkyWin Aviator.
// Mirrors server/aviatorEngine.js exactly:
//   hash  = sha256(seed)                                  (published before the round)
//   h     = HMAC_SHA256(key = seed, "skywin-aviator-crash")
//   r     = int(h[0:13], 16) / 2^52
//   crash = min(1000, max(1, floor(((100 - edge) / 100) / (1 - r) * 100) / 100))
// Everything runs locally in the browser with WebCrypto - nothing is trusted from the server.

const enc = new TextEncoder();

const toHex = (buf) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

function subtle() {
  const s = typeof window !== 'undefined' && window.crypto && window.crypto.subtle;
  if (!s) throw new Error('Your browser cannot run the check here (WebCrypto needs HTTPS).');
  return s;
}

export async function sha256Hex(text) {
  return toHex(await subtle().digest('SHA-256', enc.encode(String(text))));
}

export async function hmacSha256Hex(key, message) {
  const k = await subtle().importKey('raw', enc.encode(String(key)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await subtle().sign('HMAC', k, enc.encode(String(message))));
}

export async function crashFromSeed(seed, edge) {
  const h = await hmacSha256Hex(seed, 'skywin-aviator-crash');
  const r = parseInt(h.slice(0, 13), 16) / Math.pow(2, 52);
  const m = ((100 - Number(edge)) / 100) / (1 - r);
  return Math.min(1000, Math.max(1.0, Math.floor(m * 100) / 100));
}

/**
 * Verify a finished round.
 * @returns {Promise<{hashOk:boolean, computedHash:string, computedCrash:number, crashOk:boolean|null}>}
 */
export async function verifyRound({ seed, hash, edge, crashAt, voided }) {
  const computedHash = await sha256Hex(seed);
  const computedCrash = await crashFromSeed(seed, edge);
  const crashOk = voided || typeof crashAt !== 'number' ? null : Math.abs(computedCrash - crashAt) < 0.001;
  return { hashOk: computedHash === String(hash || '').toLowerCase(), computedHash, computedCrash, crashOk };
}

// Colour tier used by the history pills (same convention as the classic crash UI).
export function crashTier(entry) {
  if (!entry || entry.voided) return 'void';
  if (entry.crashAt >= 10) return 'pink';
  if (entry.crashAt >= 2) return 'purple';
  return 'blue';
}

export const TIER_TEXT = {
  blue: 'text-[#34b4ff]',
  purple: 'text-[#913ef8]',
  pink: 'text-[#c017b4]',
  void: 'text-zinc-400'
};
