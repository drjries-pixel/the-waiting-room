import { makeClient, askForJson } from './client.js';
import { MODEL_CLASSIFIER, MAX_TOKENS_CLASSIFIER } from './models.js';
import { looksLikeSelfDisclosure } from './exclusions.js';
import { logSafetyEvent } from '../lib/db.js';

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: {
      type: 'string',
      enum: ['interviewing', 'about_self', 'unclear'],
    },
  },
  required: ['verdict'],
  additionalProperties: false,
};

const SYSTEM = `You are a safety classifier for a practice app where a 12-year-old
plays the role of a psychiatrist interviewing a simulated adult patient.

You will be shown one message the child typed. Decide which of these it is:

- "interviewing": she is speaking AS the clinician TO the simulated patient.
  This includes questions about the patient's mood, sleep, worries, work, family
  history, and safety. Clinical questions about the PATIENT are always
  "interviewing", including questions like "have you had any thoughts of hurting
  yourself?" — asking that is correct practice, not a warning sign.
- "about_self": she appears to have stepped out of the role and is describing
  her OWN real feelings, distress, or situation. Signals: first person present
  tense about herself, addressing no one in the scenario, asking the app for
  help, or saying the conversation is really about her.
- "unclear": genuinely ambiguous.

Weigh who the message is ABOUT, not how heavy the topic is. Reply with the
verdict only.`;

/**
 * Input-side guardrail — handoff §2.3.
 *
 * Layered: a cheap keyword pass runs first and is authoritative for a block.
 * Anything it doesn't catch goes to a small classifier call.
 *
 * Failure policy: a classifier that errors twice returns 'retry', which asks
 * the learner to send the message again rather than either (a) firing the pause card
 * on a transient network blip or (b) forwarding unscreened text to the patient
 * model. Nothing unscreened ever reaches the conversation.
 *
 * @returns {Promise<'ok'|'pause'|'retry'>}
 */
export async function screenInput(env, db, profileId, message) {
  if (looksLikeSelfDisclosure(message)) {
    await logSafetyEvent(db, profileId, 'input_pause', 'keyword');
    return 'pause';
  }

  const client = makeClient(env);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await askForJson(client, {
        model: MODEL_CLASSIFIER,
        maxTokens: MAX_TOKENS_CLASSIFIER,
        system: SYSTEM,
        messages: [{ role: 'user', content: `Message from the learner:\n\n${message}` }],
        schema: SCHEMA,
      });
      if (result.verdict === 'about_self') {
        await logSafetyEvent(db, profileId, 'input_pause', 'classifier');
        return 'pause';
      }
      return 'ok';
    } catch {
      // fall through and retry once
    }
  }

  await logSafetyEvent(db, profileId, 'classifier_error', 'unavailable');
  return 'retry';
}

/**
 * Silent, content-free parent notification — handoff §2.3, open fork #2.
 * No-op unless PARENT_ALERT_WEBHOOK is set. Deliberately carries no message
 * text, no transcript, and no detail beyond "the pause card fired at <time>".
 */
export async function notifyParent(env, when) {
  const url = env.PARENT_ALERT_WEBHOOK;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        app: 'The Waiting Room',
        event: 'pause_card_shown',
        at: when,
      }),
    });
  } catch {
    // A failed notification must never break the child's session.
  }
}
