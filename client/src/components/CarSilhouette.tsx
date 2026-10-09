/**
 * The flat car: a sedan or an SUV in ink and grey. It stands in wherever there
 * is no photograph (a listing without one, a new-car model with no image), so
 * the space still says "a car of this shape" instead of an empty box.
 */
export function CarSilhouette({ suv = false, className = "" }: { suv?: boolean; className?: string }) {
  const body = suv
    ? "M30 150 L32 112 Q36 98 56 96 L118 90 L160 52 Q170 44 186 44 L330 44 Q350 46 358 62 L372 104 Q384 110 384 126 L384 150 Z"
    : "M24 150 L28 118 Q34 104 56 100 L132 92 Q166 64 214 62 Q262 62 290 86 L352 96 Q378 102 380 124 L380 150 Z";
  const glass = suv
    ? "M128 92 L166 58 Q172 52 184 52 L326 52 Q340 54 346 66 L356 92 Z"
    : "M146 92 Q172 70 212 70 Q252 70 278 92 Z";
  return (
    <svg viewBox="0 0 400 190" className={className} role="img" aria-label={suv ? "SUV silhouette" : "Sedan silhouette"}>
      <ellipse cx="200" cy="166" rx="190" ry="10" fill="var(--text)" opacity="0.1" />
      <path d={body} fill="var(--line-strong)" />
      <path d={glass} fill="var(--text)" />
      {[100, 300].map((cx) => (
        <circle key={cx} cx={cx} cy="150" r="26" fill="var(--text)" />
      ))}
    </svg>
  );
}
