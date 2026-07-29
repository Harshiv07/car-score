import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A value you can change continuously, committed only once it settles.
 *
 * Sliders are the problem this exists for. A range input fires on every pixel
 * of a drag, and each one was writing the URL and starting a fetch — a single
 * sweep of the price filter fired twenty requests, nineteen of them for ranges
 * the reader passed straight through. Discrete controls don't need this: a
 * toggle or a select is one deliberate act, and delaying it would just feel
 * broken.
 *
 * The returned `value` updates immediately, so the thumb tracks the pointer
 * without lag; only the commit waits. The two are deliberately separate — the
 * common mistake is debouncing the input itself, which makes the control feel
 * stuck.
 *
 * `external` resyncs the draft when the value changes from somewhere else —
 * "Clear all filters", the back button, a shared link — so the slider doesn't
 * sit on a stale position after the URL moves underneath it.
 */
export function useDebouncedCommit<T>(
  external: T,
  commit: (value: T) => void,
  delayMs = 450
): [T, (next: T) => void] {
  const [draft, setDraft] = useState(external);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(false);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // Adopt outside changes, but never while a local edit is still in flight —
  // that would yank the thumb back to the old value mid-drag.
  useEffect(() => {
    if (!pending.current) setDraft(external);
  }, [external]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const set = useCallback(
    (next: T) => {
      setDraft(next);
      pending.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        pending.current = false;
        commitRef.current(next);
      }, delayMs);
    },
    [delayMs]
  );

  return [draft, set];
}
