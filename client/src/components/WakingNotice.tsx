import { useEffect, useState } from "react";

/**
 * Explains a long first load instead of spinning at the reader.
 *
 * The API sleeps when idle and takes 30–60s to wake (measured 46s cold against
 * 0.36s warm). Returning visitors never see this — their last results are
 * restored from localStorage. A first-time visitor genuinely waits, so: say
 * nothing for a few seconds, then say what's happening, then admit how long it
 * can take.
 */
const STAGES = [
  { after: 4000, text: "Still loading. The server may be waking up." },
  {
    after: 12000,
    text: "The API sleeps when it's idle and can take up to a minute to start. It'll be quick from here on.",
  },
];

export function WakingNotice({ active }: { active: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const t = setInterval(() => setElapsed(Date.now() - started), 500);
    return () => clearInterval(t);
  }, [active]);

  const stage = active ? [...STAGES].reverse().find((s) => elapsed >= s.after) : undefined;
  if (!stage) return null;

  return (
    <div role="status" className="route-enter mb-4 flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
      <span className="spin mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-line border-t-accent" aria-hidden />
      <p className="text-sm leading-relaxed text-muted">{stage.text}</p>
    </div>
  );
}
