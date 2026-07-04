import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { DetailPage } from "./pages/DetailPage";

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

export default function App() {
  const [dark, setDark] = useDarkMode();
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Car<span className="text-cyan-500">Score</span>
            </span>
            <span className="hidden text-xs font-medium text-slate-400 dark:text-slate-500 sm:inline">
              first-car copilot · Canada
            </span>
          </Link>
          <button
            onClick={() => setDark((d) => !d)}
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {dark ? "☀ Light" : "☾ Dark"}
          </button>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<LeaderboardPage />} />
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
