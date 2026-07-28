import { useSyncExternalStore } from "react";

/**
 * The comparison set — up to three cars held side by side.
 *
 * Same tiny-external-store shape as useFavorites so cards, the tray and the
 * compare view all stay in sync. Deliberately session-scoped (sessionStorage):
 * a comparison is a decision you're making right now, not a list you curate.
 * Saving a car for later is what favourites are for.
 *
 * Keyed by listing id rather than dedupeKey because the compare view fetches
 * each car's full detail by id; ids that vanish after a re-scrape simply drop
 * out of the tray, which is the behaviour you want mid-session anyway.
 */

export const MAX_COMPARE = 3;

const KEY = "carscore:v2:compare";
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string").slice(0, MAX_COMPARE);
  } catch {
    return [];
  }
}

let cache: string[] = read();

function write(ids: string[]) {
  cache = ids;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* private mode */
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useCompare() {
  const ids = useSyncExternalStore(subscribe, () => cache);
  return {
    ids,
    count: ids.length,
    canAdd: ids.length < MAX_COMPARE,
    has: (id: string) => ids.includes(id),
    toggle: (id: string) => {
      if (cache.includes(id)) write(cache.filter((x) => x !== id));
      else if (cache.length < MAX_COMPARE) write([...cache, id]);
    },
    remove: (id: string) => write(cache.filter((x) => x !== id)),
    clear: () => write([]),
  };
}
