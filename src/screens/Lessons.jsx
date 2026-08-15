import { useEffect, useState } from 'react';
import { api } from '../api.js';
import content from '../content/lessons.json';

function Quiz({ lesson, onComplete }) {
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);

  const correct = lesson.quiz.filter((q, i) => answers[i] === q.answer).length;

  return (
    <div className="mt-5 rounded-xl border border-line bg-paper p-4">
      <h4 className="mb-3 font-medium">Quick check</h4>
      {lesson.quiz.map((q, i) => (
        <fieldset key={i} className="mb-4 last:mb-0">
          <legend className="mb-1.5 text-sm font-medium">{q.q}</legend>
          <div className="space-y-1">
            {q.options.map((opt, j) => {
              const picked = answers[i] === j;
              const isRight = checked && j === q.answer;
              const isWrongPick = checked && picked && j !== q.answer;
              return (
                <label
                  key={j}
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    isRight
                      ? 'border-sage bg-sage-soft'
                      : isWrongPick
                        ? 'border-line bg-card text-muted'
                        : picked
                          ? 'border-sage bg-card'
                          : 'border-line bg-card'
                  }`}
                >
                  <input
                    type="radio"
                    name={`${lesson.key}-${i}`}
                    checked={picked}
                    onChange={() => setAnswers((a) => ({ ...a, [i]: j }))}
                    disabled={checked}
                    className="mt-1"
                  />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
          {checked && <p className="mt-1.5 text-xs text-muted">{q.explain}</p>}
        </fieldset>
      ))}

      {!checked ? (
        <button
          type="button"
          disabled={Object.keys(answers).length < lesson.quiz.length}
          onClick={() => {
            setChecked(true);
            onComplete(lesson.quiz.filter((q, i) => answers[i] === q.answer).length);
          }}
          className="w-full rounded-xl bg-sage px-4 py-2.5 font-medium text-white transition-colors hover:bg-sage-deep disabled:opacity-50"
        >
          Check my answers
        </button>
      ) : (
        <p className="text-center text-sm text-sage-deep">
          {correct} of {lesson.quiz.length} — nice work.
        </p>
      )}
    </div>
  );
}

function LessonCard({ lesson, done, onComplete }) {
  const [open, setOpen] = useState(false);

  return (
    <li className="rounded-2xl border border-line bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-4 text-left"
      >
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
            done ? 'bg-sage text-white' : 'border border-line text-muted'
          }`}
        >
          {done ? '✓' : ''}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-serif text-lg leading-snug">{lesson.title}</span>
          <span className="block text-sm text-muted">{lesson.minutes} min</span>
        </span>
      </button>

      {open && (
        <div className="rise border-t border-line px-4 py-4">
          <h3 className="mb-1 font-medium">What it is</h3>
          <p className="mb-4 leading-relaxed">{lesson.what_it_is}</p>

          <h3 className="mb-1 font-medium">Why it helps</h3>
          <p className="mb-4 leading-relaxed">{lesson.why_it_helps}</p>

          <h3 className="mb-1 font-medium">See it in action</h3>
          <p className="mb-3 text-sm text-muted">{lesson.example.intro}</p>
          <div className="mb-4 space-y-2.5">
            {lesson.example.turns.map((turn, i) => (
              <div key={i}>
                <p
                  className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                    turn.speaker === 'clinician'
                      ? 'bg-sage-soft'
                      : turn.speaker === 'note'
                        ? 'border border-line bg-paper font-medium'
                        : 'border border-line bg-paper'
                  }`}
                >
                  {turn.text}
                </p>
                {turn.note && <p className="mt-1 pl-3 text-xs italic text-muted">{turn.note}</p>}
              </div>
            ))}
          </div>

          <Quiz lesson={lesson} onComplete={onComplete} />

          <div className="mt-5 rounded-xl bg-dusty-soft p-4">
            <h3 className="mb-1 font-medium">Try this in your next visit</h3>
            <p className="text-sm leading-relaxed">{lesson.try_this}</p>
          </div>
        </div>
      )}
    </li>
  );
}

export default function Lessons() {
  const [completed, setCompleted] = useState({});

  useEffect(() => {
    api
      .progress()
      .then((d) => {
        const map = {};
        for (const row of d.lessons ?? []) map[row.lesson_key] = row;
        setCompleted(map);
      })
      .catch(() => {});
  }, []);

  async function complete(lessonKey, quizScore) {
    setCompleted((c) => ({ ...c, [lessonKey]: { lesson_key: lessonKey, quiz_score: quizScore } }));
    await api.completeLesson(lessonKey, quizScore).catch(() => {});
  }

  return (
    <>
      <p className="mb-4 text-muted">
        Short lessons on the things good clinicians actually do. Nothing is locked — take them in any
        order.
      </p>
      <ul className="space-y-3">
        {content.lessons.map((lesson) => (
          <LessonCard
            key={lesson.key}
            lesson={lesson}
            done={Boolean(completed[lesson.key])}
            onComplete={(score) => complete(lesson.key, score)}
          />
        ))}
      </ul>
    </>
  );
}
