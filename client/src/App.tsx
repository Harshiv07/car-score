import { lazy, Suspense, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { DetailPage } from "./pages/DetailPage";
// The leaderboard and a listing are the core loop and load with the app; the
// rest arrive when first visited.
const FavoritesPage = lazy(() => import("./pages/FavoritesPage").then((m) => ({ default: m.FavoritesPage })));
const NewCarsPage = lazy(() => import("./pages/NewCarsPage").then((m) => ({ default: m.NewCarsPage })));
const ComparePage = lazy(() => import("./pages/ComparePage").then((m) => ({ default: m.ComparePage })));
const GuidePage = lazy(() => import("./pages/GuidePage").then((m) => ({ default: m.GuidePage })));
import { RefreshControl } from "./components/RefreshControl";
import { ScrollManager } from "./components/ScrollManager";
import { Icon } from "./components/Icon";
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
 * The wordmark carries a tiny composition strip — the same ten segments every
 * score is drawn with, so the brand mark and the product's one idea are the
 * same picture.
 */
export function Wordmark() {
  const segs = [20, 20, 15, 10, 10, 10, 5, 5, 3, 2];
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-[9px] w-[30px] gap-[1.5px]" aria-hidden>
        {segs.map((w, i) => (
          <span
            key={i}
            className="h-full first:rounded-l-[2px] last:rounded-r-[2px]"
            style={{
              flexGrow: w,
              flexBasis: 0,
              backgroundColor: i === 0 ? "var(--accent)" : i === 7 ? "var(--line-strong)" : "var(--text)",
            }}
          />
        ))}
      </span>
      <span className="display text-[19px] tracking-[-0.03em] text-text">CarScore</span>
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
        `group relative shrink-0 px-3 py-2 text-[14px] font-semibold transition-colors ${
          isActive ? "text-text" : "text-muted hover:text-text"
        }`
      }
    >
      {({ isActive }) => (
        <>
          {label}
          {count ? <span className="nums ml-1 text-[12px] font-bold text-accent-ink">{count}</span> : null}
          <span
            className={`absolute inset-x-3 -bottom-px h-[2px] rounded-full bg-accent transition-transform duration-200 ${
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

  return (
    <div className="min-h-screen bg-bg text-text">
      <ScrollManager />

      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-bg/92 backdrop-blur-md">
        <div className="relative mx-auto max-w-[1240px] px-4 sm:px-6">
          <div className="flex h-16 items-center gap-4">
            <NavLink to="/" aria-label="CarScore home" className="shrink-0">
              <Wordmark />
            </NavLink>

            <nav aria-label="Primary" className="ml-4 hidden h-16 items-stretch md:flex">
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
