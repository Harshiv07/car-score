import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { usePresence } from "../hooks/usePresence";
import { Icon } from "./Icon";

/**
 * Filters on small screens, as a bottom sheet. Filters are a detour, not the
 * destination, so on a phone the first thing under the header is a car.
 * Focus is trapped while open, Escape closes, and the page behind can't scroll.
 */
export function FilterDrawer({
  open,
  onClose,
  activeCount,
  resultCount,
  children,
}: {
  open: boolean;
  onClose: () => void;
  activeCount: number;
  resultCount?: number;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const p = usePresence(open, 320);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null);

    const raf = requestAnimationFrame(() => focusable()[0]?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!p.mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      <div data-state={p.state} className="overlay absolute inset-0 bg-black/45" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        data-state={p.state}
        data-side="bottom"
        className="sheet absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-[20px] bg-surface"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="wide text-[17px] font-bold text-text">
            Filters{activeCount > 0 ? ` (${activeCount})` : ""}
          </h2>
          <button onClick={onClose} aria-label="Close filters" className="icon-btn">
            <Icon name="close" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">{children}</div>

        <div className="border-t border-line p-3">
          <button onClick={onClose} className="btn btn-primary w-full py-3">
            {resultCount != null ? `Show ${resultCount.toLocaleString("en-CA")} cars` : "Show results"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
