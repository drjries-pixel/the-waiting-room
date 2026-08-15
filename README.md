# The Waiting Room

A psychiatry practice simulator built for a young learner. She sees simulated patients,
takes notes, finishes the visit, and gets a SOAP note plus warm, specific feedback.

Built to a private design brief; the `§` references throughout point at sections of that
brief, which isn't published. **Phases 1–4 are complete and working; Phases 5–7 are
partially done and gated — see "What is and isn't built" below.**

---

## The three things that were most likely to sink this, and what was done

**1. The API key never touches the browser.** Every model call is made from
`worker/ai/*`, which only runs server-side. `src/api.js` sends same-origin fetches
carrying an httpOnly session cookie and nothing else. Auth, the output filter, and
the rate limiter all fail closed.

**2. Patient safety is engineered at two layers, not one.** A generic LLM asked to play
a depressed or anxious patient will spontaneously produce suicidal ideation, self-harm,
abuse history, and substance use. That is the default failure mode, and prompt discipline
alone does not prevent it. `worker/ai/exclusions.js` holds the `EXCLUSIONS_BLOCK`
injected into every generation prompt *and* the keyword pass that screens every model
output before it reaches the browser. A flagged line is regenerated once with a
sharpened warning; if it trips again the patient says a neutral canned line and the
incident is logged as a category label — never the text.

The safety-screen design is the elegant part. Real psychiatric interviewing includes
asking about safety, and the learner should be taught to ask — but the patient must
never answer yes. So the patient always answers no, briefly and calmly, and the grader
awards points for having asked. Correct clinical reflex, zero harmful content.

**3. There is no runtime research retrieval.** The evidence layer is a build-time
concern. Nothing in the conversational loop calls out to PubMed or anything like it —
partly for latency, mostly because arbitrary retrieved text should not enter a child's
context window.

---

## What is and isn't built

| Phase | Status |
|---|---|
| 1 — Skeleton (Worker, D1, auth, SPA, waiting room) | ✅ Done |
| 2 — Safety (exclusions, output filter, input classifier, pause card, rate limiter) | ✅ Done |
| 3 — Conversation (patient turns, chat, side-note autosave, turn cap) | ✅ Done |
| 4 — Documentation & feedback (SOAP with annotations + gaps, grader, summary screen) | ✅ Done |
| 5 — Content | ⚠️ **Drafted, blocked on physician review.** Medication library (52 entries) and all six lessons are written and wired up, each marked `status: "DRAFT — NOT REVIEWED"` in its `_meta` block. Content ships without citations by owner decision — see "Content sourcing". The evidence pack has not been authored. |
| 6 — Persistence loop | ◑ Partial. Follow-up visits **work** (patients return with a changed state derived from how the last visit scored). The AI patient *generator* and automatic tier promotion are not built — regenerating re-seeds the same five Tier-1 patients. |
| 7 — Polish | ◑ Partial. Avatars, empty states, and gentle motion are in. Real-device iOS Safari testing has **not** happened. |

### Deliberate design calls worth knowing about

- **Follow-up visits were pulled forward from Phase 6.** Leaving a Follow-Ups tab that
  couldn't do anything would have been a dead control. The "since your last visit" state
  is derived deterministically from the previous visit's score rather than generated —
  honest, instant, and free.
- **The input classifier fails to a soft retry, not to the pause card.** The spec calls
  for failing closed on auth, the safety filter, and the rate limiter — the input
  classifier isn't on that list. Firing the pause card on a transient network blip would
  teach a kid that the app panics at random. Instead: the keyword pass blocks
  authoritatively; if the classifier itself errors twice, she gets "could you send that
  again?" and nothing unscreened ever reaches the patient model.
- **Grader score floors are enforced by the JSON schema**, not by asking the model
  nicely — `enum: [3, 4, 5]` at the API level. The floor is deliberate: the scores exist
  to show movement, not to gate anything.
- **Abandoned visits resume instead of stranding the patient.** Close the tab
  mid-interview and that patient reappears in the room you found them in, with the
  conversation intact. Without this, a patient stuck in `active` would have vanished
  from both tabs with no door out.
- **Patient turns run with `thinking: { type: 'disabled' }`.** Claude Sonnet 5 runs
  adaptive thinking by default and `max_tokens` caps thinking *and* text together, so
  the spec's 400-token budget would have been eaten by thinking and truncated every
  reply. This is the subtlest bug in the build and it is silent when you get it wrong.

---

## Setup

### 1. Cloudflare account

Deploy into an account dedicated to this project rather than one shared with anything
that matters. There is no PHI here and never will be, but account separation keeps a
side project from ever sharing a blast radius with production infrastructure.

1. Create the account in the dashboard, copy its account ID.
2. Paste it into `wrangler.jsonc` → `account_id` (currently `REPLACE_WITH_ACCOUNT_ID`).
3. Mint an API token **scoped to that account only**. If you already export
   `CLOUDFLARE_API_TOKEN` for something else, do not overwrite it — export the new one
   under a distinct name and pass it per-invocation.

### 2. Database

```bash
wrangler d1 create waiting-room
```

Paste the printed `database_id` into `wrangler.jsonc`, then apply the schema:

```bash
wrangler d1 execute waiting-room --remote --file=./schema.sql
```

### 3. Secrets

```bash
wrangler secret put ANTHROPIC_API_KEY
```

```bash
wrangler secret put SESSION_SECRET
```

`SESSION_SECRET` should be 32+ random bytes. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### 4. Create the learner's profile

Passcodes are hashed locally; the script prints only SQL.

```bash
node scripts/hash-passcode.mjs learner "Learner" "whatever-they-pick"
```

Run the printed `INSERT` against D1 with
`wrangler d1 execute waiting-room --remote --command "..."`.

---

## Running it

The SPA and the Worker run as two processes in development.

Frontend dev server:

```bash
npm run dev
```

Build plus a Worker bundle check — the fastest way to catch a mistake:

```bash
npm run check
```

The Worker itself:

```bash
wrangler dev
```

`npm run dev` proxies `/api` to `127.0.0.1:8787`, so with both running you get HMR on
the SPA and a real Worker behind it.

Before the first deploy, confirm you are pointed at the right account:

```bash
wrangler whoami
```

Then:

```bash
npm run build && wrangler deploy
```

### A note on Windows ARM64

This was developed on Windows ARM64, where `wrangler` cannot boot `workerd` natively —
there is no `win32-arm64` build. npm, Vite, and bundling run fine in PowerShell
(`npm run check` included, since a dry-run bundle never loads workerd), but `wrangler dev`
and `wrangler deploy` must run from WSL. On that setup, `npm install` should only ever run
Windows-side — `node_modules` holds Windows binaries.

---

## Layout

```
worker/
  index.js              routes; every route except /api/login requires a session
  lib/auth.js           JWT + PBKDF2 (scrypt isn't available in Workers)
  lib/rateLimit.js      30 turns / 5 min, 200 / day, 30 turns per visit
  ai/exclusions.js      hard content exclusions, safety-screen rule, keyword passes
  ai/filter.js          post-generation output filter (fails closed)
  ai/inputGuard.js      input guardrail + parent notification hook
  ai/patientTurn.js     the patient's next line
  ai/soap.js            annotations trace every line back to a question she asked
  ai/grader.js          six-dimension rubric
  data/patients.js      the five Tier-1 patients
src/
  screens/, components/, content/   the SPA
schema.sql              includes a safety_event table that stores labels, never text
```

---

## Open questions

| # | Question | Status |
|---|---|---|
| 1 | Cloudflare account | **Done.** Deployed into a dedicated account; account and database IDs are pinned in `wrangler.jsonc`. Neither is a credential. |
| 2 | Parent notification on the pause card | **Built, off by default.** Set the `PARENT_ALERT_WEBHOOK` var to enable. The ping carries the app name, the event, and a timestamp — no message text, no transcript, no detail. |
| 3 | Evidence pack approach | Not started. The curated-and-signed recommendation is what the code assumes. |
| 4 | Content review gate | **Blocking Phase 5.** Both content files carry a `_meta.status` of `DRAFT — NOT REVIEWED`. Medication entries have no dosing, titration, or toxicity by construction. |
| 5 | Additional profiles | Schema is already multi-profile; adding one is a single `hash-passcode.mjs` run. |
| 6 | Domain | Running on the default `*.workers.dev` address. No custom domain; preview URLs are explicitly disabled so there is exactly one public address. |

---

## Content sourcing

**The content files carry no citations.** Owner decision: the medication and lesson
content is reliable on its face, and the citation objects were removed everywhere —
per-entry, top-level, and from both UI footers. This overrides the "every entry carries a
citation" line in the original design brief.

Worth knowing if that ever needs revisiting: all 52 medication entries previously carried
verified MedlinePlus deep links, resolved from the live A–Z index rather than constructed
from a URL pattern. Four were filed under a different monograph name than the generic
label — divalproex sodium → *Valproic Acid*, amphetamine salts → *Dextroamphetamine and
Amphetamine*, doxepin low-dose → *Doxepin (Insomnia)*, selegiline patch → *Selegiline
Transdermal Patch* — and melatonin had no MedlinePlus monograph at all, being a
supplement. Re-deriving that mapping means roughly 25 index lookups; it is not
reconstructible from a pattern.

The `DRAFT — NOT REVIEWED` gate on both files is unaffected and still stands. Nothing in
`src/content/` should be treated as reviewed medical information.

---

## Not done yet, in priority order

1. A physician review pass on `src/content/medications.json` and
   `src/content/lessons.json`.
2. Real-device iOS Safari testing.
3. The evidence pack, then the AI patient generator and tier promotion.
4. The second set of lessons.

---

## A caution if you fork this

The safety layer here is not decorative and it is not generic. It was built for one
specific audience — a twelve-year-old roleplaying psychiatric patients — and the
exclusion list, the safety-screen rule, and the input guardrail are all load-bearing.
If you adapt this for a different audience, re-derive them rather than assuming they
transfer.
