import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Bottom sheet holding the filters on small screens.
 *
 * The sidebar used to render inline above the results on mobile, which meant
 * scrolling past every control before seeing a single car. Filters are a
 * detour, not the destination, so on mobile they move behind a button and the
 * first thing under the header is a listing.
 *
 * Focus is trapped while open, Escape closes, and the background is inert —
 * a sheet you can tab out of behind the scrim is worse than no sheet.
 */
export function FilterDrawer({
  open,
  onClose,
  activeCount,
  children,
}: {
  open: boolean;
  onClose: () => void;
  activeCount: number;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Stop the page behind the sheet from scrolling with it.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusable = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null);

    focusable()[0]?.focus();

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
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className="sheet-in absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-3xl border-t border-line bg-surface"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-display text-base font-bold text-text">
            Filters{activeCount > 0 ? ` (${activeCount})` : ""}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-muted transition hover:text-text"
          >
            Close
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-4">{children}</div>

        <div className="border-t border-line p-3">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-brand py-3 text-sm font-bold transition hover:bg-brand-strong"
            style={{ color: "var(--on-brand)" }}
          >
            Show results
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
