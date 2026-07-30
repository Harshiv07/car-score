import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { MotionConfig } from "framer-motion";
import "@fontsource-variable/inter";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/jetbrains-mono";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Kept in localStorage between visits, so this has to outlive the tab.
      gcTime: 24 * 60 * 60 * 1000,
    },
  },
});

/**
 * Query cache persisted to localStorage.
 *
 * The API runs on a free tier that spins down when idle, and waking it takes
 * real time — measured against the deployed instance, a cold `/api/listings`
 * took 46s against 0.36s warm. Nothing in the app can make that request faster,
 * but a returning reader does not have to *wait* on it: their last results are
 * restored from disk and painted immediately, and the network response replaces
 * them when it lands.
 *
 * A day of staleness is fine for this data. Inventory is refreshed by a crawl
 * at most every ten minutes, and a listing that sold overnight is a listing that
 * would have been stale anyway — showing it instantly and correcting it a moment
 * later is a better trade than an empty page for the better part of a minute.
 */
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "carscore:v2:query-cache",
  // Quietly no-op in private mode or when the quota is full, rather than
  // taking the app down over a cache write.
  throttleTime: 1000,
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000,
        // Bump when a response shape changes, so an old cache can't be restored
        // into a UI that no longer understands it.
        buster: "v2",
        dehydrateOptions: {
          // Only persist what makes a cold start feel instant. The scrape status
          // is live state — restoring a stale "running" would be a lie — and
          // per-listing detail is prefetched on hover anyway.
          shouldDehydrateQuery: (q) => {
            const root = q.queryKey[0];
            return q.state.status === "success" && (root === "listings" || root === "listingStats" || root === "meta");
          },
        },
      }}
    >
      {/* `reducedMotion="user"` makes every motion component honour the OS
          setting: transforms are dropped, opacity changes stay, so the UI
          still reads as responsive without moving. */}
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MotionConfig>
    </PersistQueryClientProvider>
  </React.StrictMode>
);
