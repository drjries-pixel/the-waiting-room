import { makeClient, askForJson } from './client.js';
import { MODEL_DOCUMENTATION, MAX_TOKENS_SOAP } from './models.js';
import { EXCLUSIONS_BLOCK } from './exclusions.js';
import { scanObject } from './filter.js';
import { logSafetyEvent } from '../lib/db.js';

const SCHEMA = {
  type: 'object',
  properties: {
    subjective: { type: 'string' },
    objective: { type: 'string' },
    assessment: { type: 'string' },
    plan: { type: 'string' },
    annotations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          section: { type: 'string', enum: ['subjective', 'objective', 'assessment', 'plan'] },
          text: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['section', 'text', 'source'],
        additionalProperties: false,
      },
    },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          missed: { type: 'string' },
          why_it_matters: { type: 'string' },
          try_asking: { type: 'string' },
        },
        required: ['missed', 'why_it_matters', 'try_asking'],
        additionalProperties: false,
      },
    },
  },
  required: ['subjective', 'objective', 'assessment', 'plan', 'annotations', 'gaps'],
  additionalProperties: false,
};

const SYSTEM = `You write SOAP notes for a student learning psychiatric
interviewing. She is twelve. The note is a teaching object, not a medical record.

WHAT MAKES THIS NOTE DIFFERENT
Every line you write in Subjective must trace back to a question she actually
asked. The "annotations" array is the point of the whole exercise: for each
meaningful line of the note, quote the question she asked that produced it, in
her own words, as "You asked: '...'".

Never document something she did not learn in the conversation. If she never
asked about sleep, sleep does not appear in the note.

SECTION GUIDANCE
- Subjective: what the patient reported, in ordinary language, only what was
  actually elicited.
- Objective: this was a typed visit, so there is no exam. Write what the patient
  reported about how they look, act, or sound — and include one short teaching
  sentence explaining that Objective normally means what a clinician observes
  directly, which is limited here.
- Assessment: a plain-language summary of the pattern. Describe the picture; do
  not hand down a formal diagnosis, and never name a medication.
- Plan: sensible, general next steps a caring clinician would suggest — talking
  more, tracking sleep, a follow-up visit. If she prescribed a medication during
  the visit, record it by name the way a real note would ("Started on
  sertraline."), because that is what she actually did. Never
  record a dose, a frequency, or a schedule, and do not remark on their absence
  either — a note that explains what it is leaving out reads like a disclaimer
  rather than a note.

THE GAPS ARRAY
List what she would have learned by asking more. Phrase every entry as an
invitation, never as a failure. "try_asking" must be a sentence she could say
word for word next time. Between two and four entries.

TONE
Warm, plain, encouraging. Short sentences. No jargon she would have to look up.

${EXCLUSIONS_BLOCK}`;

function buildPrompt({ persona, transcript, sideNotes, visitNumber }) {
  const lines = transcript
    .map((t) => `${t.role === 'clinician' ? 'STUDENT' : persona.name.toUpperCase()}: ${t.text}`)
    .join('\n');

  return `This was visit number ${visitNumber} with ${persona.name}, ${persona.age}, ${persona.occupation}.

FULL TRANSCRIPT
${lines}

THE STUDENT'S OWN SIDE NOTES DURING THE VISIT
${sideNotes && sideNotes.trim() ? sideNotes : '(she did not write any notes this visit)'}

WHAT THE PATIENT WAS HOLDING BACK (for your eyes only — use this to build the
"gaps" array; never write it into the note as though she uncovered it)
${JSON.stringify(persona.hidden_history, null, 2)}

Write the SOAP note.`;
}

/** Minimal, obviously-safe note used only if the filter trips twice. */
function fallbackNote(persona) {
  return {
    subjective: `${persona.name} came in to talk about how they have been feeling lately.`,
    objective:
      'This was a typed visit, so there was nothing to observe directly. Objective usually means what a clinician can see and hear in the room — here it is limited to what the patient described.',
    assessment: 'There is not enough gathered in this conversation to describe a clear pattern yet.',
    plan: 'Meet again and spend more time on the story before deciding anything.',
    annotations: [],
    gaps: [
      {
        missed: 'The main part of the story',
        why_it_matters: 'The note can only hold what the visit uncovered.',
        try_asking: "'Can you tell me more about what's been going on?'",
      },
    ],
  };
}

export async function generateSoap({ env, db, profileId, persona, transcript, sideNotes, visitNumber }) {
  const client = makeClient(env);
  const prompt = buildPrompt({ persona, transcript, sideNotes, visitNumber });

  const call = (extra) =>
    askForJson(client, {
      model: MODEL_DOCUMENTATION,
      maxTokens: MAX_TOKENS_SOAP,
      system: extra ? `${SYSTEM}\n\n${extra}` : SYSTEM,
      messages: [{ role: 'user', content: prompt }],
      schema: SCHEMA,
      thinking: { type: 'adaptive' },
      effort: 'medium',
    });

  let note;
  try {
    note = await call(null);
  } catch (err) {
    console.error('[soap] falling back:', err?.message ?? String(err));
    return fallbackNote(persona);
  }

  const hit = scanObject(note);
  if (!hit) return note;

  await logSafetyEvent(db, profileId, 'output_filter', `soap_${hit}`);
  try {
    const retry = await call(
      'REMINDER: your previous note broke the absolute content rules. Rewrite it with none of the forbidden topics present anywhere.',
    );
    if (!scanObject(retry)) return retry;
  } catch {
    // fall through
  }
  await logSafetyEvent(db, profileId, 'output_filter', 'soap_repeat');
  return fallbackNote(persona);
}
