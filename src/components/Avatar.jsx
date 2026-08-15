/**
 * Deterministic illustrated avatar. Same seed always draws the same person, so
 * Marcus looks like Marcus every visit. No external images, nothing to load.
 */

const PALETTES = [
  { bg: '#EDF3ED', hair: '#5B4B3A', skin: '#E8C9A8', shirt: '#7C9A82' },
  { bg: '#EEF2F6', hair: '#2F2A26', skin: '#C08E63', shirt: '#7F96AC' },
  { bg: '#F5EFE7', hair: '#8A6A4B', skin: '#F0D6BC', shirt: '#A98D75' },
  { bg: '#F0EDF5', hair: '#3D3A46', skin: '#8D5F3E', shirt: '#8F86A8' },
  { bg: '#EFF4F1', hair: '#B08040', skin: '#F2DCC6', shirt: '#6E9E93' },
  { bg: '#F6F0EE', hair: '#4A3B36', skin: '#A3714B', shirt: '#B4816E' },
];

function hash(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function Avatar({ seed = 'x', size = 56, className = '' }) {
  const h = hash(seed);
  const p = PALETTES[h % PALETTES.length];
  const round = h % 2 === 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={`shrink-0 rounded-full ${className}`}
      role="img"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="32" fill={p.bg} />
      {/* shoulders */}
      <path d="M10 64c0-12 10-19 22-19s22 7 22 19z" fill={p.shirt} />
      {/* head */}
      <circle cx="32" cy="27" r="14" fill={p.skin} />
      {/* hair */}
      {round ? (
        <path d="M18 25a14 14 0 0 1 28 0c0-9-6-13-14-13s-14 4-14 13z" fill={p.hair} />
      ) : (
        <path d="M18 26c0-10 6-14 14-14s14 4 14 14v-2c-5 2-10 3-14 3s-9-1-14-3z" fill={p.hair} />
      )}
      {/* eyes */}
      <circle cx="27" cy="27" r="1.6" fill="#3A3330" />
      <circle cx="37" cy="27" r="1.6" fill="#3A3330" />
      {/* a small, unbothered mouth */}
      <path d="M28 33c2 1.6 6 1.6 8 0" stroke="#3A3330" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}
