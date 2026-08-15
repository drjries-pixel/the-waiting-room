/**
 * Every call here is same-origin and relies on the httpOnly session cookie.
 * There is no API key on this side of the wire and there never will be.
 */

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }

  if (!res.ok) {
    const err = new Error(data?.message ?? 'Something went wrong.');
    err.code = data?.error ?? 'unknown';
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  me: () => request('/api/me'),
  login: (profileId, passcode) =>
    request('/api/login', { method: 'POST', body: { profile_id: profileId, passcode } }),
  logout: () => request('/api/logout', { method: 'POST' }),

  waitingRoom: () => request('/api/waiting-room'),
  regenerate: () => request('/api/waiting-room/generate', { method: 'POST' }),

  startVisit: (patientId) =>
    request('/api/visit/start', { method: 'POST', body: { patient_id: patientId } }),
  sendMessage: (visitId, text) =>
    request(`/api/visit/${visitId}/message`, { method: 'POST', body: { text } }),
  saveNotes: (visitId, sideNotes) =>
    request(`/api/visit/${visitId}/notes`, { method: 'PATCH', body: { side_notes: sideNotes } }),
  finishVisit: (visitId) => request(`/api/visit/${visitId}/finish`, { method: 'POST' }),
  getVisit: (visitId) => request(`/api/visit/${visitId}`),

  followUps: () => request('/api/followups'),
  progress: () => request('/api/progress'),
  completeLesson: (key, quizScore) =>
    request(`/api/lessons/${key}/complete`, { method: 'POST', body: { quiz_score: quizScore } }),
};
