import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Explains a long first load instead of spinning at the reader.
 *
 * The API sleeps when idle and takes 30-60s to wake — measured at 46s cold
 * against 0.36s warm. A returning visitor never sees this, because their last
 * results are restored from localStorage and painted immediately. A first-time
 * visitor genuinely waits, and a skeleton that sits there for most of a minute
 * reads as broken.
 *
 * So: say nothing for the first few seconds, because most loads are quick and a
 * warning that flashes up on every visit is worse than none. Past that, say what
 * is happening in plain terms, and past that again, admit how long it can take.
 * The honest version keeps people waiting; the spinner loses them.
 */
const STAGES = [
  { after: 4000, text: "Still loading — the server may be waking up." },
  {
    after: 12000,
    text: "The API sleeps when idle and can take up to a minute to start. It'll be quick from here on.",
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

  return (
    <AnimatePresence>
      {stage && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          role="status"
          className="mb-4 flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3"
        >
          <motion.span
            className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-line border-t-brand"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, ease: "linear", duration: 1 }}
            aria-hidden
          />
          <p className="text-sm leading-relaxed text-muted">{stage.text}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
