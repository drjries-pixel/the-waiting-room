/**
 * Model selection — handoff §6.
 *
 * Verified against the Anthropic model catalog on 2026-08-14. These are exact,
 * complete model IDs; never append a date suffix.
 *
 *   claude-sonnet-5   — patient turns, SOAP generation, grading
 *   claude-haiku-4-5  — the input-side safety classifier (cheap, fast, plenty)
 *
 * A note that matters more than it looks: on Claude Sonnet 5, adaptive thinking
 * is ON by default when the `thinking` field is omitted, and `max_tokens` caps
 * thinking AND response text together. Patient turns run with max_tokens 400
 * (§5), so thinking would eat the entire budget and truncate the reply. Every
 * patient-turn call therefore sets `thinking: { type: 'disabled' }` explicitly.
 * SOAP and grading get a generous budget and keep adaptive thinking on.
 */

export const MODEL_CONVERSATION = 'claude-sonnet-5';
export const MODEL_DOCUMENTATION = 'claude-sonnet-5';
export const MODEL_CLASSIFIER = 'claude-haiku-4-5';

/** Hard ceiling on a patient's reply. Patients are conversational, not essayistic. */
export const MAX_TOKENS_PATIENT_TURN = 400;
export const MAX_TOKENS_SOAP = 4000;
export const MAX_TOKENS_GRADE = 3000;
export const MAX_TOKENS_CLASSIFIER = 150;
