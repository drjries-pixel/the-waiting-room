import { containsExcluded, SAFE_FALLBACK_LINE } from './exclusions.js';
import { logSafetyEvent } from '../lib/db.js';

/**
 * Post-generation output filter — handoff §2.1.
 *
 * Fails CLOSED: flagged text never reaches the browser. On a hit we regenerate
 * once with a sharpened reminder; if the second attempt also trips, the patient
 * says a neutral canned line and the incident is logged (label only, no text).
 *
 * @param {object} opts
 * @param {() => Promise<string>} opts.generate     produce a candidate line
 * @param {() => Promise<string>} opts.regenerate   produce a second, warned candidate
 * @param {string} opts.fallback                    what to say if both trip
 * @param {D1Database} opts.db
 * @param {string} opts.profileId
 * @returns {Promise<{ text: string, filtered: boolean, label: string|null }>}
 */
export async function generateFiltered({ generate, regenerate, fallback, db, profileId }) {
  const first = await generate();
  const firstHit = containsExcluded(first);
  if (!firstHit) return { text: first, filtered: false, label: null };

  await logSafetyEvent(db, profileId, 'output_filter', firstHit);

  const second = await regenerate();
  const secondHit = containsExcluded(second);
  if (!secondHit) return { text: second, filtered: true, label: firstHit };

  await logSafetyEvent(db, profileId, 'output_filter', `${secondHit}_repeat`);
  return { text: fallback ?? SAFE_FALLBACK_LINE, filtered: true, label: secondHit };
}

/**
 * Filter a whole generated object (SOAP note, feedback block) by checking its
 * serialized text. Returns null if it is clean, or the offending label.
 */
export function scanObject(obj) {
  return containsExcluded(JSON.stringify(obj));
}
