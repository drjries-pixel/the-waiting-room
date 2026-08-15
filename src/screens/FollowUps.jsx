import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';

export default function FollowUps({ onStart }) {
  const [patients, setPatients] = useState(null);
  const [error, setError] = useState(null);
  const [startingId, setStartingId] = useState(null);

  useEffect(() => {
    api
      .followUps()
      .then((d) => setPatients(d.patients))
      .catch((e) => setError(e.message));
  }, []);

  async function see(patient) {
    setStartingId(patient.id);
    setError(null);
    try {
      const session = await api.startVisit(patient.id);
      onStart(session);
    } catch (e) {
      setError(e.message);
      setStartingId(null);
    }
  }

  if (error && !patients) return <p className="text-warn">{error}</p>;
  if (!patients) return <p className="text-muted">Checking the calendar…</p>;

  if (patients.length === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-line p-8 text-center">
        <div className="mb-3 text-3xl">📅</div>
        <h2 className="mb-2 font-serif text-lg">Nobody's due back yet</h2>
        <p className="text-muted">
          Finish a first visit and that patient will show up here for a follow-up.
        </p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 text-muted">
        These patients came back to see how things are going since last time.
      </p>

      {error && (
        <p role="alert" className="mb-4 rounded-lg border border-line bg-card px-3 py-2 text-sm text-warn">
          {error}
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {patients.map((p) => (
          <li key={p.id} className="rise rounded-2xl border border-line bg-card p-4">
            <div className="flex items-start gap-3">
              <Avatar seed={p.avatar_seed} size={52} />
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-lg leading-tight">{p.first_name}</h2>
                <p className="text-sm text-muted">
                  {p.age} · {p.occupation}
                </p>
                <p className="mt-1.5 text-sm text-muted">
                  Last seen{' '}
                  {p.last_visit_at ? new Date(p.last_visit_at).toLocaleDateString() : 'recently'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => see(p)}
              disabled={startingId === p.id}
              className="mt-4 w-full rounded-xl border border-sage bg-sage-soft px-4 py-2.5 font-medium text-sage-deep transition-colors hover:bg-sage hover:text-white disabled:opacity-60"
            >
              {startingId === p.id ? 'Bringing them in…' : `See ${p.first_name} again`}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
