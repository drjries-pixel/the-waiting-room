import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Score from '../components/Score.jsx';

const DIMENSION_LABELS = {
  warmth: 'Warmth & Rapport',
  open_questions: 'Open-Ended Questions',
  gathering: 'Gathering the Story',
  safety: 'Safety & Screening',
  explaining: 'Explaining Things Kindly',
  documentation: 'Documentation',
};

const SECTIONS = [
  ['subjective', 'Subjective', 'What they told you'],
  ['objective', 'Objective', 'What you could observe'],
  ['assessment', 'Assessment', 'What you make of it'],
  ['plan', 'Plan', 'What happens next'],
];

export default function VisitSummary({ visitId, onDone }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getVisit(visitId)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [visitId]);

  if (error) return <p className="p-6 text-warn">{error}</p>;
  if (!data) return <p className="p-6 text-muted">Writing up the visit…</p>;

  const { visit, patient } = data;
  const soap = visit.soap;
  const score = visit.score;

  return (
    <div className="min-h-dvh bg-paper pb-16">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Avatar seed={patient.avatar_seed} size={40} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-base leading-tight">
              {patient.name} · visit {visit.visit_number}
            </h1>
            <p className="text-xs text-muted">
              {visit.finished_at ? new Date(visit.finished_at).toLocaleDateString() : 'in progress'}
            </p>
          </div>
          <button
            type="button"
            onClick={onDone}
            className="rounded-full bg-sage px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sage-deep"
          >
            Back
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {/* ---------------- feedback first: she should read this ---------------- */}
        {score && (
          <section className="rise rounded-2xl border border-line bg-card p-5">
            <h2 className="mb-4 font-serif text-xl">How it went</h2>

            <div className="mb-5 space-y-2.5">
              {Object.entries(score.scores ?? {}).map(([key, value]) => (
                <div key={key} className="flex items-baseline gap-3">
                  <span className="w-44 shrink-0 text-sm">{DIMENSION_LABELS[key] ?? key}</span>
                  <Score value={value.score} />
                  <span className="min-w-0 flex-1 text-sm text-muted">{value.note}</span>
                </div>
              ))}
            </div>

            <div className="mb-4 rounded-xl bg-sage-soft p-4">
              <h3 className="mb-2 font-medium">🌟 What you did really well</h3>
              <ul className="space-y-2">
                {(score.did_well ?? []).map((item, i) => (
                  <li key={i} className="text-sm leading-relaxed">
                    {item.quote && <span className="italic">"{item.quote}" — </span>}
                    {item.why}
                  </li>
                ))}
              </ul>
            </div>

            {score.growth && (
              <div className="mb-4 rounded-xl bg-dusty-soft p-4">
                <h3 className="mb-1.5 font-medium">🌱 One thing to try next time</h3>
                <p className="mb-2 text-sm leading-relaxed">{score.growth.area}</p>
                <p className="text-sm italic text-dusty">{score.growth.example_sentence}</p>
              </div>
            )}

            {score.trend_note && (
              <p className="text-sm text-muted">
                <span aria-hidden="true">📈 </span>
                {score.trend_note}
              </p>
            )}
          </section>
        )}

        {/* ---------------- the note ---------------- */}
        {soap && (
          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="mb-1 font-serif text-xl">Your note</h2>
            <p className="mb-4 text-sm text-muted">
              Every line here came from something you actually asked.
            </p>

            {SECTIONS.map(([key, label, hint]) => {
              const annotations = (soap.annotations ?? []).filter((a) => a.section === key);
              return (
                <div key={key} className="mb-5 last:mb-0">
                  <h3 className="font-serif text-base">{label}</h3>
                  <p className="mb-1.5 text-xs uppercase tracking-wide text-muted">{hint}</p>
                  <p className="leading-relaxed">{soap[key]}</p>
                  {annotations.length > 0 && (
                    <ul className="mt-2 space-y-1 border-l-2 border-sage-soft pl-3">
                      {annotations.map((a, i) => (
                        <li key={i} className="text-xs leading-relaxed text-muted">
                          <span className="text-ink">{a.text}</span> — {a.source}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* ---------------- gaps: invitations, never failures ---------------- */}
        {soap?.gaps?.length > 0 && (
          <section className="rounded-2xl border border-line bg-card p-5">
            <h2 className="mb-1 font-serif text-xl">What you'd learn by asking</h2>
            <p className="mb-4 text-sm text-muted">
              {patient.first_name} knew these things and was waiting to be asked.
            </p>
            <ul className="space-y-4">
              {soap.gaps.map((gap, i) => (
                <li key={i} className="border-l-2 border-dusty pl-3">
                  <p className="font-medium">{gap.missed}</p>
                  <p className="text-sm text-muted">{gap.why_it_matters}</p>
                  <p className="mt-1 text-sm italic text-dusty">Try asking: {gap.try_asking}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------------- transcript, collapsed ---------------- */}
        <details className="rounded-2xl border border-line bg-card p-5">
          <summary className="cursor-pointer font-serif text-lg">Read the whole conversation</summary>
          <div className="mt-4 space-y-2">
            {visit.transcript.map((t, i) => (
              <p key={i} className="text-sm leading-relaxed">
                <span className={t.role === 'clinician' ? 'text-sage-deep' : 'text-muted'}>
                  {t.role === 'clinician' ? 'You' : patient.first_name}:
                </span>{' '}
                {t.text}
              </p>
            ))}
          </div>
          {visit.side_notes?.trim() && (
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="mb-1 font-medium">Your notes during the visit</h3>
              <p className="whitespace-pre-wrap text-sm text-muted">{visit.side_notes}</p>
            </div>
          )}
        </details>

        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-xl bg-sage px-5 py-3 font-medium text-white transition-colors hover:bg-sage-deep"
        >
          Back to the waiting room
        </button>
      </main>
    </div>
  );
}
