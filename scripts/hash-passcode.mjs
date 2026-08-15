#!/usr/bin/env node
/**
 * Creates the profile row. Passcodes are never stored, transmitted, or logged
 * in plaintext — this hashes locally and prints only SQL.
 *
 *   node scripts/hash-passcode.mjs learner "Learner" "their-passcode"
 *
 * Then run the printed statement against D1:
 *   wrangler d1 execute waiting-room --remote --command "<paste>"
 *
 * The hash format here must stay in lockstep with worker/lib/auth.js.
 */

// Must match PBKDF2_ITERATIONS in worker/lib/auth.js. 100,000 is the maximum
// the Workers runtime accepts — higher values throw at login time.
const ITERATIONS = 100_000;
const [, , profileId, displayName, passcode] = process.argv;

if (!profileId || !displayName || !passcode) {
  console.error('Usage: node scripts/hash-passcode.mjs <profile-id> <display-name> <passcode>');
  process.exit(1);
}

function b64url(bytes) {
  return Buffer.from(bytes).toString('base64url');
}

const salt = crypto.getRandomValues(new Uint8Array(16));
const keyMaterial = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(passcode),
  'PBKDF2',
  false,
  ['deriveBits'],
);
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  keyMaterial,
  256,
);

const hash = `pbkdf2$${ITERATIONS}$${b64url(salt)}$${b64url(new Uint8Array(bits))}`;
const id = profileId.toLowerCase().trim().replace(/'/g, "''");
const name = displayName.replace(/'/g, "''");

console.log('\nRun this against D1:\n');
console.log(
  `INSERT INTO profile (id, display_name, passcode_hash, tier, created_at) VALUES ('${id}', '${name}', '${hash}', 1, '${new Date().toISOString()}');`,
);
console.log('\n(Then clear your shell history if you care — the passcode was an argument.)\n');
