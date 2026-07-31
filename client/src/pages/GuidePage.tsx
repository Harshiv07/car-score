import { motion } from "framer-motion";
import { Link } from "react-router-dom";
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

const rise = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
};

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
    <section id={id} className="scroll-mt-24 pt-14">
      <motion.header {...rise} className="max-w-2xl">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">{eyebrow}</p>
        <h2 className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-tight text-text sm:text-3xl">
          {title}
        </h2>
        {lede && <p className="mt-3 text-sm leading-relaxed text-muted">{lede}</p>}
      </motion.header>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <motion.div {...rise} className="rounded-2xl border border-line bg-surface p-5">
      <h3 className="font-display text-base font-extrabold text-text">{title}</h3>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-muted">{children}</div>
    </motion.div>
  );
}

/** A cost line — the numbers a first buyer doesn't know to expect. */
function CostRow({ label, amount, note }: { label: string; amount: string; note: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text">{label}</p>
        <p className="text-xs text-muted">{note}</p>
      </div>
      <p className="nums shrink-0 text-sm font-bold text-brand">{amount}</p>
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
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      {/* Hero */}
      <motion.header
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="pt-10"
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand">First-car guide</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-text sm:text-6xl">
          Nobody teaches you
          <br />
          how to buy a car.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
          A score tells you which cars are worth your time. It can't stand in a parking lot with you while
          someone waits for an answer. This is the other half — what to look at, in what order, what the
          findings mean, and which ones are worth walking away over.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-faint">
          Written for a first buyer in Canada, so it assumes road salt, winter tyres and provincial paperwork.
          None of it replaces an independent mechanic — it's what gets you to the point of paying for one on
          a car worth inspecting.
        </p>
      </motion.header>

      {/* Contents */}
      <motion.nav
        {...rise}
        aria-label="On this page"
        className="mt-8 rounded-2xl border border-line bg-surface p-4"
      >
        <p className="text-[11px] font-bold uppercase tracking-wider text-faint">On this page</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {CONTENTS.map((c) => (
            <li key={c.id}>
              <a
                href={`#${c.id}`}
                className="inline-block rounded-lg bg-surface2 px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-brand"
              >
                {c.label}
              </a>
            </li>
          ))}
        </ul>
      </motion.nav>

      {/* ---- budget ---- */}
      <Section
        id="budget"
        eyebrow="01"
        title="The sticker price is about two-thirds of it"
        lede="The most common first-car mistake is spending the whole budget on the car. These are the costs that arrive in the first month, and they are the reason a $12,000 car and a $9,000 car can end up costing the same."
      >
        <motion.div {...rise} className="rounded-2xl border border-line bg-surface p-5">
          <CostRow label="Sales tax" amount="5–15%" note="Depends on province. In Ontario, 13% HST on the purchase price." />
          <CostRow label="Safety inspection certificate" amount="$80–150" note="Required to register a used car in most provinces." />
          <CostRow label="Insurance" amount="$150–400 / mo" note="A new driver pays the most. Get a real quote on the exact VIN before you commit." />
          <CostRow label="Registration and plates" amount="$60–200" note="One-off, plus annual renewal." />
          <CostRow label="Pre-purchase inspection" amount="$100–200" note="The best money in this entire list. Details below." />
          <CostRow label="Winter tyres" amount="$600–1,200" note="Not optional in most of Canada. Legally required in Quebec." />
          <CostRow label="First service and repairs" amount="$300–800" note="Assume the previous owner deferred something. They usually did." />
        </motion.div>

        <motion.div {...rise} className="mt-4 rounded-2xl border border-brand/30 bg-brand/5 p-5">
          <p className="text-sm leading-relaxed text-text">
            <span className="font-bold">A rule that holds up:</span> if the car costs everything you have, you
            cannot afford the car. Keep roughly 15% of your budget back for the first repair, because on a used
            car there is always a first repair.
          </p>
        </motion.div>
      </Section>

      {/* ---- before ---- */}
      <Section
        id="before"
        eyebrow="02"
        title="Before you go and look"
        lede="Ten minutes of this saves entire wasted afternoons, and it is where most of your negotiating leverage comes from."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Get an insurance quote first">
            <p>
              On the exact year, make, model and trim. Insurance for a new driver can cost more per year than the
              car does, and some models — anything with a sporty badge — are dramatically worse. Finding this out
              after you've paid is the expensive order to do it in.
            </p>
          </Card>
          <Card title="Look up the model, not the listing">
            <p>
              Search the model and year with the word "problems" or "common faults". Every car has a known list.
              You want to know whether this one eats transmissions before the seller tells you it's been "great".
            </p>
          </Card>
          <Card title="Pull the history report">
            <p>
              CARFAX Canada for accident and lien history. In Ontario the seller is legally required to provide a
              Used Vehicle Information Package (UVIP), which shows registration history and any liens. A lien
              means someone else has a claim on the car and it can be repossessed from you.
            </p>
          </Card>
          <Card title="Bring the right things">
            <p>
              A phone torch, a fridge magnet, a coin, and a friend. The magnet won't stick to body filler hiding
              rust or a repair. The friend presses the brake pedal while you check the lights, and talks you out
              of it when you fall in love with the wrong car.
            </p>
          </Card>
          <Card title="Go in daylight, in dry weather">
            <p>
              Rain hides paint defects and makes every car look shiny. Dusk hides everything. If a seller will
              only meet after dark, meet another day.
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

        <motion.div {...rise} className="mt-6 rounded-2xl border border-warn/30 bg-warn/5 p-5">
          <p className="text-sm leading-relaxed text-text">
            <span className="font-bold">A listing site is not a seller.</span> AutoTrader and CarGurus are
            noticeboards — a listing there can be a franchised dealer, an independent lot, or someone in a
            driveway, and the column that applies to you changes completely between them. This app shows the
            source it found a car on, which is not the same as who is selling it, so the first question on the
            phone is: <span className="font-semibold text-text">are you a registered dealer, or a private
            seller?</span>
          </p>
        </motion.div>
      </Section>

      {/* ---- the certified trap ---- */}
      <Section
        id="certified"
        eyebrow="04"
        title="Three different things are called &ldquo;certified&rdquo;"
        lede="This single word does more damage than any other in a used-car advert, because a seller can say it and mean any of the following — and none of them means what a first buyer assumes."
      >
        <CertifiedMeanings />

        <motion.div {...rise} className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-sm font-bold text-text">So ask the question precisely</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Not "is it certified?" but "does it come with a valid Safety Standards Certificate, and is there
              any warranty beyond that?" Those are two separate answers, and a vague reply to a precise question
              is itself information.
            </p>
          </div>
          <div className="rounded-2xl border border-bad/30 bg-bad/5 p-5">
            <p className="text-sm font-bold text-bad">&ldquo;Sold as-is&rdquo; is legal, and it means exactly what it says</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              A registered dealer may sell a car with no certificate and no warranty as long as it is clearly
              disclosed. You cannot plate it until it passes an inspection, and you pay for both the inspection
              and everything it fails on. Price an as-is car as if it needs $1,000 of work, because it might.
            </p>
          </div>
        </motion.div>
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
        <motion.p {...rise} className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">
          Also check the date. Every tyre carries a four-digit code on the sidewall — <span className="font-mono text-text">3223</span>{" "}
          means the 32nd week of 2023. Rubber hardens with age regardless of tread depth, and anything past about
          six years should be replaced whatever it looks like. Four tyres on a small car runs $600–900 fitted, so
          this is a real negotiating number, not a detail.
        </motion.p>
      </Section>

      {/* ---- rust ---- */}
      <Section
        id="rust"
        eyebrow="07"
        title="Rust is the Canadian tax"
        lede="Road salt means a structurally rusty car is common here and normal in an eight-year-old vehicle that lived outside. Surface rust on a bracket is cosmetic. Rust on structure is the end of the car."
      >
        <RustMap />
        <motion.div {...rise} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-sm font-bold text-good">Usually fine</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Orange surface film on the exhaust, suspension springs or brake discs. Brake discs rust overnight
              in a damp driveway and clean themselves on the first stop.
            </p>
          </div>
          <div className="rounded-2xl border border-bad/30 bg-bad/5 p-5">
            <p className="text-sm font-bold text-bad">Walk away</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Flaking, layered rust on frame rails, subframes or suspension mounting points. Anything that
              gives when pressed. Holes. This is structural, it fails safety inspection, and repairing it costs
              more than the car is worth.
            </p>
          </div>
        </motion.div>
      </Section>

      {/* ---- drive ---- */}
      <Section
        id="drive"
        eyebrow="08"
        title="The test drive"
        lede="Twenty minutes, with the radio off, on roads you choose — not the loop the seller suggests. You are listening, not enjoying it."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="From cold, before you move">
            <p>
              Watch the exhaust on startup. Blue smoke is burning oil, white smoke that doesn't clear can be
              coolant, black smoke is running rich. A puff of vapour on a cold morning is just condensation.
            </p>
          </Card>
          <Card title="Brakes">
            <p>
              On an empty road, brake firmly. The car should stop straight without pulling, the pedal should feel
              firm rather than spongy, and there should be no grinding. A pulsing pedal usually means warped
              discs.
            </p>
          </Card>
          <Card title="Steering and suspension">
            <p>
              On a straight, flat road, briefly loosen your grip. Drifting to one side means alignment at best.
              Over bumps, listen for knocks or clunks — those are suspension components, and they are labour.
            </p>
          </Card>
          <Card title="Transmission">
            <p>
              An automatic should shift without lurching or hesitating, including on the downshift as you slow.
              A manual should not slip when you accelerate in a high gear. Try reverse — a whine only in reverse
              is worth asking about.
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
              Leave it idling and look underneath for fresh drips. Then switch it off and restart it warm — a car
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Match the VIN in three places">
            <p>
              The dashboard by the windscreen, the sticker in the driver's door jamb, and the ownership document.
              All three must be identical. A mismatch means the car is not what the paperwork says it is — stop
              there.
            </p>
          </Card>
          <Card title="The seller's name must be on the ownership">
            <p>
              If the name doesn't match the person selling it, you are dealing with a curbsider — someone flipping
              cars privately while posing as a regular owner, without the obligations of a dealer. It is illegal
              in most provinces and you have almost no recourse.
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
              Needed to register and plate the car in most provinces. Agree in advance who pays for it and who
              fixes whatever it fails on — this is a common surprise bill.
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
        <motion.div {...rise} className="rounded-3xl border border-brand/30 bg-brand/5 p-6 sm:p-8">
          <p className="text-base leading-relaxed text-text">
            A pre-purchase inspection costs <span className="font-bold text-brand">$100–200</span> at an
            independent shop — not the seller's mechanic, and not the dealer selling it. They put it on a hoist,
            which is the only way anyone sees the things that actually end a car.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            It is the highest-return money in the whole process. Either it finds nothing and you buy with
            confidence, or it finds something and you have a written estimate to negotiate with — or a reason to
            walk. Spending $150 to avoid a $3,000 transmission is not a close call.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            <span className="font-semibold text-text">A seller who refuses is telling you something.</span> Any
            honest seller with a sound car has no reason to object. "I've got other people interested" in
            response to an inspection request is pressure, and pressure is the oldest tool in this trade.
          </p>
        </motion.div>
      </Section>

      {/* ---- negotiate ---- */}
      <Section
        id="negotiate"
        eyebrow="11"
        title="Negotiating with facts instead of nerve"
        lede="You don't need to be a confident haggler. You need a list and a number, which is what the previous sections were for."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Card title="Price the findings, don't describe them">
            <p>
              "The tyres are worn" invites an argument. "All four tyres are below 4mm and dated 2018, which is
              $780 fitted, so I can do $780 under asking" is arithmetic. Bring the quote.
            </p>
          </Card>
          <Card title="Know the market number">
            <p>
              This is what the leaderboard's market comparison is for — what similar cars actually list for, not
              what one seller hopes. Arriving with a real comparable is worth more than any tactic.
            </p>
          </Card>
          <Card title="Be willing to leave">
            <p>
              It is the only real leverage anyone has in any negotiation, and with cars it is genuinely true:
              there is always another one. The buyer who cannot walk pays the most.
            </p>
          </Card>
          <Card title="Pay in a traceable way">
            <p>
              A bank draft or a transfer, at a bank, in daylight. Not a large amount of cash in a parking lot.
              Get a signed bill of sale at the moment money changes hands, not afterwards.
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
        <motion.ul {...rise} className="grid gap-3 sm:grid-cols-2">
          {[
            "The VIN doesn't match across the car and the paperwork.",
            "The seller's name isn't on the ownership.",
            "There's a lien on the vehicle that they won't clear before sale.",
            "You're refused an independent inspection.",
            "Structural rust — flaking or holes in frame rails, subframes or mounting points.",
            "Milky oil, or coolant and oil mixing anywhere.",
            "A warning light that never illuminates at all when you turn the key.",
            "The odometer reading conflicts with the history report or the wear.",
            "You're being rushed, or told someone else is on their way with cash.",
          ].map((t) => (
            <li key={t} className="flex items-start gap-3 rounded-2xl border border-bad/25 bg-bad/5 p-4">
              <span className="mt-0.5 font-bold text-bad" aria-hidden>
                ✕
              </span>
              <span className="text-sm leading-relaxed text-text">{t}</span>
            </li>
          ))}
        </motion.ul>
      </Section>

      {/* ---- maintain ---- */}
      <Section
        id="maintain"
        eyebrow="13"
        title="Keeping it alive once it's yours"
        lede="Most cars that die young are killed by neglect rather than age. Almost all of this is cheap, and the one expensive item on the list is the one that destroys engines when it's skipped."
      >
        <ServiceTimeline />

        <motion.div {...rise} className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-display text-sm font-extrabold text-brand">Winter tyres are not optional</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Below about 7°C, all-season rubber hardens and stops gripping. This is a physics problem, not a
              driving-skill one. Mandatory in Quebec, and the single biggest safety difference you can buy.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-display text-sm font-extrabold text-brand">Wash the underside in spring</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Salt keeps working long after the snow goes. An underbody wash at the end of winter is a few
              dollars and is the cheapest rust prevention there is.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="font-display text-sm font-extrabold text-brand">Keep every receipt</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              A folder of service records is worth real money when you sell, and it is the difference between
              "it's been looked after" and proving it.
            </p>
          </div>
        </motion.div>
      </Section>

      {/* Close */}
      <motion.div {...rise} className="mt-16 rounded-3xl border border-line bg-surface p-6 text-center sm:p-10">
        <h2 className="font-display text-2xl font-extrabold tracking-tight text-text">
          Now go and find one worth inspecting.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
          The leaderboard ranks what's listed right now on reliability, real market value, winter capability and
          running cost — so the shortlist you take this checklist to is already a good one.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-xl bg-brand px-6 py-3 text-sm font-bold transition hover:bg-brand-strong"
          style={{ color: "var(--on-brand)" }}
        >
          See the ranked listings
        </Link>
      </motion.div>

      <p className="mt-10 text-center text-xs leading-relaxed text-faint">
        General guidance for first-time buyers in Canada, not professional advice. Requirements vary by province,
        and no checklist replaces an inspection by a licensed mechanic on a hoist.
      </p>
    </div>
  );
}
