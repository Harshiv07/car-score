import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * The interactive walkaround: a car in profile with the points a first-time
 * buyer should actually stop at, in the order you'd physically walk them.
 *
 * This is the page's signature element, and it earns that by being the one
 * thing a list of bullet points can't do — inspection is *spatial*. "Check the
 * rocker panels" means nothing until you can see where they are, so the diagram
 * carries the location and the text carries the detail.
 *
 * Numbered because the order is real: you walk a car from the front, down one
 * side, around the back and up the other, and doing it in a fixed order is how
 * you stop skipping things when a seller is standing next to you.
 */

interface Spot {
  id: string;
  n: number;
  /** Percentage position over the diagram box. */
  x: number;
  y: number;
  title: string;
  look: string;
  bad: string;
}

const SPOTS: Spot[] = [
  {
    id: "panels",
    n: 1,
    x: 42,
    y: 55,
    title: "Panel gaps and paint",
    look: "Crouch at each end and sight down the side. Gaps between panels should stay the same width the whole way along, and the colour should stay the same as it moves from wing to door.",
    bad: "A gap that widens, a door that sits proud, or paint that shifts shade in daylight means panels have been off — usually accident repair the seller hasn't mentioned.",
  },
  {
    id: "rust-arch",
    n: 2,
    x: 27,
    y: 60,
    title: "Wheel arches and rocker panels",
    look: "Run a hand along the lip inside each arch and the sill below the doors. You want smooth metal, not bubbling under the paint.",
    bad: "Bubbles are rust pushing out from behind. On a salted Canadian road car this is where it starts, and by the time it shows it is already through from the inside.",
  },
  {
    id: "tyres",
    n: 3,
    x: 75,
    y: 70,
    title: "Tyres",
    look: "All four should match in brand and wear. Press a coin into the tread — under 4mm and they need replacing soon. Check the four-digit date code on the sidewall.",
    bad: "Uneven wear points at alignment or suspension trouble. Tyres over six years old are hard regardless of tread. Four new tyres on a cheap car can be $800.",
  },
  {
    id: "engine",
    n: 4,
    x: 83,
    y: 52,
    title: "Under the hood, engine cold",
    look: "Oil on the dipstick should be brown, not black sludge or milky. Coolant should be coloured and clean. Look for crust around the battery terminals and dampness around hoses.",
    bad: "Milky oil can mean coolant getting where it shouldn't — a head gasket, and a bill worth more than the car. Insist the engine is cold when you arrive; a warm one hides cold-start problems.",
  },
  {
    id: "glass",
    n: 5,
    x: 63,
    y: 37,
    title: "Glass and lights",
    look: "Windscreen chips in the driver's line of sight, and whether every bulb works — have someone press the brake while you stand behind.",
    bad: "A chip spreads in a Canadian winter and can fail a safety inspection. Foggy headlight lenses are cheap to fix but tell you the car has lived outside.",
  },
  {
    id: "interior",
    n: 6,
    x: 45,
    y: 37,
    title: "Inside, before you start it",
    look: "Turn the key to accessory: every warning light should come on, then go out when it starts. Test the heat, the air conditioning, every window and the wipers.",
    bad: "A warning light that never illuminates has usually been disconnected. A damp or musty smell means water is getting in — check under the carpet and in the boot well.",
  },
  {
    id: "underneath",
    n: 7,
    x: 52,
    y: 78,
    title: "Underneath",
    look: "Kneel and look along the floor with a phone torch. Frame rails and subframe should be solid. The ground where it was parked should be dry.",
    bad: "Flaking, layered rust on structural metal is different from surface rust and is a walk-away. Fresh drips: black is oil, red or pink is transmission, green or orange is coolant.",
  },
];

export function Walkaround() {
  const [open, setOpen] = useState<string>(SPOTS[0].id);
  const active = SPOTS.find((s) => s.id === open) ?? SPOTS[0];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface p-4 sm:p-6">
        <svg viewBox="0 0 400 200" className="w-full" role="img" aria-label="Side view of a car with seven inspection points">
          {/* Ground line */}
          <line x1="10" y1="168" x2="390" y2="168" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="4 6" />

          {/* Body */}
          <motion.path
            d="M42 140 L48 108 Q54 92 74 88 L140 80 Q168 60 214 60 Q262 60 288 82 L338 92 Q362 98 364 118 L366 140 Z"
            fill="color-mix(in oklab, var(--brand) 12%, var(--surface))"
            stroke="var(--brand)"
            strokeWidth="2.5"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          />
          {/* Greenhouse */}
          <path
            d="M148 80 Q172 64 212 64 Q254 64 278 82 Z"
            fill="color-mix(in oklab, var(--info) 18%, transparent)"
            stroke="color-mix(in oklab, var(--brand) 55%, transparent)"
            strokeWidth="1.5"
          />
          <line x1="212" y1="64" x2="212" y2="82" stroke="var(--line-strong)" strokeWidth="1.5" />

          {/* Wheels */}
          {[108, 300].map((cx) => (
            <g key={cx}>
              <circle cx={cx} cy="140" r="28" fill="var(--bg)" stroke="var(--brand)" strokeWidth="2.5" opacity="0.85" />
              <circle cx={cx} cy="140" r="13" fill="none" stroke="var(--line)" strokeWidth="2" />
            </g>
          ))}

          {/* Hotspots */}
          {SPOTS.map((s) => {
            const isActive = s.id === active.id;
            return (
              <g
                key={s.id}
                transform={`translate(${(s.x / 100) * 400} ${(s.y / 100) * 200})`}
                onClick={() => setOpen(s.id)}
                className="cursor-pointer"
              >
                {isActive && (
                  // Scale rather than the `r` attribute: animating `r` without
                  // an explicit initial leaves it undefined on the first frame,
                  // and the browser rejects the attribute outright.
                  <motion.circle
                    r="15"
                    fill="var(--brand)"
                    opacity={0.18}
                    style={{ transformOrigin: "center", transformBox: "fill-box" }}
                    animate={{ scale: [1, 1.45, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
                <circle
                  r="12"
                  fill={isActive ? "var(--brand)" : "var(--surface)"}
                  stroke={isActive ? "var(--brand)" : "var(--line-strong)"}
                  strokeWidth="2"
                />
                <text
                  textAnchor="middle"
                  dy="4"
                  fontSize="12"
                  fontWeight="700"
                  fill={isActive ? "var(--on-brand)" : "var(--muted)"}
                >
                  {s.n}
                </text>
              </g>
            );
          })}
        </svg>

        <p className="mt-2 text-center text-[11px] text-faint">Tap a number to see what to check there.</p>
      </div>

      {/* The detail, and the buttons that are the accessible way through it. */}
      <div>
        <div className="flex flex-wrap gap-1.5">
          {SPOTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setOpen(s.id)}
              aria-pressed={s.id === active.id}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                s.id === active.id ? "bg-brand" : "bg-surface2 text-muted hover:text-text"
              }`}
              style={s.id === active.id ? { color: "var(--on-brand)" } : undefined}
            >
              {s.n}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="mt-4 rounded-2xl border border-line bg-surface p-5"
          >
            <h3 className="font-display text-lg font-extrabold text-text">{active.title}</h3>

            <p className="mt-3 text-[13px] font-bold uppercase tracking-wider text-faint">What to do</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{active.look}</p>

            <p className="mt-4 text-[13px] font-bold uppercase tracking-wider text-bad">What it means if it's wrong</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{active.bad}</p>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
