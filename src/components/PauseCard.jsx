/**
 * The pause card — handoff §2.3.
 *
 * Shown when the input guard thinks the learner may be describing her own real
 * distress rather than interviewing. It exits the simulation immediately and
 * does not continue the roleplay in that session. Gentle, not alarming, and it
 * points at a person rather than a hotline.
 */
export default function PauseCard({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-paper/95 px-5">
      <div className="rise max-w-md rounded-2xl border border-line bg-card p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sage-soft text-2xl">
          🌿
        </div>
        <h2 className="mb-3 font-serif text-xl">Let's pause the practice for a second.</h2>
        <p className="mb-6 leading-relaxed text-muted">
          If something's bothering you for real, the best next step is talking to your mom or dad.
          They'd want to know.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-sage px-5 py-3 font-medium text-white transition-colors hover:bg-sage-deep"
        >
          Okay
        </button>
        <p className="mt-4 text-xs text-muted">
          The visit is saved. You can come back to the waiting room whenever you like.
        </p>
      </div>
    </div>
  );
}
