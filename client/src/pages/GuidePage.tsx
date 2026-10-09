import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP, gsap, SplitText, hasPlayed, markPlayed, prefersReducedMotion } from "../lib/motion";

gsap.registerPlugin(ScrollTrigger);
import { Walkaround } from "../components/guide/Walkaround";
import { TyreWear, RustMap, ServiceTimeline } from "../components/guide/Diagrams";
import { SellerTypes, CertifiedMeanings } from "../components/guide/SellerTypes";

/**
 * The first-car guide.
 *
 * CarScore ranks cars; it can't stand in a parking lot with you. This page is
 * the part the leaderboard can't do — what to actually look at, in what order,
 * and which findings are worth walking away over.
 *
 * Two rules shaped the writing. Everything is specific enough to act on: "check
 * the tyres" is useless, "press a coin into the tread and read the four-digit
 * date code" is a thing you can do while a seller watches. And every claim that
 * carries money stays inside what is genuinely standard advice — this page tells
 * you to get an independent inspection rather than pretending to replace one.
 *
 * Canadian throughout, because that is who the app is for: road salt, winter
 * tyres, provincial paperwork.
 */

function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      data-guide-section
      className="scroll-mt-24 border-t border-line pt-10 first-of-type:border-t-0 first-of-type:pt-0"
    >
      <header className="max-w-[62ch]">
        <h2 className="wide text-[clamp(1.5rem,2.6vw,2rem)] font-extrabold leading-[1.15] text-text">
          <span className="nums mr-3 text-accent-ink" aria-hidden>
            {eyebrow}
          </span>
          {title}
        </h2>
        {lede && <p className="mt-3 text-[16px] leading-relaxed text-muted">{lede}</p>}
      </header>
      <div className="mt-7">{children}</div>
    </section>
  );
}

/** A tip: ruled, not boxed, so a page of them reads as a list rather than a wall of tiles. */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t-2 border-text pt-4">
      <h3 className="wide text-[16px] font-bold text-text">{title}</h3>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}

/** A cost line — the numbers a first buyer doesn't know to expect. */
function CostRow({ label, amount, note }: { label: string; amount: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-text">{label}</p>
        <p className="text-[13px] text-muted">{note}</p>
      </div>
      <p className="nums wide shrink-0 text-[15px] font-bold text-text">{amount}</p>
    </div>
  );
}

const CONTENTS = [
  { id: "budget", label: "What it really costs" },
  { id: "before", label: "Before you go" },
  { id: "sellers", label: "Who's selling it" },
  { id: "certified", label: "“Certified”" },
  { id: "walkaround", label: "The walkaround" },
  { id: "tyres", label: "Reading the tyres" },
  { id: "rust", label: "Rust" },
  { id: "drive", label: "The test drive" },
  { id: "paperwork", label: "Paperwork" },
  { id: "ppi", label: "The inspection" },
  { id: "negotiate", label: "Negotiating" },
  { id: "walkaway", label: "When to walk away" },
  { id: "maintain", label: "Keeping it alive" },
];

export function GuidePage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(CONTENTS[0].id);
  const [intro] = useState(() => !prefersReducedMotion() && !hasPlayed("guide"));
  useEffect(() => markPlayed("guide"), []);

  useGSAP(
    () => {
      // The contents rail follows your place in the guide.
      const triggers = gsap.utils.toArray<HTMLElement>("[data-guide-section]").map((el) =>
        ScrollTrigger.create({
          trigger: el,
          start: "top 45%",
          end: "bottom 45%",
          onToggle: (self) => self.isActive && setActive(el.id),
        }),
      );
      // And the one entrance: the headline, line by line.
      if (intro) {
        SplitText.create(rootRef.current!.querySelector("h1")!, {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (self) => gsap.from(self.lines, { yPercent: 105, duration: 0.9, ease: "power4.out", stagger: 0.1 }),
        });
      }
      return () => triggers.forEach((t) => t.kill());
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className="mx-auto max-w-[1240px] px-4 pb-16 sm:px-6">
      <header className="pb-12 pt-10 sm:pt-16">
        <p className="text-[15px] font-semibold text-accent-ink">The first-car guide</p>
        <h1 className="display mt-4 max-w-[14ch] text-[clamp(2.75rem,7vw,5.75rem)] text-text">
          Nobody teaches you how to buy a car.
        </h1>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <p className="max-w-[56ch] text-[17px] leading-relaxed text-muted">
            A score tells you which cars are worth your time. It can't stand in a parking lot with you while someone
            waits for an answer. This is the other half: what to look at, in what order, what the findings mean, and
            which ones are worth walking away over.
          </p>
          <p className="max-w-[56ch] text-[15px] leading-relaxed text-faint">
            Written for a first buyer in Canada, so it assumes road salt, winter tyres and provincial paperwork. None of
            it replaces an independent mechanic. It's what gets you to the point of paying for one, on a car worth
            inspecting.
          </p>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14">
        {/* Contents: the buying process in order, so numbered. */}
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <p className="label">In order</p>
          <ol className="mt-3 flex gap-1 overflow-x-auto pb-2 lg:block lg:space-y-0.5 lg:overflow-visible lg:pb-0">
            {CONTENTS.map((c, i) => {
              const on = c.id === active;
              return (
                <li key={c.id} className="shrink-0">
                  <a
                    href={`#${c.id}`}
                    aria-current={on ? "location" : undefined}
                    className={`flex items-baseline gap-2.5 rounded-md px-2 py-1.5 text-[14px] transition-colors ${
                      on ? "bg-surface font-semibold text-text" : "text-muted hover:text-text"
                    }`}
                  >
                    <span className={`nums w-5 text-[12px] ${on ? "text-accent-ink" : "text-faint"}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {c.label}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-w-0 space-y-14">
          {/* ---- budget ---- */}
          <Section
            id="budget"
            eyebrow="01"
            title="The sticker price is about two-thirds of it"
            lede="The most common first-car mistake is spending the whole budget on the car. These are the costs that arrive in the first month, and they are the reason a $12,000 car and a $9,000 car can end up costing the same."
          >
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
              <CostRow
                label="Sales tax"
                amount="5-15%"
                note="Depends on province. In Ontario, 13% HST on the purchase price."
              />
              <CostRow
                label="Safety inspection certificate"
                amount="$80-150"
                note="Required to register a used car in most provinces."
              />
              <CostRow
                label="Insurance"
                amount="$150-400 / mo"
                note="A new driver pays the most. Get a real quote on the exact VIN before you commit."
              />
              <CostRow label="Registration and plates" amount="$60-200" note="One-off, plus annual renewal." />
              <CostRow
                label="Pre-purchase inspection"
                amount="$100-200"
                note="The best money in this entire list. Details below."
              />
              <CostRow
                label="Winter tyres"
                amount="$600-1,200"
                note="Not optional in most of Canada. Legally required in Quebec."
              />
              <CostRow
                label="First service and repairs"
                amount="$300-800"
                note="Assume the previous owner deferred something. They usually did."
              />
            </div>

            <div className="mt-4 rounded-r-[var(--radius-card)] border-l-[3px] border-accent bg-surface p-5">
              <p className="text-[15px] leading-relaxed text-text">
                <span className="font-bold">A rule that holds up:</span> if the car costs everything you have, you
                cannot afford the car. Keep roughly 15% of your budget back for the first repair, because on a used car
                there is always a first repair.
              </p>
            </div>
          </Section>

          {/* ---- before ---- */}
          <Section
            id="before"
            eyebrow="02"
            title="Before you go and look"
            lede="Ten minutes of this saves entire wasted afternoons, and it is where most of your negotiating leverage comes from."
          >
            <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
              <Card title="Get an insurance quote first">
                <p>
                  On the exact year, make, model and trim. Insurance for a new driver can cost more per year than the
                  car does, and some models, anything with a sporty badge, are dramatically worse. Finding this out
                  after you've paid is the expensive order to do it in.
                </p>
              </Card>
              <Card title="Look up the model, not the listing">
                <p>
                  Search the model and year with the word "problems" or "common faults". Every car has a known list. You
                  want to know whether this one eats transmissions before the seller tells you it's been "great".
                </p>
              </Card>
              <Card title="Pull the history report">
                <p>
                  CARFAX Canada for accident and lien history. In Ontario the seller is legally required to provide a
                  Used Vehicle Information Package (UVIP), which shows registration history and any liens. A lien means
                  someone else has a claim on the car and it can be repossessed from you.
                </p>
              </Card>
              <Card title="Bring the right things">
                <p>
                  A phone torch, a fridge magnet, a coin, and a friend. The magnet won't stick to body filler hiding
                  rust or a repair. The friend presses the brake pedal while you check the lights, and talks you out of
                  it when you fall in love with the wrong car.
                </p>
              </Card>
              <Card title="Go in daylight, in dry weather">
                <p>
                  Rain hides paint defects and makes every car look shiny. Dusk hides everything. If a seller will only
                  meet after dark, meet another day.
                </p>
              </Card>
              <Card title="Ask them not to warm it up">
                <p>
                  Say you want to see it start from cold. A warmed engine hides hard starting, smoke on startup, and
                  noises that quiet down once oil is circulating. If you arrive and the hood is warm, that is
                  information too.
                </p>
              </Card>
            </div>
          </Section>

          {/* ---- who is selling it ---- */}
          <Section
            id="sellers"
            eyebrow="03"
            title="Who's selling it changes everything else"
            lede="The same car at the same price carries completely different protection depending on who hands you the keys. This is the least visible thing in a listing and the most consequential, so settle it before you drive anywhere."
          >
            <SellerTypes />

            <div className="mt-6 rounded-r-[var(--radius-card)] border-l-[3px] border-fair bg-surface p-5">
              <p className="text-[15px] leading-relaxed text-text">
                <span className="font-bold">A listing site is not a seller.</span> AutoTrader and CarGurus are
                noticeboards: a listing there can be a franchised dealer, an independent lot, or someone in a driveway,
                and the column that applies to you changes completely between them. This app shows the source it found a
                car on, which is not the same as who is selling it, so the first question on the phone is:{" "}
                <span className="font-semibold text-text">are you a registered dealer, or a private seller?</span>
              </p>
            </div>
          </Section>

          {/* ---- the certified trap ---- */}
          <Section
            id="certified"
            eyebrow="04"
            title="Three different things are called &ldquo;certified&rdquo;"
            lede="This single word does more damage than any other in a used-car advert, because a seller can say it and mean any of the following, and none of them means what a first buyer assumes."
          >
            <CertifiedMeanings />

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <p className="text-[15px] font-bold text-text">So ask the question precisely</p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  Not "is it certified?" but "does it come with a valid Safety Standards Certificate, and is there any
                  warranty beyond that?" Those are two separate answers, and a vague reply to a precise question is
                  itself information.
                </p>
              </div>
              <div className="rounded-r-[var(--radius-card)] border-l-[3px] border-bad bg-surface p-5">
                <p className="text-[15px] font-bold text-bad">
                  &ldquo;Sold as-is&rdquo; is legal, and it means exactly what it says
                </p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  A registered dealer may sell a car with no certificate and no warranty as long as it is clearly
                  disclosed. You cannot plate it until it passes an inspection, and you pay for both the inspection and
                  everything it fails on. Price an as-is car as if it needs $1,000 of work, because it might.
                </p>
              </div>
            </div>
          </Section>

          {/* ---- walkaround ---- */}
          <Section
            id="walkaround"
            eyebrow="05"
            title="The walkaround, in order"
            lede="Do this the same way every time. A fixed order is how you stop skipping things while someone stands next to you waiting for a decision."
          >
            <Walkaround />
          </Section>

          {/* ---- tyres ---- */}
          <Section
            id="tyres"
            eyebrow="06"
            title="Tyres tell you about the car, not the tyres"
            lede="They are the cheapest part to read and the most honest. Wear patterns record how the car has been maintained and whether anything underneath is bent."
          >
            <TyreWear />
            <p className="mt-5 max-w-[62ch] text-[15px] leading-relaxed text-muted">
              Also check the date. Every tyre carries a four-digit code on the sidewall:{" "}
              <span className="nums font-semibold text-text">3223</span> means the 32nd week of 2023. Rubber hardens
              with age regardless of tread depth, and anything past about six years should be replaced whatever it looks
              like. Four tyres on a small car runs $600-900 fitted, so this is a real negotiating number, not a detail.
            </p>
          </Section>

          {/* ---- rust ---- */}
          <Section
            id="rust"
            eyebrow="07"
            title="Rust is the Canadian tax"
            lede="Road salt means a structurally rusty car is common here and normal in an eight-year-old vehicle that lived outside. Surface rust on a bracket is cosmetic. Rust on structure is the end of the car."
          >
            <RustMap />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <p className="text-[15px] font-bold text-good">Usually fine</p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  Orange surface film on the exhaust, suspension springs or brake discs. Brake discs rust overnight in a
                  damp driveway and clean themselves on the first stop.
                </p>
              </div>
              <div className="rounded-r-[var(--radius-card)] border-l-[3px] border-bad bg-surface p-5">
                <p className="text-[15px] font-bold text-bad">Walk away</p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  Flaking, layered rust on frame rails, subframes or suspension mounting points. Anything that gives
                  when pressed. Holes. This is structural, it fails safety inspection, and repairing it costs more than
                  the car is worth.
                </p>
              </div>
            </div>
          </Section>

          {/* ---- drive ---- */}
          <Section
            id="drive"
            eyebrow="08"
            title="The test drive"
            lede="Twenty minutes, with the radio off, on roads you choose, not the loop the seller suggests. You are listening, not enjoying it."
          >
            <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
              <Card title="From cold, before you move">
                <p>
                  Watch the exhaust on startup. Blue smoke is burning oil, white smoke that doesn't clear can be
                  coolant, black smoke is running rich. A puff of vapour on a cold morning is just condensation.
                </p>
              </Card>
              <Card title="Brakes">
                <p>
                  On an empty road, brake firmly. The car should stop straight without pulling, the pedal should feel
                  firm rather than spongy, and there should be no grinding. A pulsing pedal usually means warped discs.
                </p>
              </Card>
              <Card title="Steering and suspension">
                <p>
                  On a straight, flat road, briefly loosen your grip. Drifting to one side means alignment at best. Over
                  bumps, listen for knocks or clunks. Those are suspension components, and they are labour.
                </p>
              </Card>
              <Card title="Transmission">
                <p>
                  An automatic should shift without lurching or hesitating, including on the downshift as you slow. A
                  manual should not slip when you accelerate in a high gear. Try reverse: a whine only in reverse is
                  worth asking about.
                </p>
              </Card>
              <Card title="At speed">
                <p>
                  Get it to highway speed if you can. Vibration through the wheel at 100 km/h is often just balancing;
                  vibration through the seat is more likely driveline. Both are worth pricing.
                </p>
              </Card>
              <Card title="After you park">
                <p>
                  Leave it idling and look underneath for fresh drips. Then switch it off and restart it warm: a car
                  that starts cold but struggles warm has its own set of problems.
                </p>
              </Card>
            </div>
          </Section>

          {/* ---- paperwork ---- */}
          <Section
            id="paperwork"
            eyebrow="09"
            title="Paperwork, and the one number that has to match"
            lede="Boring, and the part that turns into a genuine disaster when it's wrong."
          >
            <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
              <Card title="Match the VIN in three places">
                <p>
                  The dashboard by the windscreen, the sticker in the driver's door jamb, and the ownership document.
                  All three must be identical. A mismatch means the car is not what the paperwork says it is: stop
                  there.
                </p>
              </Card>
              <Card title="The seller's name must be on the ownership">
                <p>
                  If the name doesn't match the person selling it, you are dealing with a curbsider: someone flipping
                  cars privately while posing as a regular owner, without the obligations of a dealer. It is illegal in
                  most provinces and you have almost no recourse.
                </p>
              </Card>
              <Card title="Check for a lien">
                <p>
                  A lien means a lender still has a claim. If you buy the car, the claim follows the car, not the
                  seller. The Ontario UVIP shows this; other provinces have equivalent registry searches.
                </p>
              </Card>
              <Card title="Safety standards certificate">
                <p>
                  Needed to register and plate the car in most provinces. Agree in advance who pays for it and who fixes
                  whatever it fails on. This is a common surprise bill.
                </p>
              </Card>
              <Card title="Odometer versus wear">
                <p>
                  A steering wheel worn smooth, shiny pedals and a sagging driver's seat do not belong on 60,000 km.
                  History reports record odometer readings over time; a number that goes backwards is fraud.
                </p>
              </Card>
              <Card title="Get a bill of sale">
                <p>
                  Names, addresses, date, price, VIN, and both signatures. It protects you on tax and proves when the
                  car stopped being the seller's problem.
                </p>
              </Card>
            </div>
          </Section>

          {/* ---- PPI ---- */}
          <Section id="ppi" eyebrow="10" title="Pay a mechanic before you pay the seller">
            <div className="rounded-r-[var(--radius-card)] border-l-[3px] border-accent bg-surface p-6 sm:p-8">
              <p className="text-[17px] leading-relaxed text-text">
                A pre-purchase inspection costs <span className="nums font-bold text-text">$100-200</span> at an
                independent shop, not the seller's mechanic, and not the dealer selling it. They put it on a hoist,
                which is the only way anyone sees the things that actually end a car.
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                It is the highest-return money in the whole process. Either it finds nothing and you buy with
                confidence, or it finds something and you have a written estimate to negotiate with, or a reason to
                walk. Spending $150 to avoid a $3,000 transmission is not a close call.
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                <span className="font-semibold text-text">A seller who refuses is telling you something.</span> Any
                honest seller with a sound car has no reason to object. "I've got other people interested" in response
                to an inspection request is pressure, and pressure is the oldest tool in this trade.
              </p>
            </div>
          </Section>

          {/* ---- negotiate ---- */}
          <Section
            id="negotiate"
            eyebrow="11"
            title="Negotiating with facts instead of nerve"
            lede="You don't need to be a confident haggler. You need a list and a number, which is what the previous sections were for."
          >
            <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
              <Card title="Price the findings, don't describe them">
                <p>
                  "The tyres are worn" invites an argument. "All four tyres are below 4mm and dated 2018, which is $780
                  fitted, so I can do $780 under asking" is arithmetic. Bring the quote.
                </p>
              </Card>
              <Card title="Know the market number">
                <p>
                  This is what the leaderboard's market comparison is for: what similar cars actually list for, not
                  what one seller hopes. Arriving with a real comparable is worth more than any tactic.
                </p>
              </Card>
              <Card title="Be willing to leave">
                <p>
                  It is the only real leverage anyone has in any negotiation, and with cars it is genuinely true: there
                  is always another one. The buyer who cannot walk pays the most.
                </p>
              </Card>
              <Card title="Pay in a traceable way">
                <p>
                  A bank draft or a transfer, at a bank, in daylight. Not a large amount of cash in a parking lot. Get a
                  signed bill of sale at the moment money changes hands, not afterwards.
                </p>
              </Card>
            </div>
          </Section>

          {/* ---- walk away ---- */}
          <Section
            id="walkaway"
            eyebrow="12"
            title="When to stop and leave"
            lede="Not everything is negotiable. These are the ones where the right answer is to thank them and go."
          >
            <ul className="grid gap-x-8 sm:grid-cols-2">
              {[
                "The VIN doesn't match across the car and the paperwork.",
                "The seller's name isn't on the ownership.",
                "There's a lien on the vehicle that they won't clear before sale.",
                "You're refused an independent inspection.",
                "Structural rust: flaking or holes in frame rails, subframes or mounting points.",
                "Milky oil, or coolant and oil mixing anywhere.",
                "A warning light that never illuminates at all when you turn the key.",
                "The odometer reading conflicts with the history report or the wear.",
                "You're being rushed, or told someone else is on their way with cash.",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 border-t border-line py-3.5">
                  <span className="mt-0.5 font-bold text-bad" aria-hidden>
                    ✕
                  </span>
                  <span className="text-[15px] leading-relaxed text-text">{t}</span>
                </li>
              ))}
            </ul>
          </Section>

          {/* ---- maintain ---- */}
          <Section
            id="maintain"
            eyebrow="13"
            title="Keeping it alive once it's yours"
            lede="Most cars that die young are killed by neglect rather than age. Almost all of this is cheap, and the one expensive item on the list is the one that destroys engines when it's skipped."
          >
            <ServiceTimeline />

            <div className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-3">
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <p className="wide text-[16px] font-bold text-text">Winter tyres are not optional</p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  Below about 7°C, all-season rubber hardens and stops gripping. This is a physics problem, not a
                  driving-skill one. Mandatory in Quebec, and the single biggest safety difference you can buy.
                </p>
              </div>
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <p className="wide text-[16px] font-bold text-text">Wash the underside in spring</p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  Salt keeps working long after the snow goes. An underbody wash at the end of winter is a few dollars
                  and is the cheapest rust prevention there is.
                </p>
              </div>
              <div className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <p className="wide text-[16px] font-bold text-text">Keep every receipt</p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  A folder of service records is worth real money when you sell, and it is the difference between "it's
                  been looked after" and proving it.
                </p>
              </div>
            </div>
          </Section>
        </div>
      </div>

      {/* Close */}
      <div className="studio mt-20 rounded-[22px] border border-line p-8 text-center sm:p-14">
        <h2 className="display text-[clamp(1.75rem,3.5vw,2.75rem)] text-text">Now go and find one worth inspecting.</h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
          The leaderboard ranks what's listed right now on reliability, real market value, winter capability and running
          cost, so the shortlist you take this checklist to is already a good one.
        </p>
        <Link to="/" className="btn btn-primary mt-6">
          See the ranked listings
        </Link>
      </div>

      <p className="mt-10 text-center text-[13px] leading-relaxed text-faint">
        General guidance for first-time buyers in Canada, not professional advice. Requirements vary by province, and no
        checklist replaces an inspection by a licensed mechanic on a hoist.
      </p>
    </div>
  );
}
