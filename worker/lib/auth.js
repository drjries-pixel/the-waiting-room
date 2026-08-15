/**
 * Session auth — signed JWT in an httpOnly cookie, issued by the Worker.
 * Fails closed everywhere: any malformed, expired, or unverifiable token is
 * simply "not logged in".
 */

const enc = new TextEncoder();
const SESSION_DAYS = 30;
export const COOKIE_NAME = 'wr_session';

function b64urlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (str.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

/** Constant-time-ish comparison. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function issueToken(secret, profileId) {
  const header = b64urlEncode(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlEncode(
    enc.encode(JSON.stringify({ sub: profileId, iat: now, exp: now + SESSION_DAYS * 86400 })),
  );
  const body = `${header}.${payload}`;
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
  return `${body}.${b64urlEncode(sig)}`;
}

/** @returns {Promise<string|null>} the profile id, or null if the token is no good. */
export async function verifyToken(secret, token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;

  const key = await hmacKey(secret);
  const expected = b64urlEncode(
    new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${header}.${payload}`))),
  );
  if (!safeEqual(sig, expected)) return null;

  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
    if (!claims.sub || typeof claims.exp !== 'number') return null;
    if (claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims.sub;
  } catch {
    return null;
  }
}

export function sessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}`;
}

export function clearCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readCookie(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Passcode hashing — PBKDF2-SHA256. scrypt is not available in Workers. */
/* ------------------------------------------------------------------ */

const PBKDF2_ITERATIONS = 210_000;

export async function hashPasscode(passcode, saltBytes) {
  const salt = saltBytes ?? crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64urlEncode(salt)}$${b64urlEncode(new Uint8Array(bits))}`;
}

export async function verifyPasscode(passcode, stored) {
  if (!stored || !stored.startsWith('pbkdf2$')) return false;
  const [, iterStr, saltStr, hashStr] = stored.split('$');
  const salt = b64urlDecode(saltStr);
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passcode), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: Number(iterStr), hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return safeEqual(b64urlEncode(new Uint8Array(bits)), hashStr);
}
