-- The Waiting Room — D1 schema
-- Single-user for now, modeled for additional profiles later.
-- No PHI. Every patient in this database is fabricated.

CREATE TABLE IF NOT EXISTS profile (
  id            TEXT PRIMARY KEY,            -- e.g. 'learner'
  display_name  TEXT NOT NULL,
  passcode_hash TEXT NOT NULL,               -- PBKDF2-SHA256, never plaintext
  tier          INTEGER NOT NULL DEFAULT 1,  -- current difficulty tier 1-3
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS patient (
  id            TEXT PRIMARY KEY,
  profile_id    TEXT NOT NULL,
  name          TEXT NOT NULL,
  age           INTEGER NOT NULL,
  occupation    TEXT,
  avatar_seed   TEXT,
  condition_key TEXT NOT NULL,
  tier          INTEGER NOT NULL,
  persona_json  TEXT NOT NULL,               -- full persona (see §6.1)
  state         TEXT NOT NULL,               -- waiting | active | followup | discharged
  next_visit_at TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_patient_profile_state ON patient (profile_id, state);

CREATE TABLE IF NOT EXISTS visit (
  id            TEXT PRIMARY KEY,
  patient_id    TEXT NOT NULL,
  visit_number  INTEGER NOT NULL,            -- 1 = initial, 2+ = follow-up
  transcript    TEXT NOT NULL,               -- JSON [{role, text, ts}]
  side_notes    TEXT,
  soap_json     TEXT,
  score_json    TEXT,
  started_at    TEXT NOT NULL,
  finished_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_visit_patient ON visit (patient_id);

CREATE TABLE IF NOT EXISTS lesson_progress (
  profile_id    TEXT NOT NULL,
  lesson_key    TEXT NOT NULL,
  completed_at  TEXT,
  quiz_score    INTEGER,
  PRIMARY KEY (profile_id, lesson_key)
);

CREATE TABLE IF NOT EXISTS rate_limit (
  key           TEXT PRIMARY KEY,            -- profile_id + window
  count         INTEGER NOT NULL,
  window_start  TEXT NOT NULL
);

-- Safety telemetry. Content is NEVER stored here — only the fact that a guard
-- fired, so a parent can see the shape of things without reading the child's words.
CREATE TABLE IF NOT EXISTS safety_event (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,                 -- output_filter | input_pause | classifier_error
  detail      TEXT,                          -- category label only, no free text
  created_at  TEXT NOT NULL
);
