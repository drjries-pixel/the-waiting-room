export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export async function getProfile(db, profileId) {
  return db.prepare('SELECT * FROM profile WHERE id = ?').bind(profileId).first();
}

export async function getPatient(db, patientId, profileId) {
  return db
    .prepare('SELECT * FROM patient WHERE id = ? AND profile_id = ?')
    .bind(patientId, profileId)
    .first();
}

export async function listPatients(db, profileId, state) {
  const { results } = await db
    .prepare('SELECT * FROM patient WHERE profile_id = ? AND state = ? ORDER BY created_at')
    .bind(profileId, state)
    .all();
  return results ?? [];
}

/**
 * Patients to show in a room. A patient left in 'active' — she closed the tab
 * mid-visit — belongs back in whichever room she found them in, so nobody ever
 * gets stranded in a state with no door out of it. Whether that's the waiting
 * room or the follow-up list depends on whether they've ever been seen through.
 */
export async function listRoomPatients(db, profileId, room) {
  const seenBefore = `EXISTS (SELECT 1 FROM visit v WHERE v.patient_id = p.id AND v.finished_at IS NOT NULL)`;
  const clause =
    room === 'followup'
      ? `p.state = 'followup' OR (p.state = 'active' AND ${seenBefore})`
      : `p.state = 'waiting' OR (p.state = 'active' AND NOT ${seenBefore})`;

  const { results } = await db
    .prepare(`SELECT p.* FROM patient p WHERE p.profile_id = ? AND (${clause}) ORDER BY p.created_at`)
    .bind(profileId)
    .all();
  return results ?? [];
}

/** An unfinished visit for this patient, if one was left open. */
export async function openVisitFor(db, patientId) {
  return db
    .prepare('SELECT * FROM visit WHERE patient_id = ? AND finished_at IS NULL ORDER BY visit_number DESC LIMIT 1')
    .bind(patientId)
    .first();
}

export async function getVisit(db, visitId) {
  return db.prepare('SELECT * FROM visit WHERE id = ?').bind(visitId).first();
}

/**
 * Safety telemetry. Stores the fact and the category label — never the text
 * that triggered it. There is no scenario in which reading a child's typed
 * words out of a database is the right call.
 */
export async function logSafetyEvent(db, profileId, kind, detail) {
  try {
    await db
      .prepare('INSERT INTO safety_event (id, profile_id, kind, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(newId('sfe'), profileId, kind, detail ?? null, nowIso())
      .run();
  } catch {
    // Telemetry must never break a visit.
  }
}
