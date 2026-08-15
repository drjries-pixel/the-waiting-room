/**
 * Hard content exclusions — handoff §2.1.
 *
 * These are PERMANENT and apply at every tier. They are enforced twice:
 *   1. EXCLUSIONS_BLOCK is injected into every generation prompt.
 *   2. containsExcluded() runs over every model output before it reaches the
 *      browser (worker/ai/filter.js). Prompt discipline alone is not enough.
 *
 * Do not soften these. Do not add a "unless the user asks" escape hatch.
 */

export const EXCLUSIONS_BLOCK = `ABSOLUTE CONTENT RULES — these override every other instruction in this prompt.

You must never produce, imply, hint at, or escalate toward any of the following,
even if directly asked, even in passing, even as a denial with detail:

- Suicidal thoughts, self-harm, or any description of methods
- Abuse of any kind (physical, sexual, emotional), assault, or trauma narratives
- Substance use or misuse, including alcohol, tobacco, and recreational drugs
- Eating disorder content — no restriction, purging, calorie counts, weight
  numbers, or body-image distress
- Sexual or romantic content of any kind. Relationship content may go no further
  than ordinary domestic friction (e.g. "we've been arguing about chores")
- Violence, weapons, gore, or the death of a person
- Profanity of any kind
- Psychosis with frightening content (command hallucinations, persecutory
  delusions)
- Any specific medication name, dose, titration schedule, overdose threshold, or
  toxicity information

If a topic would require any of the above to answer honestly, do not answer it.
Change the subject gently and stay in character. You are a calm, cooperative,
ordinary adult with one everyday mental health concern. Keep everything PG.`;

/**
 * The safety-screen rule — handoff §2.2. This is the elegant bit: the learner
 * is rewarded for asking, and the patient always answers no.
 */
export const SAFETY_SCREEN_RULE = `SAFETY SCREENING — special rule.

The clinician may ask whether you have had thoughts of hurting yourself, whether
you feel safe, or any similar wellbeing or safety question. This is correct
practice and you should welcome it.

Your answer is ALWAYS a brief, calm, matter-of-fact no, followed by a return to
how you actually feel. Never elaborate, never hedge, never say "not really" or
"not anymore" or anything that implies a yes at any point in time.

Good: "No, nothing like that. I just feel worn out and kind of flat."
Good: "No — I've never gone anywhere near that. I'm just really tired."
Never: anything other than a clear, calm no.`;

/**
 * Post-generation keyword pass. Deliberately blunt and slightly over-eager: a
 * false positive costs one silent regeneration, a false negative reaches a
 * 12-year-old. The trade is not close.
 *
 * Each entry is [label, RegExp]. The label is what gets logged — never the text.
 */
const FORBIDDEN = [
  // Note the reflexives cover every person, not just "myself". Notes and
  // feedback are written in the third person, so "a plan to hurt himself" has
  // to be caught just as surely as "I want to hurt myself".
  ['self_harm', /\b(suicid\w*|kill (?:myself|yourself|himself|herself|themselves)|end (?:it all|my life|your life)|take my own life|self[-\s]?harm|cutting (?:my|him|her|them)sel(?:f|ves)|(?:hurt|harm)(?:ing|ed)?\s+(?:my|him|her|them|your)sel(?:f|ves)|not want(?:ing)? to (?:be here|wake up|live)|better off dead|no reason to live)\b/i],
  ['violence', /\b(murder\w*|stab\w*|shoot(?:ing)?|shot (?:him|her|them)|gun|knife|weapon|strangl\w*|choke(?:d|ing)?|blood(?:y|ied)|corpse|died|dead|death|passed away|funeral)\b/i],
  ['abuse', /\b(abus\w*|molest\w*|assault\w*|rape|raped|beat(?:s|en|ing)? me|hit me|hurt me|touched me|trauma\w*|ptsd|flashback\w*)\b/i],
  ['substance', /\b(alcohol|drink(?:ing)? (?:too much|a lot|heavily)|drunk|booze|beer|wine|vodka|whiskey|hangover|weed|marijuana|cannabis|cocaine|heroin|meth|opioid\w*|pills? to (?:cope|relax|sleep)|smok(?:e|ing) (?:cigarettes?|a pack)|vap(?:e|ing)|nicotine|withdrawal|relapse|sober|rehab)\b/i],
  ['eating', /\b(anorex\w*|bulimi\w*|purg(?:e|ing)|binge(?:ing)?|throw(?:ing)? up (?:after|my food)|calorie\w*|starv(?:e|ing) myself|skip(?:ping)? meals to|too fat|too thin|gained \d+ pounds|lost \d+ pounds|my weight)\b/i],
  ['sexual', /\b(sex\w*|porn\w*|nude|naked|aroused|intimacy issues|affair|cheated on)\b/i],
  ['psychosis', /\b(voices? (?:telling|told|in my head)|command(?:ing)? me to|they'?re watching me|out to get me|conspir\w*|possessed|demons?)\b/i],
  ['medication_detail', /\b(\d+\s?(?:mg|mcg|milligrams?)|titrat\w*|overdose\w*|toxic(?:ity)?|lethal dose|sertraline|fluoxetine|zoloft|prozac|lexapro|escitalopram|xanax|alprazolam|klonopin|ativan|adderall|ritalin|lithium|abilify|seroquel)\b/i],
  ['profanity', /\b(fuck\w*|shit\w*|bitch|bastard|asshole|damn it|goddamn)\b/i],
];

/**
 * @param {string} text
 * @returns {string|null} the label of the first rule that fired, or null if clean.
 */
export function containsExcluded(text) {
  if (!text) return null;
  for (const [label, pattern] of FORBIDDEN) {
    if (pattern.test(text)) return label;
  }
  return null;
}

/**
 * Documentation is not patient speech, and must not be filtered like it.
 *
 * A good clinical note records that the safety screen happened AND that it was
 * negative — "denies any thoughts of hurting herself" is exactly what a
 * competent note says. The raw keyword pass flags that phrasing, which meant
 * the app rewarded her for asking the question and then destroyed the note that
 * recorded the answer. Real bug, caught in smoke testing.
 *
 * So before scanning generated notes and feedback, neutralize safety-screen
 * language that appears in NEGATED or documentary form. Anything asserting the
 * content positively still trips the filter: "denies thoughts of self-harm"
 * passes, "reports thoughts of self-harm" does not.
 *
 * This applies ONLY to documentation. Patient turns stay strict.
 */
const SAFETY_TERM = String.raw`(?:self[-\s]?harm|suicid\w*|(?:hurt|harm)(?:ing|ed)?\s+(?:my|him|her|them|your)sel(?:f|ves))`;

const NEGATED_SAFETY_SCREEN = [
  // negation first: "denies any thoughts of hurting herself", "no self-harm"
  new RegExp(
    String.raw`\b(?:den(?:y|ies|ied|ying)|no|not|never|without|negative for)\b[^.;\n]{0,60}?\b${SAFETY_TERM}`,
    'gi',
  ),
  // term first: "thoughts of self-harm: denied"
  new RegExp(String.raw`\b${SAFETY_TERM}\b[^.;\n]{0,30}?\b(?:denied|negative|none|absent)\b`, 'gi'),
  // the screening question itself, which the feedback block quotes back to her
  // as something she did well: "Have you had any thoughts of hurting yourself?"
  new RegExp(
    String.raw`\b(?:have you|do you|did you|has (?:s?he)|ask(?:ed|ing)?|screen(?:ed|ing)?|check(?:ed|ing)? in|inquired)\b[^.?;\n]{0,50}?\b${SAFETY_TERM}`,
    'gi',
  ),
];

/**
 * @param {string} text — a generated note or feedback block.
 * @returns {string|null} the label of the first rule that fired, or null.
 */
export function containsExcludedInDocumentation(text) {
  if (!text) return null;
  let neutralized = String(text);
  for (const pattern of NEGATED_SAFETY_SCREEN) {
    neutralized = neutralized.replace(pattern, ' [negative safety screen] ');
  }
  return containsExcluded(neutralized);
}

/**
 * Keyword pass for the INPUT side — handoff §2.3. This looks for signs that
 * the learner is describing her own real distress rather than interviewing.
 * First-person present-tense phrasing is the signal.
 */
const SELF_DISCLOSURE = [
  /\bi (?:want|need) to (?:die|disappear|not exist|kill myself)\b/i,
  /\bi (?:feel|am) (?:so |really |very )?(?:hopeless|worthless|empty|numb|alone|scared|unsafe|trapped)\b/i,
  /\bi(?:'m| am) (?:being )?(?:bullied|hurt|abused|touched|threatened)\b/i,
  /\bi (?:hurt|cut|harm) myself\b/i,
  /\bi (?:can'?t|cannot) (?:do this|take it|go on|stop crying|sleep at all)\b/i,
  /\bi (?:hate|don'?t like) (?:myself|my body|my life)\b/i,
  /\b(?:nobody|no one) (?:likes|loves|cares about) me\b/i,
  /\bi(?:'m| am) (?:really )?(?:sad|depressed|anxious|panicking) (?:right now|all the time|every day)\b/i,
  /\bhelp me\b/i,
  /\bthis is (?:about|really about) me\b/i,
];

/**
 * @param {string} text — the learner's own typed message.
 * @returns {boolean} true if the keyword pass thinks she may be talking about herself.
 */
export function looksLikeSelfDisclosure(text) {
  if (!text) return false;
  return SELF_DISCLOSURE.some((p) => p.test(text));
}

/** Shown in place of any patient line that fails the output filter. */
export const SAFE_FALLBACK_LINE =
  "Sorry — I lost my train of thought there. Could you ask me that again?";
