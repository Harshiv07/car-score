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
      className={`relative inline-flex h-7 w-[52px] shrink-0 items-center rounded-full border transition-colors ${
        dark ? "border-slate-700 bg-slate-800" : "border-slate-300 bg-amber-100"
      }`}
    >
      <span className="absolute left-1.5 text-[11px]" aria-hidden>☀</span>
      <span className="absolute right-1.5 text-[11px]" aria-hidden>☾</span>
      <span
        className={`relative z-10 grid h-5 w-5 place-items-center rounded-full text-[11px] shadow transition-transform ${
          dark ? "translate-x-[27px] bg-slate-950 text-slate-200" : "translate-x-[3px] bg-white text-amber-500"
        }`}
        aria-hidden
      >
        {dark ? "☾" : "☀"}
      </span>
    </button>
  );
}

export default function App() {
  const [dark, setDark] = useDarkMode();
  const { count } = useFavorites();

  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
      isActive
        ? "bg-cyan-600/10 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300"
        : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
    }`;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
          <NavLink to="/" className="flex items-baseline gap-2">
            <span className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Car<span className="text-cyan-500">Score</span>
            </span>
            <span className="hidden text-xs font-medium text-slate-400 dark:text-slate-500 md:inline">
              first-car copilot · Canada
            </span>
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

      <footer className="mx-auto max-w-7xl px-4 py-8 text-center text-xs text-slate-400 dark:text-slate-600">
        Scores blend model reliability data, live market comparison, winter capability and ownership cost.
        Always verify recalls and get a pre-purchase inspection.
      </footer>
    </div>
  );
}
