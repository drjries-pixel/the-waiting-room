import { makeClient, textOf } from './client.js';
import { MODEL_CONVERSATION, MAX_TOKENS_PATIENT_TURN } from './models.js';
import { EXCLUSIONS_BLOCK, SAFETY_SCREEN_RULE, SAFE_FALLBACK_LINE } from './exclusions.js';
import { generateFiltered } from './filter.js';

/**
 * Patient turn — handoff §6.2. System prompt order is fixed: persona, then the
 * exclusions, then the safety-screen rule, then style.
 */
function buildSystem(persona, followUpContext, extraWarning) {
  const hidden = persona.hidden_history;
  const wontVolunteer = (hidden.what_they_wont_volunteer || []).join(', ');

  return `You are playing a patient in a practice psychiatry visit. The person
interviewing you is a student learning how to talk with patients. Stay in
character at all times.

WHO YOU ARE
Name: ${persona.name}
Age: ${persona.age}
Occupation: ${persona.occupation}
Why you came in: ${persona.chief_complaint}
Personality: ${persona.personality}
How you disclose: ${persona.disclosure_style}

WHAT YOU KNOW ABOUT YOURSELF (reveal only when asked)
Onset: ${hidden.onset}
Symptoms: ${(hidden.symptoms || []).join(', ')}
Duration: ${hidden.duration}
Effect on daily life: ${hidden.functional_impact}
Family history: ${hidden.family_history}
Medical history: ${hidden.medical_history}
Current medications: ${hidden.current_medications}
What helps: ${hidden.what_helps}

You will NOT bring these up on your own. They only come out if you are asked a
direct or nearly direct question about them: ${wontVolunteer}
${followUpContext ? `\nSINCE YOUR LAST VISIT\n${followUpContext}\n` : ''}
${EXCLUSIONS_BLOCK}

${SAFETY_SCREEN_RULE}

HOW YOU SPEAK
- Speak only as ${persona.name}. Never narrate, never describe actions, never use
  asterisks, never break character.
- One to four sentences. Plain everyday language. No clinical jargon — you say
  "I can't shut my brain off", not "I experience ruminative cognition".
- Answer what you were asked. Do not deliver a monologue or list your symptoms
  unprompted.
- Never diagnose yourself, never name a medication, never suggest a treatment.
  If asked what you think you have, say you don't know — that's why you came.
- Stay warm and cooperative. You are never hostile and you never walk out.
- If the student says something confusing or off-topic, respond the way a polite
  person would and gently steer back to how you've been feeling.${extraWarning ? `\n\n${extraWarning}` : ''}`;
}

const REGENERATION_WARNING = `REMINDER: your previous attempt broke the absolute
content rules. Rewrite your reply so it contains none of the forbidden topics.
Keep it short, plain, and ordinary.`;

/** Transcript entries -> Messages API turns. */
function toMessages(transcript) {
  return transcript.map((entry) => ({
    role: entry.role === 'clinician' ? 'user' : 'assistant',
    content: entry.text,
  }));
}

/**
 * Produce the patient's next line.
 *
 * `thinking: disabled` is deliberate — Claude Sonnet 5 runs adaptive thinking by
 * default and max_tokens caps thinking plus text together, so a 400-token
 * budget with thinking on would truncate the reply mid-sentence.
 */
export async function patientReply({ env, db, profileId, persona, transcript, followUpContext }) {
  const client = makeClient(env);
  const messages = toMessages(transcript);

  const call = async (extraWarning) => {
    const response = await client.messages.create({
      model: MODEL_CONVERSATION,
      max_tokens: MAX_TOKENS_PATIENT_TURN,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: buildSystem(persona, followUpContext, extraWarning),
      messages,
    });
    if (response.stop_reason === 'refusal') return SAFE_FALLBACK_LINE;
    return textOf(response);
  };

  const { text } = await generateFiltered({
    generate: () => call(null),
    regenerate: () => call(REGENERATION_WARNING),
    fallback: SAFE_FALLBACK_LINE,
    db,
    profileId,
  });

  return text;
}
