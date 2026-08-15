import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import MedSidebar from '../components/MedSidebar.jsx';
import PauseCard from '../components/PauseCard.jsx';

/** Feature-detect once. Never render a mic button that cannot work (§12). */
const SpeechRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition ?? window.webkitSpeechRecognition : null;

function MicButton({ onText, disabled }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  if (!SpeechRecognition) return null;

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const said = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join(' ');
      onText(said);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      aria-pressed={listening}
      aria-label={listening ? 'Stop dictating' : 'Dictate your question'}
      className={`shrink-0 rounded-xl border px-3 py-2.5 transition-colors ${
        listening ? 'border-sage bg-sage text-white' : 'border-line bg-card text-muted hover:text-sage-deep'
      } disabled:opacity-50`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

export default function Visit({ session, onFinished, onLeave }) {
  const { patient } = session;
  const [transcript, setTranscript] = useState(session.visit.transcript);
  const [draft, setDraft] = useState('');
  const [notes, setNotes] = useState(session.visit.side_notes ?? '');
  const [notesOpen, setNotesOpen] = useState(false);
  const [medsOpen, setMedsOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(null);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [turnsUsed, setTurnsUsed] = useState(session.visit.turns_used ?? 0);

  const turnsAllowed = session.visit.turns_allowed ?? 30;
  const bottomRef = useRef(null);
  const notesTimer = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [transcript, thinking]);

  // Side-notes autosave. Debounced so it isn't a write per keystroke.
  useEffect(() => {
    if (notes === (session.visit.side_notes ?? '')) return undefined;
    clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      api.saveNotes(session.visit.id, notes).catch(() => {});
    }, 1200);
    return () => clearTimeout(notesTimer.current);
  }, [notes, session.visit.id, session.visit.side_notes]);

  const send = useCallback(
    async (text) => {
      const trimmed = text.trim();
      if (!trimmed || thinking) return;

      setError(null);
      setDraft('');
      setTranscript((prev) => [...prev, { role: 'clinician', text: trimmed }]);
      setThinking(true);

      try {
        const res = await api.sendMessage(session.visit.id, trimmed);
        if (res.paused) {
          setPaused(true);
          return;
        }
        setTranscript((prev) => [...prev, { role: 'patient', text: res.reply }]);
        setTurnsUsed(res.turns_used);
      } catch (e) {
        setError(e.message);
        // Take the un-sent question back out so the transcript stays honest.
        setTranscript((prev) => prev.slice(0, -1));
        setDraft(trimmed);
      } finally {
        setThinking(false);
      }
    },
    [session.visit.id, thinking],
  );

  async function finish() {
    setFinishing(true);
    setError(null);
    try {
      clearTimeout(notesTimer.current);
      await api.saveNotes(session.visit.id, notes).catch(() => {});
      await api.finishVisit(session.visit.id);
      onFinished(session.visit.id);
    } catch (e) {
      setError(e.message);
      setFinishing(false);
      setConfirmFinish(false);
    }
  }

  const turnsLeft = turnsAllowed - turnsUsed;
  const wrappingUp = turnsLeft <= 5;

  if (paused) return <PauseCard onClose={onLeave} />;

  return (
    <div className="flex min-h-dvh flex-col bg-paper lg:pr-0">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
          <Avatar seed={patient.avatar_seed} size={40} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-serif text-base leading-tight">{patient.name}</h1>
            <p className="truncate text-xs text-muted">
              {patient.age} · {patient.occupation}
              {session.visit.visit_number > 1 ? ` · visit ${session.visit.visit_number}` : ''}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-muted transition-colors hover:text-sage-deep lg:hidden"
          >
            Notes
          </button>
          <button
            type="button"
            onClick={() => setMedsOpen(true)}
            className="rounded-full border border-line bg-card px-3 py-1.5 text-sm text-muted transition-colors hover:text-sage-deep"
          >
            Meds
          </button>
          <button
            type="button"
            onClick={() => setConfirmFinish(true)}
            className="rounded-full bg-sage px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sage-deep"
          >
            Finish
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4">
        {/* chat column */}
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
          <div className="flex-1 space-y-3 py-5">
            {transcript.map((entry, i) => (
              <div
                key={i}
                className={`rise flex ${entry.role === 'clinician' ? 'justify-end' : 'justify-start'}`}
              >
                <p
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 leading-relaxed ${
                    entry.role === 'clinician'
                      ? 'rounded-br-md bg-sage-soft text-ink'
                      : 'rounded-bl-md border border-line bg-card'
                  }`}
                >
                  {entry.text}
                </p>
              </div>
            ))}

            {thinking && (
              <div className="flex justify-start" aria-live="polite">
                <p className="rounded-2xl rounded-bl-md border border-line bg-card px-4 py-3 text-muted">
                  <span className="sr-only">{patient.first_name} is typing</span>
                  <span aria-hidden="true" className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted [animation-delay:300ms]" />
                  </span>
                </p>
              </div>
            )}

            {wrappingUp && turnsLeft > 0 && (
              <p className="rounded-xl border border-dashed border-line px-4 py-3 text-center text-sm text-muted">
                You have {turnsLeft} {turnsLeft === 1 ? 'question' : 'questions'} left in this visit.
                Real visits have a clock too — a good time to ask the thing you most want to know.
              </p>
            )}
            {turnsLeft <= 0 && (
              <p className="rounded-xl border border-dashed border-line px-4 py-3 text-center text-sm text-muted">
                That's the full visit. Finish up and see what your note looks like.
              </p>
            )}

            <div ref={bottomRef} />
          </div>

          {error && (
            <p role="alert" className="mb-2 rounded-lg border border-line bg-card px-3 py-2 text-sm text-warn">
              {error}
            </p>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="safe-bottom sticky bottom-0 flex gap-2 bg-paper/95 py-3 backdrop-blur"
          >
            <label className="sr-only" htmlFor="say">
              What do you want to ask?
            </label>
            <input
              id="say"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={turnsLeft <= 0 ? 'This visit is complete.' : 'What would you like to ask?'}
              disabled={thinking || turnsLeft <= 0}
              className="flex-1 rounded-xl border border-line bg-card px-4 py-2.5 placeholder:text-muted/70 disabled:opacity-60"
            />
            <MicButton onText={(t) => setDraft((d) => (d ? `${d} ${t}` : t))} disabled={thinking || turnsLeft <= 0} />
            <button
              type="submit"
              disabled={thinking || !draft.trim() || turnsLeft <= 0}
              className="shrink-0 rounded-xl bg-sage px-4 py-2.5 font-medium text-white transition-colors hover:bg-sage-deep disabled:opacity-50"
            >
              Ask
            </button>
          </form>
        </div>

        {/* desktop side-notes rail */}
        <aside className="hidden w-72 shrink-0 py-5 lg:block">
          <div className="sticky top-20">
            <h2 className="mb-2 font-serif text-base">Your notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Jot down what stands out…"
              className="h-72 w-full resize-none rounded-xl border border-line bg-card p-3 text-sm leading-relaxed placeholder:text-muted/70"
            />
            <p className="mt-2 text-xs text-muted">Saved automatically.</p>
          </div>
        </aside>
      </div>

      {/* mobile side-notes drawer */}
      {notesOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close notes"
            onClick={() => setNotesOpen(false)}
            className="absolute inset-0 bg-ink/20"
          />
          <div className="rise safe-bottom absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-line bg-paper p-4">
            <div className="mb-2 flex items-center">
              <h2 className="flex-1 font-serif text-lg">Your notes</h2>
              <button type="button" onClick={() => setNotesOpen(false)} className="text-sm text-muted">
                Done
              </button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Jot down what stands out…"
              autoFocus
              className="h-56 w-full resize-none rounded-xl border border-line bg-card p-3 text-sm leading-relaxed"
            />
            <p className="mt-2 text-xs text-muted">Saved automatically.</p>
          </div>
        </div>
      )}

      {confirmFinish && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/25 px-5">
          <div className="rise w-full max-w-sm rounded-2xl border border-line bg-card p-6">
            <h2 className="mb-2 font-serif text-lg">Finish the visit?</h2>
            <p className="mb-5 text-muted">
              We'll write up the note and show you how it went. You won't be able to ask
              {' '}{patient.first_name} anything else today.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmFinish(false)}
                disabled={finishing}
                className="flex-1 rounded-xl border border-line px-4 py-2.5 text-muted"
              >
                Not yet
              </button>
              <button
                type="button"
                onClick={finish}
                disabled={finishing}
                className="flex-1 rounded-xl bg-sage px-4 py-2.5 font-medium text-white transition-colors hover:bg-sage-deep disabled:opacity-60"
              >
                {finishing ? 'Writing…' : 'Finish visit'}
              </button>
            </div>
          </div>
        </div>
      )}

      <MedSidebar open={medsOpen} onClose={() => setMedsOpen(false)} />
    </div>
  );
}
