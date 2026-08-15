import { useEffect, useMemo, useState } from 'react';
import library from '../content/medications.json';

/**
 * Medication reference — handoff §8.
 * Slide-over on mobile, docked right rail ≥1024px. Four combinable filters.
 * Contains no dosing, no titration, no toxicity: see the file's _meta block.
 */

function ChipRow({ label, options, selected, onToggle }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              aria-pressed={on}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on
                  ? 'border-sage bg-sage-soft text-sage-deep'
                  : 'border-line bg-card text-muted hover:border-sage'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MedSidebar({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState([]);
  const [classes, setClasses] = useState([]);
  const [mechanisms, setMechanisms] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const toggle = (setter) => (value) =>
    setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.medications.filter((m) => {
      if (q && !m.generic.toLowerCase().includes(q) && !m.brand.toLowerCase().includes(q)) return false;
      if (types.length && !types.includes(m.type)) return false;
      if (classes.length && !classes.includes(m.class)) return false;
      if (mechanisms.length && !m.mechanisms.some((x) => mechanisms.includes(x))) return false;
      if (conditions.length && !m.treats.some((x) => conditions.includes(x))) return false;
      return true;
    });
  }, [query, types, classes, mechanisms, conditions]);

  const anyFilter = types.length || classes.length || mechanisms.length || conditions.length || query;

  const panel = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <h2 className="flex-1 font-serif text-lg">Medications</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-2 py-1 text-sm text-muted hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="border-b border-line px-4 py-3">
        <label className="sr-only" htmlFor="med-search">
          Search medications
        </label>
        <input
          id="med-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or brand…"
          className="w-full rounded-xl border border-line bg-card px-3 py-2 text-sm placeholder:text-muted/70"
        />
      </div>

      <div className="overflow-y-auto px-4 py-3">
        <ChipRow label="Type" options={library.types} selected={types} onToggle={toggle(setTypes)} />
        <ChipRow label="Class" options={library.classes} selected={classes} onToggle={toggle(setClasses)} />
        <ChipRow
          label="How it works"
          options={library.mechanisms}
          selected={mechanisms}
          onToggle={toggle(setMechanisms)}
        />
        <ChipRow
          label="Treats"
          options={library.conditions}
          selected={conditions}
          onToggle={toggle(setConditions)}
        />

        <div className="mb-2 mt-4 flex items-center justify-between text-xs text-muted">
          <span>
            {results.length} {results.length === 1 ? 'medication' : 'medications'}
          </span>
          {anyFilter ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setTypes([]);
                setClasses([]);
                setMechanisms([]);
                setConditions([]);
              }}
              className="text-sage-deep underline underline-offset-2"
            >
              Clear
            </button>
          ) : null}
        </div>

        <ul className="space-y-2">
          {results.map((m) => {
            const isOpen = expanded === m.generic;
            return (
              <li key={m.generic} className="rounded-xl border border-line bg-card">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : m.generic)}
                  aria-expanded={isOpen}
                  className="w-full px-3 py-2.5 text-left"
                >
                  <div className="font-medium">{m.generic}</div>
                  <div className="text-sm text-muted">
                    {m.brand} · {m.class}
                  </div>
                </button>
                {isOpen && (
                  <div className="rise border-t border-line px-3 py-2.5 text-sm">
                    <p className="mb-2">{m.how_it_works}</p>
                    <p className="mb-2 text-muted">{m.good_to_know}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {m.treats.map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-dusty-soft px-2 py-0.5 text-xs text-dusty"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-sm text-muted">
              Nothing matches those filters yet.
            </li>
          )}
        </ul>

        <p className="mt-5 border-t border-line pt-3 text-xs leading-relaxed text-muted">
          This is a reference for learning, not advice. It does not include doses or instructions for
          taking anything.
        </p>
      </div>
    </div>
  );

  if (!open) return null;

  return (
    <>
      {/* mobile: slide-over */}
      <div className="fixed inset-0 z-40 lg:hidden">
        <button
          type="button"
          aria-label="Close medication reference"
          onClick={onClose}
          className="absolute inset-0 bg-ink/20"
        />
        <div className="rise absolute inset-y-0 right-0 w-[min(24rem,92vw)] bg-paper shadow-xl">
          {panel}
        </div>
      </div>

      {/* desktop: docked right rail */}
      <div className="fixed inset-y-0 right-0 z-40 hidden w-96 border-l border-line bg-paper lg:block">
        {panel}
      </div>
    </>
  );
}
