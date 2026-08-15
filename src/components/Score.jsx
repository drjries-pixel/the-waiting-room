/**
 * Soft filled circles rather than harsh numbers — handoff §10.
 * Scores never go below 3, so the display is about movement, not judgement.
 */
export default function Score({ value, max = 5 }) {
  return (
    <span className="inline-flex items-center gap-1" role="img" aria-label={`${value} out of ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`h-2.5 w-2.5 rounded-full ${i < value ? 'bg-sage' : 'bg-line'}`}
        />
      ))}
    </span>
  );
}
