import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useScroll, useSpring, useMotionValueEvent } from "framer-motion";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { DetailPage } from "./pages/DetailPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { NewCarsPage } from "./pages/NewCarsPage";
import { ComparePage } from "./pages/ComparePage";
import { RefreshControl } from "./components/RefreshControl";
import { ScrollManager } from "./components/ScrollManager";
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
      className="relative inline-flex h-8 w-[52px] shrink-0 items-center rounded-full border border-line bg-surface2 transition-colors"
    >
      <span className="absolute left-2 text-[10px] text-faint" aria-hidden>
        ☀
      </span>
      <span className="absolute right-2 text-[10px] text-faint" aria-hidden>
        ☾
      </span>
      <motion.span
        className="relative z-10 grid h-6 w-6 place-items-center rounded-full bg-raised text-[11px] text-brand shadow"
        animate={{ x: dark ? 23 : 3 }}
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        aria-hidden
      >
        {dark ? "☾" : "☀"}
      </motion.span>
    </button>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-extrabold tracking-tight text-text ${className}`}>
      CAR<span className="text-brand">SCORE</span>
    </span>
  );
}

const TABS = [
  { to: "/", label: "Leaderboard", end: true },
  { to: "/new-cars", label: "New cars", end: false },
  { to: "/favorites", label: "Saved", end: false },
];

export default function App() {
  const [dark, setDark] = useDarkMode();
  const { count } = useFavorites();
  const location = useLocation();

  // Scroll-linked chrome. `scrollYProgress` is a motion value, so the progress
  // bar is driven off the compositor rather than a React state update per
  // scroll event — the difference between a smooth bar and a stuttering one.
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 180, damping: 30, restDelta: 0.001 });
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));

  const tab = ({ isActive }: { isActive: boolean }) =>
    `relative shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
      isActive ? "text-brand" : "text-muted hover:text-text"
    }`;

  return (
    <div className="min-h-screen bg-bg text-text">
      <ScrollManager />

      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <header
        className={`sticky top-0 z-30 border-b bg-bg/85 backdrop-blur-md transition-[border-color,box-shadow] duration-300 ${
          scrolled ? "border-line-strong/60 shadow-lg shadow-black/20" : "border-line shadow-none"
        }`}
      >
        <div className="relative mx-auto max-w-7xl px-4">
          <div className="flex items-center gap-3 py-3">
            <NavLink to="/" className="flex shrink-0 items-baseline gap-2">
              <Wordmark className="text-lg sm:text-xl" />
              <span className="hidden text-xs font-medium text-faint lg:inline">first-car copilot · Canada</span>
            </NavLink>

            {/* Desktop nav sits inline; on mobile it drops to its own row so
                nothing gets clipped off the right edge. */}
            <nav aria-label="Primary" className="ml-2 hidden items-center gap-1 sm:flex">
              {TABS.map((t) => (
                <NavLink key={t.to} to={t.to} end={t.end} className={tab}>
                  {({ isActive }) => (
                    <>
                      {t.label}
                      {t.to === "/favorites" && count > 0 ? ` (${count})` : ""}
                      {isActive && (
                        <motion.span
                          layoutId="tab-underline"
                          className="absolute inset-x-2 -bottom-[13px] h-0.5 rounded-full bg-brand"
                          transition={{ type: "spring", stiffness: 420, damping: 34 }}
                        />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <RefreshControl />
              <ThemeSwitch dark={dark} onToggle={() => setDark((d) => !d)} />
            </div>
          </div>

          {/* How far through the page you are. Ambient, not a control. */}
          <motion.div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px origin-left bg-brand/70"
            style={{ scaleX: progress }}
            aria-hidden
          />

          {/* Mobile nav row. */}
          <nav aria-label="Primary" className="-mx-4 flex items-center gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
            {TABS.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={tab}>
                {t.label}
                {t.to === "/favorites" && count > 0 ? ` (${count})` : ""}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main id="main">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            <Routes location={location}>
              <Route path="/" element={<LeaderboardPage />} />
              <Route path="/new-cars" element={<NewCarsPage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/compare" element={<ComparePage />} />
              <Route path="/listing/:id" element={<DetailPage />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-10 text-center text-xs leading-relaxed text-faint">
        Scores blend model reliability data, live market comparison, winter capability and ownership cost.
        <br className="hidden sm:block" /> Always verify open recalls by VIN and get a pre-purchase inspection.
      </footer>
    </div>
  );
}
