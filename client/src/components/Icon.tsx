/** A handful of line icons, drawn on one 24px grid with one stroke weight. */

type IconName =
  | "heart"
  | "heart-fill"
  | "compare"
  | "external"
  | "chevron-left"
  | "chevron-down"
  | "refresh"
  | "sun"
  | "moon"
  | "close"
  | "filters"
  | "check";

const PATHS: Record<IconName, React.ReactNode> = {
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  "heart-fill": <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" fill="currentColor" />,
  compare: (
    <>
      <path d="M7 7h11l-3-3" />
      <path d="M17 17H6l3 3" />
    </>
  ),
  external: (
    <>
      <path d="M14 5h5v5" />
      <path d="M19 5l-8 8" />
      <path d="M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" />
    </>
  ),
  "chevron-left": <path d="M14 6l-6 6 6 6" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  refresh: (
    <>
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M19 4v4h-4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
    </>
  ),
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  filters: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 5v4M8 15v4" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};

export function Icon({ name, size = 18, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
