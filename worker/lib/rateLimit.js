import { nowIso } from './db.js';

/**
 * Per-profile rate limiting — handoff §5.
 *   30 patient-turn calls / 5 minutes
 *   200 / day
 *
 * Fails CLOSED: if the counter can't be read or written, the request is denied.
 * The worst case is one kid seeing "give it a minute"; the alternative is an
 * unmetered path to a paid API.
 */

const WINDOWS = [
  { name: 'burst', seconds: 300, limit: 30 },
  { name: 'daily', seconds: 86400, limit: 200 },
];

function windowKey(profileId, name, seconds) {
  const bucket = Math.floor(Date.now() / 1000 / seconds);
  return `${profileId}:${name}:${bucket}`;
}

/**
 * @returns {Promise<{ ok: boolean, window?: string, retryAfterSeconds?: number }>}
 */
export async function consumeTurn(db, profileId) {
  for (const win of WINDOWS) {
    const key = windowKey(profileId, win.name, win.seconds);
    try {
      await db
        .prepare(
          `INSERT INTO rate_limit (key, count, window_start) VALUES (?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET count = rate_limit.count + 1`,
        )
        .bind(key, nowIso())
        .run();

      const row = await db.prepare('SELECT count FROM rate_limit WHERE key = ?').bind(key).first();
      if (!row || row.count > win.limit) {
        const elapsed = Math.floor(Date.now() / 1000) % win.seconds;
        return { ok: false, window: win.name, retryAfterSeconds: win.seconds - elapsed };
      }
    } catch {
      return { ok: false, window: win.name, retryAfterSeconds: 60 };
    }
  }
  return { ok: true };
}

/**
 * Login throttle. A short passcode on a public URL is only as strong as the
 * number of guesses an attacker gets, so this is the control that actually
 * matters — far more than the KDF iteration count.
 *
 * Keyed on profile and on client IP independently: the profile cap bounds the
 * total guess rate against one account, the IP cap stops a single source
 * hammering. Fails CLOSED, like the turn limiter.
 *
 * @returns {Promise<boolean>} true if the attempt may proceed.
 */
export async function consumeLoginAttempt(db, profileId, clientIp) {
  const windows = [
    { key: `login:profile:${profileId}`, seconds: 900, limit: 10 },
    { key: `login:ip:${clientIp ?? 'unknown'}`, seconds: 900, limit: 20 },
  ];

  for (const win of windows) {
    const bucket = Math.floor(Date.now() / 1000 / win.seconds);
    const key = `${win.key}:${bucket}`;
    try {
      await db
        .prepare(
          `INSERT INTO rate_limit (key, count, window_start) VALUES (?, 1, ?)
           ON CONFLICT(key) DO UPDATE SET count = rate_limit.count + 1`,
        )
        .bind(key, nowIso())
        .run();
      const row = await db.prepare('SELECT count FROM rate_limit WHERE key = ?').bind(key).first();
      if (!row || row.count > win.limit) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Best-effort cleanup of buckets nobody will read again. */
export async function pruneRateLimits(db) {
  try {
    const cutoff = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    await db.prepare('DELETE FROM rate_limit WHERE window_start < ?').bind(cutoff).run();
  } catch {
    /* ignore */
  }
}

/** Hard cap on turns within a single visit — handoff §5. */
export const MAX_TURNS_PER_VISIT = 30;
