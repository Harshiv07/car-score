import { useMemo, useState } from "react";
import { Stage, usePaint } from "../Stage";
import { prefersReducedMotion } from "../../lib/motion";

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
    bad: "A gap that widens, a door that sits proud, or paint that shifts shade in daylight means panels have been off, usually accident repair the seller hasn't mentioned.",
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
    look: "All four should match in brand and wear. Press a coin into the tread: under 4mm and they need replacing soon. Check the four-digit date code on the sidewall.",
    bad: "Uneven wear points at alignment or suspension trouble. Tyres over six years old are hard regardless of tread. Four new tyres on a cheap car can be $800.",
  },
  {
    id: "engine",
    n: 4,
    x: 83,
    y: 52,
    title: "Under the hood, engine cold",
    look: "Oil on the dipstick should be brown, not black sludge or milky. Coolant should be coloured and clean. Look for crust around the battery terminals and dampness around hoses.",
    bad: "Milky oil can mean coolant getting where it shouldn't: a head gasket, and a bill worth more than the car. Insist the engine is cold when you arrive; a warm one hides cold-start problems.",
  },
  {
    id: "glass",
    n: 5,
    x: 63,
    y: 37,
    title: "Glass and lights",
    look: "Windscreen chips in the driver's line of sight, and whether every bulb works: have someone press the brake while you stand behind.",
    bad: "A chip spreads in a Canadian winter and can fail a safety inspection. Foggy headlight lenses are cheap to fix but tell you the car has lived outside.",
  },
  {
    id: "interior",
    n: 6,
    x: 45,
    y: 37,
    title: "Inside, before you start it",
    look: "Turn the key to accessory: every warning light should come on, then go out when it starts. Test the heat, the air conditioning, every window and the wipers.",
    bad: "A warning light that never illuminates has usually been disconnected. A damp or musty smell means water is getting in. Check under the carpet and in the boot well.",
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
  const idx = SPOTS.indexOf(active);
  const clay = usePaint("--clay");
  const reduced = useMemo(prefersReducedMotion, []);
  const stageSpots = useMemo(() => SPOTS.map((s) => ({ id: s.id, n: s.n, label: s.title })), []);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <div className="studio relative overflow-hidden rounded-[20px] border border-line">
        <Stage
          style="sedan"
          paint={clay}
          mode="inspect"
          reducedMotion={reduced}
          spots={stageSpots}
          activeSpot={active.id}
          onSpot={setOpen}
          label="A car you can turn, with seven numbered inspection points. Choosing a point turns the car to show it."
          className="h-[300px] sm:h-[420px]"
          fallback={<FlatWalkaround active={active.id} onPick={setOpen} />}
        />
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[13px] text-faint">
          Pick a number, or drag to walk round the car.
        </p>
      </div>

      {/* The steps, in walking order. These buttons are also the accessible way through. */}
      <div>
        <ol className="flex flex-wrap gap-1.5">
          {SPOTS.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setOpen(s.id)}
                aria-pressed={s.id === active.id}
                aria-label={`${s.n}. ${s.title}`}
                className={`nums grid h-9 w-9 place-items-center rounded-full text-[14px] font-bold transition-colors ${
                  s.id === active.id ? "bg-accent text-[var(--on-accent)]" : "border border-line-strong text-muted hover:text-text"
                }`}
              >
                {s.n}
              </button>
            </li>
          ))}
        </ol>

        <div key={active.id} className="route-enter mt-5">
          <p className="nums text-[14px] font-semibold text-accent-ink">
            Stop {active.n} of {SPOTS.length}
          </p>
          <h3 className="wide mt-1 text-[22px] font-bold text-text">{active.title}</h3>

          <h4 className="mt-4 text-[14px] font-bold text-text">What to do</h4>
          <p className="mt-1 text-[15px] leading-relaxed text-muted">{active.look}</p>

          <h4 className="mt-4 text-[14px] font-bold text-bad">What it means if it's wrong</h4>
          <p className="mt-1 text-[15px] leading-relaxed text-muted">{active.bad}</p>

          <div className="mt-6 flex gap-2">
            <button className="btn btn-ghost py-2" disabled={idx === 0} onClick={() => setOpen(SPOTS[idx - 1].id)}>
              Previous stop
            </button>
            <button
              className="btn btn-primary py-2"
              disabled={idx === SPOTS.length - 1}
              onClick={() => setOpen(SPOTS[idx + 1].id)}
            >
              Next stop
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The flat diagram, for browsers without WebGL. */
function FlatWalkaround({ active, onPick }: { active: string; onPick: (id: string) => void }) {
  return (
    <div className="p-4 sm:p-6">
      <svg viewBox="0 0 400 200" className="w-full" role="img" aria-label="Side view of a car with seven inspection points">
        <line x1="10" y1="168" x2="390" y2="168" stroke="var(--line)" strokeWidth="1.5" strokeDasharray="4 6" />
        <path
          d="M42 140 L48 108 Q54 92 74 88 L140 80 Q168 60 214 60 Q262 60 288 82 L338 92 Q362 98 364 118 L366 140 Z"
          fill="var(--clay)"
          stroke="var(--line-strong)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M148 80 Q172 64 212 64 Q254 64 278 82 Z" fill="var(--text)" opacity="0.8" />
        {[108, 300].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="140" r="28" fill="var(--text)" />
            <circle cx={cx} cy="140" r="13" fill="var(--line-strong)" />
          </g>
        ))}
        {SPOTS.map((s) => {
          const on = s.id === active;
          return (
            <g key={s.id} transform={`translate(${(s.x / 100) * 400} ${(s.y / 100) * 200})`} onClick={() => onPick(s.id)} className="cursor-pointer">
              <circle r="12" fill={on ? "var(--accent)" : "var(--surface)"} stroke="var(--text)" strokeWidth="2" />
              <text textAnchor="middle" dy="4" fontSize="12" fontWeight="700" fill={on ? "var(--on-accent)" : "var(--text)"}>
                {s.n}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
