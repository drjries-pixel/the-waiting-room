import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onSignedIn }) {
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api.login(name, passcode);
      onSignedIn(data.profile);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* A quiet clinic office: two chairs, a plant, a lamp. */}
          <svg
            viewBox="0 0 200 120"
            className="mx-auto mb-5 w-52"
            role="img"
            aria-label="An illustration of a quiet waiting room"
          >
            <rect x="0" y="96" width="200" height="2" rx="1" fill="#E8E2D9" />
            <rect x="24" y="62" width="46" height="34" rx="7" fill="#EDF3ED" />
            <rect x="30" y="52" width="34" height="16" rx="6" fill="#7C9A82" />
            <rect x="84" y="62" width="46" height="34" rx="7" fill="#EDF3ED" />
            <rect x="90" y="52" width="34" height="16" rx="6" fill="#7C9A82" />
            <rect x="152" y="78" width="22" height="18" rx="4" fill="#C9B39A" />
            <path d="M163 78c-10-4-14-14-10-22 8 2 12 10 10 22z" fill="#7C9A82" />
            <path d="M163 78c9-6 10-16 5-23-7 4-9 13-5 23z" fill="#55755C" />
            <circle cx="163" cy="34" r="0" />
            <rect x="8" y="30" width="26" height="20" rx="3" fill="#EEF2F6" />
          </svg>
          <h1 className="mb-1.5 font-serif text-3xl">The Waiting Room</h1>
          <p className="text-muted">A quiet place to practise talking with patients.</p>
        </div>

        <form onSubmit={submit} className="rounded-2xl border border-line bg-card p-6 shadow-sm">
          <label className="mb-1.5 block text-sm font-medium" htmlFor="name">
            Your name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            className="mb-4 w-full rounded-xl border border-line bg-paper px-3 py-2.5"
            required
          />

          <label className="mb-1.5 block text-sm font-medium" htmlFor="passcode">
            Passcode
          </label>
          <input
            id="passcode"
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            autoComplete="current-password"
            className="mb-5 w-full rounded-xl border border-line bg-paper px-3 py-2.5"
            required
          />

          {error && (
            <p role="alert" className="mb-4 rounded-lg bg-paper px-3 py-2 text-sm text-warn">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-sage px-5 py-3 font-medium text-white transition-colors hover:bg-sage-deep disabled:opacity-60"
          >
            {busy ? 'Opening…' : 'Come in'}
          </button>
        </form>
      </div>
    </div>
  );
}
