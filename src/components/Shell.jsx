import MedSidebar from './MedSidebar.jsx';
import { useState } from 'react';

const TABS = [
  { key: 'waiting', label: 'Waiting Room', icon: '🪑' },
  { key: 'followups', label: 'Follow-Ups', icon: '🔁' },
  { key: 'lessons', label: 'Lessons', icon: '📖' },
  { key: 'progress', label: 'Progress', icon: '🌿' },
];

/** Pill icon — opens the medication reference. Always available (handoff §8). */
function PillIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="2.5"
        y="8"
        width="19"
        height="8"
        rx="4"
        transform="rotate(-40 12 12)"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M8.6 15.4 15.4 8.6" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export default function Shell({ view, onNavigate, title, children, showTabs = true, onSignOut }) {
  const [medsOpen, setMedsOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <h1 className="flex-1 truncate font-serif text-lg sm:text-xl">{title}</h1>

          <button
            type="button"
            onClick={() => setMedsOpen(true)}
            className="flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-sm text-muted transition-colors hover:text-sage-deep"
            aria-label="Open the medication reference"
          >
            <PillIcon />
            <span className="hidden sm:inline">Medications</span>
          </button>

          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:text-ink"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className={`mx-auto max-w-6xl px-4 ${showTabs ? 'pb-28' : 'pb-8'} pt-5`}>{children}</main>

      {showTabs && (
        <nav
          className="safe-bottom fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur"
          aria-label="Main"
        >
          <div className="mx-auto flex max-w-6xl">
            {TABS.map((tab) => {
              const active = view === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => onNavigate(tab.key)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition-colors ${
                    active ? 'text-sage-deep' : 'text-muted'
                  }`}
                >
                  <span aria-hidden="true" className="text-lg leading-none">
                    {tab.icon}
                  </span>
                  <span className={active ? 'font-medium' : ''}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <MedSidebar open={medsOpen} onClose={() => setMedsOpen(false)} />
    </div>
  );
}
