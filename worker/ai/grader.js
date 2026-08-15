import { makeClient, askForJson } from './client.js';
import { MODEL_DOCUMENTATION, MAX_TOKENS_GRADE } from './models.js';
import { EXCLUSIONS_BLOCK } from './exclusions.js';
import { scanObject } from './filter.js';
import { logSafetyEvent } from '../lib/db.js';

/** Handoff §10. Order here is the order they render. */
export const DIMENSIONS = [
  { key: 'warmth', label: 'Warmth & Rapport' },
  { key: 'open_questions', label: 'Open-Ended Questions' },
  { key: 'gathering', label: 'Gathering the Story' },
  { key: 'safety', label: 'Safety & Screening' },
  { key: 'explaining', label: 'Explaining Things Kindly' },
  { key: 'documentation', label: 'Documentation' },
];

const SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'object',
      properties: Object.fromEntries(
        DIMENSIONS.map((d) => [
          d.key,
          {
            type: 'object',
            properties: {
              // The 3-point floor is enforced by the schema, not by asking nicely.
              score: { type: 'integer', enum: [3, 4, 5] },
              note: { type: 'string' },
            },
            required: ['score', 'note'],
            additionalProperties: false,
          },
        ]),
      ),
      required: DIMENSIONS.map((d) => d.key),
      additionalProperties: false,
    },
    did_well: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          quote: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['quote', 'why'],
        additionalProperties: false,
      },
    },
    growth: {
      type: 'object',
      properties: {
        area: { type: 'string' },
        example_sentence: { type: 'string' },
      },
      required: ['area', 'example_sentence'],
      additionalProperties: false,
    },
    trend_note: { type: 'string' },
  },
  required: ['scores', 'did_well', 'growth', 'trend_note'],
  additionalProperties: false,
};

const SYSTEM = `You give feedback to a twelve-year-old who is learning how to
interview patients, for fun. She is doing this because she is curious about
psychiatry. Your job is to make her want to do another visit.

THE SIX THINGS YOU SCORE (3 to 5 each)
- warmth: Warmth & Rapport. A 5 greeted the patient, used their name, and
  acknowledged how they felt before jumping to problem-solving.
- open_questions: Open-Ended Questions. A 5 mostly asked "tell me about..."
  rather than a chain of yes/no questions.
- gathering: Gathering the Story. A 5 uncovered when it started, how long it has
  gone on, the symptoms, and how it affects daily life.
- safety: Safety & Screening. A 5 asked at least one gentle safety or wellbeing
  screening question. Asking is what earns the points — award them for asking,
  regardless of the answer she got. If she did not ask at all, this is a 3 and
  the growth area should be a warm nudge to try it next time.
- explaining: Explaining Things Kindly. A 5 reflected back what she heard and
  explained things in plain words.
- documentation: Documentation. A 5 wrote side notes that captured specifics
  which then showed up in the note.

HARD RULES ON HOW YOU WRITE
- Open with something specific she did well, and quote her actual words back to
  her. Three items in "did_well", each with a real quote from the transcript.
- Exactly ONE growth area, framed as "next time, try...", with a concrete
  example sentence she could say word for word.
- Never use the words wrong, failed, poor, incorrect, bad, or mistake.
- Never score below 3. The floor is deliberate: these scores exist to show
  movement, not to gate anything.
- "trend_note" is one short line comparing this visit to her recent ones, using
  the score history you are given. If there is no history, write a warm line
  about this being her first visit instead.
- Every "note" field is one short sentence, addressed to her as "you".

${EXCLUSIONS_BLOCK}`;

function buildPrompt({ persona, transcript, sideNotes, soap, history }) {
  const lines = transcript
    .map((t) => `${t.role === 'clinician' ? 'STUDENT' : persona.name.toUpperCase()}: ${t.text}`)
    .join('\n');

  const historyLine = history.length
    ? history.map((h) => `visit on ${h.finished_at?.slice(0, 10)}: ${h.total}/30`).join('; ')
    : '(this is her first completed visit)';

  return `Patient: ${persona.name}, ${persona.age}, ${persona.occupation}.

TRANSCRIPT
${lines}

HER SIDE NOTES
${sideNotes && sideNotes.trim() ? sideNotes : '(none written)'}

THE NOTE THAT CAME OUT OF IT
${JSON.stringify({ subjective: soap.subjective, assessment: soap.assessment, plan: soap.plan })}

HER RECENT SCORES
${historyLine}

Score the visit and write her feedback.`;
}

function fallbackScore() {
  return {
    scores: Object.fromEntries(
      DIMENSIONS.map((d) => [d.key, { score: 3, note: 'You showed up and gave it a real try.' }]),
    ),
    did_well: [
      { quote: '', why: 'You sat down with a patient and had a whole conversation with them.' },
    ],
    growth: {
      area: 'Next time, try asking one more follow-up question after each answer.',
      example_sentence: "'Can you tell me a little more about that?'",
    },
    trend_note: 'Every visit teaches you something new.',
  };
}

export async function gradeVisit({ env, db, profileId, persona, transcript, sideNotes, soap, history }) {
  const client = makeClient(env);
  const prompt = buildPrompt({ persona, transcript, sideNotes, soap, history });

  const call = (extra) =>
    askForJson(client, {
      model: MODEL_DOCUMENTATION,
      maxTokens: MAX_TOKENS_GRADE,
      system: extra ? `${SYSTEM}\n\n${extra}` : SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      schema: SCHEMA,
      thinking: { type: 'adaptive' },
      effort: 'medium',
    });

  let result;
  try {
    result = await call(null);
  } catch {
    result = fallbackScore();
  }

  const hit = scanObject(result);
  if (hit) {
    await logSafetyEvent(db, profileId, 'output_filter', `grade_${hit}`);
    result = fallbackScore();
  }

  result.total = DIMENSIONS.reduce((sum, d) => sum + (result.scores[d.key]?.score ?? 3), 0);
  return result;
}
