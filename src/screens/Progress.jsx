import { useEffect, useState } from 'react';
import { api } from '../api.js';
import lessonContent from '../content/lessons.json';

const CONDITION_LABELS = {
  gad: 'Generalized Anxiety',
  mdd_mild: 'Depression',
  insomnia: 'Insomnia',
  adhd_inattentive: 'ADHD',
  phobia_flying: 'Specific Phobia',
};

/** A calm little line chart. No axes shouting numbers at anyone. */
function TrendLine({ history }) {
  if (history.length < 2) return null;

  const width = 320;
  const height = 90;
  const pad = 8;
  const totals = history.map((h) => h.total ?? 18);
  const min = 18;
  const max = 30;

  const points = totals.map((t, i) => {
    const x = pad + (i / (totals.length - 1)) * (width - pad * 2);
    const y = height - pad - ((t - min) / (max - min)) * (height - pad * 2);
    return [x, y];
  });

  const path = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-sm"
      role="img"
      aria-label={`Score trend across ${history.length} visits`}
    >
      <path d={path} fill="none" stroke="#7C9A82" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill="#55755C" />
      ))}
    </svg>
  );
}

function Stat({ value, label }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-3 text-center">
      <div className="font-serif text-2xl">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

export default function Progress({ onOpenVisit }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .progress()
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-warn">{error}</p>;
  if (!data) return <p className="text-muted">Adding it up…</p>;

  const lessonsDone = data.lessons.filter((l) => l.completed_at).length;

  if (data.visits_completed === 0) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-line p-8 text-center">
        <div className="mb-3 text-3xl">🌿</div>
        <h2 className="mb-2 font-serif text-lg">Nothing to show yet</h2>
        <p className="text-muted">Finish your first visit and your progress will start filling in here.</p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={data.visits_completed} label="visits finished" />
        <Stat value={data.conditions_seen.length} label="conditions seen" />
        <Stat value={`${lessonsDone}/${lessonContent.lessons.length}`} label="lessons done" />
        <Stat value={`Tier ${data.tier}`} label="current tier" />
      </div>

      {data.history.length >= 2 && (
        <section className="mb-6 rounded-2xl border border-line bg-card p-5">
          <h2 className="mb-1 font-serif text-lg">How you're trending</h2>
          <p className="mb-3 text-sm text-muted">Each dot is a finished visit.</p>
          <TrendLine history={data.history} />
        </section>
      )}

      <section className="mb-6 rounded-2xl border border-line bg-card p-5">
        <h2 className="mb-3 font-serif text-lg">Conditions you've seen</h2>
        <div className="flex flex-wrap gap-2">
          {data.conditions_seen.map((key) => (
            <span key={key} className="rounded-full bg-sage-soft px-3 py-1 text-sm text-sage-deep">
              {CONDITION_LABELS[key] ?? key}
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-card p-5">
        <h2 className="mb-3 font-serif text-lg">Your visits</h2>
        <ul className="divide-y divide-line">
          {[...data.history].reverse().map((h) => (
            <li key={h.visit_id}>
              <button
                type="button"
                onClick={() => onOpenVisit(h.visit_id)}
                className="flex w-full items-center gap-3 py-3 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{h.patient_name}</span>
                  <span className="block text-xs text-muted">
                    {h.finished_at ? new Date(h.finished_at).toLocaleDateString() : ''} ·{' '}
                    {CONDITION_LABELS[h.condition_key] ?? h.condition_key}
                  </span>
                </span>
                <span className="shrink-0 font-serif text-lg text-sage-deep">{h.total ?? '—'}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
