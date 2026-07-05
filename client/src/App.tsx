import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { DetailPage } from "./pages/DetailPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { useFavorites } from "./hooks/useFavorites";

const THEME_KEY = "carscore:v2:theme";

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) !== "light";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      /* private mode */
    }
  }, [dark]);
  return [dark, setDark] as const;
}

/** Sun/moon slider switch for the theme. */
function ThemeSwitch({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={onToggle}
      className="relative inline-flex h-8 w-[58px] shrink-0 items-center rounded-full border border-line bg-surface-2 transition-colors"
    >
      <span className="absolute left-2 text-[11px] text-faint" aria-hidden>
        ☀
      </span>
      <span className="absolute right-2 text-[11px] text-faint" aria-hidden>
        ☾
      </span>
      <span
        className={`relative z-10 grid h-6 w-6 place-items-center rounded-full text-[11px] shadow transition-transform ${
          dark ? "translate-x-[29px] bg-raised text-brand" : "translate-x-[3px] bg-white text-brand"
        }`}
        aria-hidden
      >
        {dark ? "☾" : "☀"}
      </span>
    </button>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-extrabold tracking-tight text-text ${className}`}>
      CAR<span className="text-brand">SCORE</span>
    </span>
  );
}

export default function App() {
  const [dark, setDark] = useDarkMode();
  const { count } = useFavorites();

  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
      isActive ? "bg-brand/12 text-brand" : "text-muted hover:text-text"
    }`;

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-baseline gap-2">
            <Wordmark className="text-xl" />
            <span className="hidden text-xs font-medium text-faint md:inline">first-car copilot · Canada</span>
          </NavLink>

          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={tab}>
              Leaderboard
            </NavLink>
            <NavLink to="/favorites" className={tab}>
              ♥ Favourites{count > 0 ? ` (${count})` : ""}
            </NavLink>
          </nav>

          <div className="ml-auto">
            <ThemeSwitch dark={dark} onToggle={() => setDark((d) => !d)} />
          </div>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<LeaderboardPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/listing/:id" element={<DetailPage />} />
        </Routes>
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-10 text-center text-xs text-faint">
        Scores blend model reliability data, live market comparison, winter capability and ownership cost.
        Always verify recalls and get a pre-purchase inspection.
      </footer>
    </div>
  );
}
