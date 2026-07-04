import { useSyncExternalStore } from "react";

/**
 * Favourites live in localStorage (no accounts in this app). A tiny external
 * store keeps every subscribed component — cards, header tab count, the
 * favourites page — in sync, including across browser tabs.
 */

const KEY = "carscore:v2:favorites";
const listeners = new Set<() => void>();

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

let cache: string[] = read();

function write(ids: string[]) {
  cache = ids;
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* private mode */
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = read();
      fn();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function useFavorites() {
  const ids = useSyncExternalStore(subscribe, () => cache);
  return {
    ids,
    count: ids.length,
    isFavorite: (id: string) => ids.includes(id),
    toggle: (id: string) => {
      write(cache.includes(id) ? cache.filter((x) => x !== id) : [...cache, id]);
    },
  };
}
