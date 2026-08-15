import { json, fail, readJson } from './lib/http.js';
import {
  COOKIE_NAME,
  clearCookie,
  issueToken,
  readCookie,
  sessionCookie,
  verifyPasscode,
  verifyToken,
} from './lib/auth.js';
import { getPatient, getProfile, listRoomPatients, newId, nowIso, openVisitFor } from './lib/db.js';
import { MAX_TURNS_PER_VISIT, consumeTurn, pruneRateLimits } from './lib/rateLimit.js';
import { TIER_1_PATIENTS } from './data/patients.js';
import { patientReply } from './ai/patientTurn.js';
import { generateSoap } from './ai/soap.js';
import { DIMENSIONS, gradeVisit } from './ai/grader.js';
import { notifyParent, screenInput } from './ai/inputGuard.js';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Public shape of a patient — the persona's hidden history never leaves here. */
function publicPatient(row) {
  const persona = JSON.parse(row.persona_json);
  return {
    id: row.id,
    name: persona.name,
    first_name: persona.name.split(' ')[0],
    age: persona.age,
    occupation: persona.occupation,
    avatar_seed: persona.avatar_seed,
    chief_complaint: persona.chief_complaint,
    state: row.state,
    next_visit_at: row.next_visit_at,
  };
}

async function seedWaitingRoom(db, profileId) {
  const created = nowIso();
  const statements = TIER_1_PATIENTS.map((persona) =>
    db
      .prepare(
        `INSERT INTO patient
           (id, profile_id, name, age, occupation, avatar_seed, condition_key, tier, persona_json, state, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?)`,
      )
      .bind(
        newId('pat'),
        profileId,
        persona.name,
        persona.age,
        persona.occupation,
        persona.avatar_seed,
        persona.condition_key,
        persona.tier,
        JSON.stringify(persona),
        created,
      ),
  );
  await db.batch(statements);
}

/** Load a visit and confirm it belongs to this profile. */
async function loadVisit(db, visitId, profileId) {
  const row = await db
    .prepare(
      `SELECT v.*, p.profile_id, p.persona_json, p.id AS patient_id_check
         FROM visit v JOIN patient p ON p.id = v.patient_id
        WHERE v.id = ?`,
    )
    .bind(visitId)
    .first();
  if (!row || row.profile_id !== profileId) return null;
  return row;
}

/**
 * The "since your last visit" block for a follow-up. Derived deterministically
 * from how the previous visit scored — a good visit leaves the patient a little
 * better, which is both true to life and quietly encouraging.
 */
function buildFollowUpContext(persona, previousVisit) {
  if (!previousVisit?.score_json) return null;
  try {
    const score = JSON.parse(previousVisit.score_json);
    const improved = (score.total ?? 0) >= 22;
    return improved ? persona.followup.improved : persona.followup.unchanged;
  } catch {
    return persona.followup.unchanged;
  }
}

/* ------------------------------------------------------------------ */
/* routes                                                              */
/* ------------------------------------------------------------------ */

async function handleLogin(request, env) {
  const body = await readJson(request);
  if (!body?.profile_id || !body?.passcode) return fail(400, 'bad_request', 'Missing name or passcode.');

  const profile = await getProfile(env.DB, String(body.profile_id).toLowerCase().trim());
  // Same message either way — never confirm which half was wrong.
  const generic = fail(401, 'bad_credentials', "That name and passcode don't match.");
  if (!profile) return generic;

  const ok = await verifyPasscode(String(body.passcode), profile.passcode_hash);
  if (!ok) return generic;

  const token = await issueToken(env.SESSION_SECRET, profile.id);
  return json(
    { profile: { id: profile.id, display_name: profile.display_name, tier: profile.tier } },
    { headers: { 'set-cookie': sessionCookie(token) } },
  );
}

async function handleWaitingRoom(env, profileId) {
  let patients = await listRoomPatients(env.DB, profileId, 'waiting');
  const anyEver = await env.DB
    .prepare('SELECT COUNT(*) AS n FROM patient WHERE profile_id = ?')
    .bind(profileId)
    .first();

  // First ever load: fill the room so she never opens an empty app.
  if (patients.length === 0 && (anyEver?.n ?? 0) === 0) {
    await seedWaitingRoom(env.DB, profileId);
    patients = await listRoomPatients(env.DB, profileId, 'waiting');
  }

  return json({ patients: patients.map(publicPatient) });
}

async function handleGenerate(env, profileId) {
  const waiting = await listRoomPatients(env.DB, profileId, 'waiting');
  if (waiting.length > 0) {
    return fail(400, 'room_not_empty', 'There are still patients waiting to be seen.');
  }
  await seedWaitingRoom(env.DB, profileId);
  const patients = await listRoomPatients(env.DB, profileId, 'waiting');
  return json({ patients: patients.map(publicPatient) });
}

async function handleVisitStart(request, env, profileId) {
  const body = await readJson(request);
  if (!body?.patient_id) return fail(400, 'bad_request', 'Missing patient_id.');

  const patient = await getPatient(env.DB, body.patient_id, profileId);
  if (!patient) return fail(404, 'not_found', 'No such patient.');
  if (!['waiting', 'followup', 'active'].includes(patient.state)) {
    return fail(400, 'unavailable', 'That patient is not ready to be seen.');
  }

  const persona = JSON.parse(patient.persona_json);

  // Resume rather than restart: she closed the tab mid-visit and came back.
  if (patient.state === 'active') {
    const open = await openVisitFor(env.DB, patient.id);
    if (open) {
      const existing = JSON.parse(open.transcript);
      return json({
        visit: {
          id: open.id,
          visit_number: open.visit_number,
          transcript: existing,
          side_notes: open.side_notes ?? '',
          turns_used: existing.filter((t) => t.role === 'clinician').length,
          turns_allowed: MAX_TURNS_PER_VISIT,
        },
        patient: publicPatient(patient),
        resumed: true,
      });
    }
  }

  const prior = await env.DB
    .prepare('SELECT * FROM visit WHERE patient_id = ? ORDER BY visit_number DESC LIMIT 1')
    .bind(patient.id)
    .first();
  const visitNumber = (prior?.visit_number ?? 0) + 1;
  const followUp = visitNumber > 1 ? buildFollowUpContext(persona, prior) : null;

  const opening =
    visitNumber === 1
      ? persona.opening_line
      : `Hi again. ${followUp ? 'Thanks for having me back.' : ''}`.trim();

  const visitId = newId('vis');
  const transcript = [{ role: 'patient', text: opening, ts: nowIso() }];

  await env.DB.batch([
    env.DB
      .prepare(
        'INSERT INTO visit (id, patient_id, visit_number, transcript, side_notes, started_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .bind(visitId, patient.id, visitNumber, JSON.stringify(transcript), '', nowIso()),
    env.DB.prepare("UPDATE patient SET state = 'active' WHERE id = ?").bind(patient.id),
  ]);

  return json({
    visit: {
      id: visitId,
      visit_number: visitNumber,
      transcript,
      side_notes: '',
      turns_used: 0,
      turns_allowed: MAX_TURNS_PER_VISIT,
    },
    patient: publicPatient(patient),
  });
}

async function handleVisitMessage(request, env, profileId, visitId) {
  const body = await readJson(request);
  const text = String(body?.text ?? '').trim();
  if (!text) return fail(400, 'bad_request', 'Empty message.');
  if (text.length > 2000) return fail(400, 'too_long', 'That message is too long.');

  const visit = await loadVisit(env.DB, visitId, profileId);
  if (!visit) return fail(404, 'not_found', 'No such visit.');
  if (visit.finished_at) return fail(400, 'finished', 'This visit is already finished.');

  const transcript = JSON.parse(visit.transcript);
  const turnsUsed = transcript.filter((t) => t.role === 'clinician').length;
  if (turnsUsed >= MAX_TURNS_PER_VISIT) {
    return fail(429, 'turn_cap', 'This visit has reached its length. Time to wrap up and write the note.');
  }

  // --- safety gate: input side, before anything is sent to the patient model ---
  const verdict = await screenInput(env, env.DB, profileId, text);
  if (verdict === 'pause') {
    await notifyParent(env, nowIso());
    return json({ paused: true });
  }
  if (verdict === 'retry') {
    return fail(503, 'retry', "Something hiccuped on our end. Could you send that again?");
  }

  // --- rate limit ---
  const limit = await consumeTurn(env.DB, profileId);
  if (!limit.ok) {
    return fail(
      429,
      'rate_limited',
      'You have been busy! Give it a couple of minutes before the next question.',
    );
  }

  const persona = JSON.parse(visit.persona_json);
  const prior =
    visit.visit_number > 1
      ? await env.DB
          .prepare('SELECT * FROM visit WHERE patient_id = ? AND visit_number = ? LIMIT 1')
          .bind(visit.patient_id, visit.visit_number - 1)
          .first()
      : null;

  transcript.push({ role: 'clinician', text, ts: nowIso() });

  let reply;
  try {
    reply = await patientReply({
      env,
      db: env.DB,
      profileId,
      persona,
      transcript,
      followUpContext: prior ? buildFollowUpContext(persona, prior) : null,
    });
  } catch {
    return fail(503, 'model_unavailable', "The patient didn't respond. Try that again in a moment.");
  }

  transcript.push({ role: 'patient', text: reply, ts: nowIso() });

  await env.DB
    .prepare('UPDATE visit SET transcript = ? WHERE id = ?')
    .bind(JSON.stringify(transcript), visitId)
    .run();

  return json({
    reply,
    turns_used: turnsUsed + 1,
    turns_allowed: MAX_TURNS_PER_VISIT,
  });
}

async function handleNotes(request, env, profileId, visitId) {
  const body = await readJson(request);
  const notes = String(body?.side_notes ?? '');
  if (notes.length > 20000) return fail(400, 'too_long', 'Those notes are very long.');

  const visit = await loadVisit(env.DB, visitId, profileId);
  if (!visit) return fail(404, 'not_found', 'No such visit.');
  if (visit.finished_at) return fail(400, 'finished', 'This visit is already finished.');

  await env.DB.prepare('UPDATE visit SET side_notes = ? WHERE id = ?').bind(notes, visitId).run();
  return json({ saved: true });
}

async function handleFinish(env, profileId, visitId) {
  const visit = await loadVisit(env.DB, visitId, profileId);
  if (!visit) return fail(404, 'not_found', 'No such visit.');
  if (visit.finished_at) {
    return json({
      soap: JSON.parse(visit.soap_json),
      score: JSON.parse(visit.score_json),
      already_finished: true,
    });
  }

  const transcript = JSON.parse(visit.transcript);
  if (transcript.filter((t) => t.role === 'clinician').length === 0) {
    return fail(400, 'empty_visit', 'Ask the patient at least one question first.');
  }

  const persona = JSON.parse(visit.persona_json);

  const { results: historyRows } = await env.DB
    .prepare(
      `SELECT v.score_json, v.finished_at FROM visit v
         JOIN patient p ON p.id = v.patient_id
        WHERE p.profile_id = ? AND v.finished_at IS NOT NULL
        ORDER BY v.finished_at DESC LIMIT 3`,
    )
    .bind(profileId)
    .all();

  const history = (historyRows ?? [])
    .map((r) => {
      try {
        return { total: JSON.parse(r.score_json).total, finished_at: r.finished_at };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const soap = await generateSoap({
    env,
    db: env.DB,
    profileId,
    persona,
    transcript,
    sideNotes: visit.side_notes,
    visitNumber: visit.visit_number,
  });

  const score = await gradeVisit({
    env,
    db: env.DB,
    profileId,
    persona,
    transcript,
    sideNotes: visit.side_notes,
    soap,
    history,
  });

  // Visit 1 sends them to the follow-up tab; visit 2 discharges them warmly.
  const nextState = visit.visit_number >= 2 ? 'discharged' : 'followup';
  const nextVisitAt =
    nextState === 'followup' ? new Date(Date.now() + 21 * 86400 * 1000).toISOString() : null;

  await env.DB.batch([
    env.DB
      .prepare('UPDATE visit SET soap_json = ?, score_json = ?, finished_at = ? WHERE id = ?')
      .bind(JSON.stringify(soap), JSON.stringify(score), nowIso(), visitId),
    env.DB
      .prepare('UPDATE patient SET state = ?, next_visit_at = ? WHERE id = ?')
      .bind(nextState, nextVisitAt, visit.patient_id),
  ]);

  return json({ soap, score, patient_state: nextState });
}

async function handleGetVisit(env, profileId, visitId) {
  const visit = await loadVisit(env.DB, visitId, profileId);
  if (!visit) return fail(404, 'not_found', 'No such visit.');
  const persona = JSON.parse(visit.persona_json);
  return json({
    visit: {
      id: visit.id,
      visit_number: visit.visit_number,
      transcript: JSON.parse(visit.transcript),
      side_notes: visit.side_notes ?? '',
      soap: visit.soap_json ? JSON.parse(visit.soap_json) : null,
      score: visit.score_json ? JSON.parse(visit.score_json) : null,
      started_at: visit.started_at,
      finished_at: visit.finished_at,
    },
    patient: {
      name: persona.name,
      first_name: persona.name.split(' ')[0],
      age: persona.age,
      occupation: persona.occupation,
      avatar_seed: persona.avatar_seed,
      chief_complaint: persona.chief_complaint,
    },
  });
}

async function handleFollowUps(env, profileId) {
  const rows = await listRoomPatients(env.DB, profileId, 'followup');
  const out = [];
  for (const row of rows) {
    const last = await env.DB
      .prepare(
        'SELECT visit_number, finished_at, score_json FROM visit WHERE patient_id = ? AND finished_at IS NOT NULL ORDER BY visit_number DESC LIMIT 1',
      )
      .bind(row.id)
      .first();
    out.push({
      ...publicPatient(row),
      last_visit_at: last?.finished_at ?? null,
      last_visit_number: last?.visit_number ?? null,
    });
  }
  return json({ patients: out });
}

async function handleProgress(env, profileId) {
  const { results: visits } = await env.DB
    .prepare(
      `SELECT v.id, v.visit_number, v.finished_at, v.score_json, p.condition_key, p.name
         FROM visit v JOIN patient p ON p.id = v.patient_id
        WHERE p.profile_id = ? AND v.finished_at IS NOT NULL
        ORDER BY v.finished_at ASC`,
    )
    .bind(profileId)
    .all();

  const history = (visits ?? []).map((v) => {
    let score = null;
    try {
      score = JSON.parse(v.score_json);
    } catch {
      /* ignore */
    }
    return {
      visit_id: v.id,
      patient_name: v.name,
      condition_key: v.condition_key,
      finished_at: v.finished_at,
      total: score?.total ?? null,
      scores: score?.scores ?? null,
    };
  });

  const { results: lessons } = await env.DB
    .prepare('SELECT lesson_key, completed_at, quiz_score FROM lesson_progress WHERE profile_id = ?')
    .bind(profileId)
    .all();

  const profile = await getProfile(env.DB, profileId);

  return json({
    tier: profile?.tier ?? 1,
    visits_completed: history.length,
    conditions_seen: [...new Set(history.map((h) => h.condition_key))],
    history,
    dimensions: DIMENSIONS,
    lessons: lessons ?? [],
  });
}

async function handleLessonComplete(request, env, profileId, lessonKey) {
  const body = await readJson(request);
  const quizScore = Number.isInteger(body?.quiz_score) ? body.quiz_score : null;
  await env.DB
    .prepare(
      `INSERT INTO lesson_progress (profile_id, lesson_key, completed_at, quiz_score)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(profile_id, lesson_key)
       DO UPDATE SET completed_at = excluded.completed_at,
                     quiz_score = MAX(COALESCE(lesson_progress.quiz_score, 0), COALESCE(excluded.quiz_score, 0))`,
    )
    .bind(profileId, lessonKey, nowIso(), quizScore)
    .run();
  return json({ saved: true });
}

/* ------------------------------------------------------------------ */
/* entry point                                                         */
/* ------------------------------------------------------------------ */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    if (!env.SESSION_SECRET) {
      return fail(500, 'misconfigured', 'This app is not finished being set up.');
    }

    const path = url.pathname;
    const method = request.method;

    try {
      if (path === '/api/login' && method === 'POST') return await handleLogin(request, env);

      if (path === '/api/logout' && method === 'POST') {
        return json({ ok: true }, { headers: { 'set-cookie': clearCookie() } });
      }

      // Everything past this line requires a valid session. Fail closed.
      const profileId = await verifyToken(env.SESSION_SECRET, readCookie(request, COOKIE_NAME));
      if (!profileId) return fail(401, 'unauthorized', 'Please log in.');

      if (path === '/api/me' && method === 'GET') {
        const profile = await getProfile(env.DB, profileId);
        if (!profile) return fail(401, 'unauthorized', 'Please log in.');
        return json({ profile: { id: profile.id, display_name: profile.display_name, tier: profile.tier } });
      }

      if (path === '/api/waiting-room' && method === 'GET') return await handleWaitingRoom(env, profileId);
      if (path === '/api/waiting-room/generate' && method === 'POST') {
        return await handleGenerate(env, profileId);
      }
      if (path === '/api/visit/start' && method === 'POST') {
        return await handleVisitStart(request, env, profileId);
      }
      if (path === '/api/followups' && method === 'GET') return await handleFollowUps(env, profileId);
      if (path === '/api/progress' && method === 'GET') return await handleProgress(env, profileId);

      const lessonMatch = path.match(/^\/api\/lessons\/([\w-]+)\/complete$/);
      if (lessonMatch && method === 'POST') {
        return await handleLessonComplete(request, env, profileId, lessonMatch[1]);
      }

      const visitMatch = path.match(/^\/api\/visit\/([\w]+)(?:\/(message|notes|finish))?$/);
      if (visitMatch) {
        const [, visitId, action] = visitMatch;
        if (!action && method === 'GET') return await handleGetVisit(env, profileId, visitId);
        if (action === 'message' && method === 'POST') {
          ctx.waitUntil(pruneRateLimits(env.DB));
          return await handleVisitMessage(request, env, profileId, visitId);
        }
        if (action === 'notes' && method === 'PATCH') {
          return await handleNotes(request, env, profileId, visitId);
        }
        if (action === 'finish' && method === 'POST') {
          return await handleFinish(env, profileId, visitId);
        }
      }

      return fail(404, 'not_found', 'No such endpoint.');
    } catch (err) {
      console.error('unhandled', err?.stack ?? String(err));
      return fail(500, 'server_error', 'Something went wrong on our end.');
    }
  },
};
