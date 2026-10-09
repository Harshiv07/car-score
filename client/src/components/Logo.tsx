/**
 * The CarScore mark: a wheel read as a score.
 *
 * The tyre is the gauge. Its arc runs most of the way round and stops short,
 * the way a score of 87 does, and the hub is the number's place. It is built to
 * survive 16px (ring and hub only); from 28px up the five lug nuts appear.
 *
 * Colour comes from the page: the track follows the text colour, the arc is the
 * spot orange, so the mark works on the black header bar and on white stock.
 */

const R = 11.5;
const CIRC = 2 * Math.PI * R;

export function ScoreMark({
  size = 24,
  value = 0.87,
  title,
  className = "",
}: {
  size?: number;
  /** How much of the tyre the arc covers, 0 to 1. Decorative; the logo is 0.87. */
  value?: number;
  title?: string;
  className?: string;
}) {
  const arc = CIRC * Math.max(0, Math.min(1, value));
  const lugs = size >= 28;
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <circle cx="16" cy="16" r={R} fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="5" />
      <circle
        data-ring-arc
        cx="16"
        cy="16"
        r={R}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="5"
        strokeDasharray={`${arc} ${CIRC}`}
        transform="rotate(-90 16 16)"
      />
      <circle cx="16" cy="16" r={lugs ? 3 : 4} fill="currentColor" />
      {lugs &&
        [0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          return <circle key={i} cx={16 + Math.cos(a) * 6.4} cy={16 + Math.sin(a) * 6.4} r="0.9" fill="currentColor" />;
        })}
    </svg>
  );
}
