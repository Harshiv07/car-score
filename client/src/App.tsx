import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { DetailPage } from "./pages/DetailPage";
// The leaderboard and a listing are the core loop and load with the app; the
// rest arrive when first visited.
const FavoritesPage = lazy(() => import("./pages/FavoritesPage").then((m) => ({ default: m.FavoritesPage })));
const NewCarsPage = lazy(() => import("./pages/NewCarsPage").then((m) => ({ default: m.NewCarsPage })));
const ComparePage = lazy(() => import("./pages/ComparePage").then((m) => ({ default: m.ComparePage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));
const GuidePage = lazy(() => import("./pages/GuidePage").then((m) => ({ default: m.GuidePage })));

/** Download the other routes' code once the browser is idle, so the first visit to each is instant. */
function useIdleRoutePrefetch() {
  useEffect(() => {
    const run = () => {
      void import("./pages/NewCarsPage");
      void import("./pages/GuidePage");
      void import("./pages/ComparePage");
      void import("./pages/FavoritesPage");
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 });
    else setTimeout(run, 2000);
  }, []);
}
import { RefreshControl } from "./components/RefreshControl";
import { ScrollManager } from "./components/ScrollManager";
import { Icon } from "./components/Icon";
import { ScoreMark } from "./components/Logo";
import { useFavorites } from "./hooks/useFavorites";

const THEME_KEY = "carscore:v2:theme";

/** Night mode follows the system until someone picks one; then it remembers. */
function useDarkMode() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);
  const choose = (next: boolean) => {
    setDark(next);
    try {
      localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    } catch {
      /* private mode */
    }
  };
  return [dark, choose] as const;
}

function ThemeSwitch({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Daylight" : "Night drive"}
      onClick={onToggle}
      className="icon-btn"
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}

/**
 * The wordmark: the wheel-as-score mark and the name. It takes its colour from
 * where it sits (ink bar, paper stock), so it is one component for both.
 */
export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <ScoreMark size={26} />
      <span className="display text-[20px] leading-none">CarScore</span>
    </span>
  );
}

const TABS = [
  { to: "/", label: "Leaderboard", end: true },
  { to: "/new-cars", label: "New cars", end: false },
  { to: "/guide", label: "Guide", end: false },
  { to: "/favorites", label: "Saved", end: false },
];

function NavItem({ to, label, end, count }: { to: string; label: string; end: boolean; count?: number }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `cond group relative shrink-0 px-3 py-2.5 text-[13px] font-semibold uppercase tracking-[0.1em] transition-colors ${
          isActive ? "text-text" : "text-muted hover:text-text"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {label}
          {count ? <span className="nums ml-1 text-[12px] font-bold text-accent-ink">{count}</span> : null}
          <span
            className={`absolute inset-x-3 bottom-0 h-[3px] bg-accent transition-transform duration-200 ${
              isActive ? "scale-x-100" : "scale-x-0 group-hover:scale-x-50"
            }`}
            aria-hidden
          />
        </>
      )}
    </NavLink>
  );
}

export default function App() {
  const [dark, setDark] = useDarkMode();
  const { count } = useFavorites();
  const location = useLocation();
  useIdleRoutePrefetch();

  return (
    <div className="min-h-screen bg-bg text-text">
      <ScrollManager />

      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="site-bar sticky top-0 z-30">
        <div className="relative mx-auto max-w-[1240px] px-4 sm:px-6">
          <div className="flex h-14 items-center gap-4">
            <NavLink to="/" aria-label="CarScore home" className="shrink-0">
              <Wordmark />
            </NavLink>

            <nav aria-label="Primary" className="ml-4 hidden h-14 items-stretch md:flex">
              {TABS.map((t) => (
                <div key={t.to} className="flex items-center">
                  <NavItem {...t} count={t.to === "/favorites" ? count : undefined} />
                </div>
              ))}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <RefreshControl />
              <ThemeSwitch dark={dark} onToggle={() => setDark(!dark)} />
            </div>
          </div>

          <nav aria-label="Primary" className="-mx-4 flex items-center overflow-x-auto px-1 pb-1 md:hidden">
            {TABS.map((t) => (
              <NavItem key={t.to} {...t} count={t.to === "/favorites" ? count : undefined} />
            ))}
          </nav>
        </div>
      </header>

      <main id="main">
        <div key={location.pathname} className="route-enter">
          <Suspense fallback={<div className="min-h-[60vh]" aria-busy="true" />}>
            <Routes location={location}>
              <Route path="/" element={<LeaderboardPage />} />
              <Route path="/new-cars" element={<NewCarsPage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/guide" element={<GuidePage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/listing/:id" element={<DetailPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-4 py-10 text-[13px] leading-relaxed text-faint sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <Wordmark />
          <p className="max-w-xl">
            Scores blend model reliability data, live market comparison, winter capability and ownership cost. Always
            check open recalls by VIN and get an independent pre-purchase inspection.
          </p>
        </div>
      </footer>
    </div>
  );
}
