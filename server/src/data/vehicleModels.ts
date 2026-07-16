/**
 * Vehicle model knowledge base — the "intelligence" behind the scoring engine.
 *
 * One entry per supported model (the only models the scrapers keep). Ratings
 * are 0–5 unless noted and are grounded in Consumer Reports / RepairPal-style
 * reliability data, NRCan fuel figures, IIHS/NHTSA results and Canadian used
 * market behaviour for the 2018–2023 generations a first-time buyer shops.
 *
 * `market` is the fallback price model used when the database doesn't yet
 * hold enough comparable listings: price(year) = anchorPrice shifted by
 * annualDepreciation per model year away from anchorYear, adjusted for km.
 */

export interface KnownIssue {
  title: string;
  severity: "minor" | "moderate" | "major";
  note?: string;
}

export interface VehicleModelInfo {
  make: string;
  model: string;
  /** lower-case substrings used to match scraped titles to this model */
  aliases: string[];
  body: string;
  reliability: {
    consumerReports: number;
    repairPal: number;
    engine: number;
    transmission: number;
    summary: string;
  };
  ownership: {
    fuelCombLper100km: number;
    maintAnnualCad: number;
    insuranceTier: number; // 5 = cheapest to insure
    repairRisk: number; // 5 = lowest expected repair cost
    partsAvailability: number;
  };
  winter: {
    awd: "standard" | "optional" | "none";
    groundClearanceMm: number;
    winterReliability: number;
    traction: number;
  };
  safety: {
    iihs: number;
    nhtsaStars: number;
    adasNote: string;
  };
  resale: number;
  recallsAndIssues: {
    openRecallRisk: number; // 5 = low risk of outstanding recalls / costly failures
    issues: KnownIssue[];
  };
  typicalFeatures: string[];
  pros: string[];
  cons: string[];
  market: {
    anchorYear: number;
    anchorPriceCad: number;
    annualDepreciation: number; // fraction per year, e.g. 0.07
  };
  expectedKmPerYear: number;
}

const KM_PER_YEAR = 16000; // Canadian average annual mileage

export const VEHICLE_MODELS: VehicleModelInfo[] = [
  {
    make: "Toyota",
    model: "RAV4",
    aliases: ["rav4", "rav-4", "rav 4"],
    body: "Compact SUV",
    reliability: {
      consumerReports: 4.5,
      repairPal: 4.0,
      engine: 5,
      transmission: 4.5,
      summary: "Class benchmark. 2.5L NA + 8-speed auto is a proven, low-stress combo.",
    },
    ownership: {
      fuelCombLper100km: 8.3,
      maintAnnualCad: 429,
      insuranceTier: 5,
      repairRisk: 5,
      partsAvailability: 5,
    },
    winter: { awd: "optional", groundClearanceMm: 211, winterReliability: 5, traction: 4 },
    safety: {
      iihs: 5,
      nhtsaStars: 5,
      adasNote: "Toyota Safety Sense 2.0 standard from 2019: pre-collision, lane keep, adaptive cruise.",
    },
    resale: 5,
    recallsAndIssues: {
      openRecallRisk: 4,
      issues: [
        { title: "2019 fuel-pump recall", severity: "moderate", note: "Verify recall completed." },
        { title: "2019–20 engine-casting porosity recall", severity: "moderate" },
        { title: "Roof-rail water leaks", severity: "minor" },
        { title: "Early-2019 transmission lurch", severity: "minor", note: "Software fix applied from 2020." },
      ],
    },
    typicalFeatures: ["Heated seats", "Apple CarPlay", "Android Auto", "Adaptive cruise", "Blind spot (XLE+)"],
    pros: ["Excellent resale", "Cheap maintenance", "Reliable engine", "Strong AWD availability"],
    cons: ["Firm ride", "Road noise", "Priced at a premium used"],
    market: { anchorYear: 2021, anchorPriceCad: 30500, annualDepreciation: 0.07 },
    expectedKmPerYear: KM_PER_YEAR,
  },
  {
    make: "Toyota",
    model: "Corolla",
    aliases: ["corolla"],
    body: "Sedan",
    reliability: {
      consumerReports: 5,
      repairPal: 4.5,
      engine: 5,
      transmission: 4.5,
      summary: "Bulletproof. 1.8L NA + CVT with launch gear has near-zero pattern failures.",
    },
    ownership: {
      fuelCombLper100km: 7.1,
      maintAnnualCad: 362,
      insuranceTier: 5,
      repairRisk: 5,
      partsAvailability: 5,
    },
    winter: { awd: "none", groundClearanceMm: 132, winterReliability: 5, traction: 2 },
    safety: {
      iihs: 5,
      nhtsaStars: 5,
      adasNote: "Toyota Safety Sense 2.0 standard: pre-collision, lane keep, adaptive cruise.",
    },
    resale: 5,
    recallsAndIssues: { openRecallRisk: 5, issues: [] },
    typicalFeatures: ["Apple CarPlay", "Adaptive cruise", "Lane keep", "Heated seats (LE+)"],
    pros: ["Cheapest to own", "Top resale", "Excellent fuel economy"],
    cons: ["FWD only — budget winter tires", "Modest power", "Tight rear seat"],
    market: { anchorYear: 2021, anchorPriceCad: 21500, annualDepreciation: 0.065 },
    expectedKmPerYear: KM_PER_YEAR,
  },
  {
    make: "Honda",
    model: "Civic",
    aliases: ["civic"],
    body: "Sedan",
    reliability: {
      consumerReports: 4.5,
      repairPal: 4.5,
      engine: 4.5,
      transmission: 4,
      summary: "Excellent. 2.0L NA is the safest pick; 1.5T is solid with fresh oil changes.",
    },
    ownership: {
      fuelCombLper100km: 7.0,
      maintAnnualCad: 400,
      insuranceTier: 4,
      repairRisk: 5,
      partsAvailability: 5,
    },
    winter: { awd: "none", groundClearanceMm: 127, winterReliability: 4, traction: 2 },
    safety: {
      iihs: 5,
      nhtsaStars: 5,
      adasNote: "Honda Sensing standard from 2019: collision mitigation, lane keep, adaptive cruise.",
    },
    resale: 5,
    recallsAndIssues: {
      openRecallRisk: 4,
      issues: [
        { title: "1.5T oil dilution in cold climates", severity: "moderate", note: "Prefer 2.0L NA or verify TSB done." },
        { title: "2016–18 A/C condenser failures", severity: "minor" },
        { title: "Fuel-pump recall (Denso)", severity: "moderate", note: "Verify recall completed." },
      ],
    },
    typicalFeatures: ["Apple CarPlay", "Android Auto", "Heated seats", "Adaptive cruise", "Remote start (EX+)"],
    pros: ["Best-in-class resale", "Great fuel economy", "Fun to drive"],
    cons: ["FWD only — budget winter tires", "Low ground clearance", "Road noise"],
    market: { anchorYear: 2021, anchorPriceCad: 24500, annualDepreciation: 0.065 },
    expectedKmPerYear: KM_PER_YEAR,
  },
  {
    make: "Honda",
    model: "CR-V",
    aliases: ["cr-v", "crv", "cr v"],
    body: "Compact SUV",
    reliability: {
      consumerReports: 4,
      repairPal: 4,
      engine: 3.5,
      transmission: 3.5,
      summary: "Good overall; the 1.5T + CVT needs a clean maintenance history in cold climates.",
    },
    ownership: {
      fuelCombLper100km: 8.0,
      maintAnnualCad: 407,
      insuranceTier: 4,
      repairRisk: 4,
      partsAvailability: 5,
    },
    winter: { awd: "optional", groundClearanceMm: 198, winterReliability: 4, traction: 4 },
    safety: {
      iihs: 5,
      nhtsaStars: 5,
      adasNote: "Honda Sensing standard: collision mitigation, lane keep, adaptive cruise.",
    },
    resale: 5,
    recallsAndIssues: {
      openRecallRisk: 3,
      issues: [
        { title: "1.5T oil dilution (worse in cold/short trips)", severity: "major", note: "Remote start and highway use mitigate; verify oil level history." },
        { title: "2017–19 parasitic battery drain", severity: "minor" },
        { title: "Fuel-pump recall", severity: "moderate", note: "Verify recall completed." },
        { title: "CVT judder TSB", severity: "moderate" },
      ],
    },
    typicalFeatures: ["Heated seats", "Apple CarPlay", "Remote start (EX+)", "Adaptive cruise", "Blind spot info"],
    pros: ["Roomiest cabin and cargo in class", "Most efficient AWD", "Excellent resale"],
    cons: ["1.5T oil dilution risk in deep cold", "CVT feel", "Infotainment lag"],
    market: { anchorYear: 2021, anchorPriceCad: 29500, annualDepreciation: 0.07 },
    expectedKmPerYear: KM_PER_YEAR,
  },
  {
    make: "Mazda",
    model: "Mazda3",
    aliases: ["mazda3", "mazda 3", "mazda-3"],
    body: "Sedan",
    reliability: {
      consumerReports: 4.5,
      repairPal: 4.5,
      engine: 5,
      transmission: 5,
      summary: "Excellent. 2.5L NA + conventional 6-speed auto — no CVT, no turbo stress.",
    },
    ownership: {
      fuelCombLper100km: 8.0,
      maintAnnualCad: 433,
      insuranceTier: 4,
      repairRisk: 4,
      partsAvailability: 4,
    },
    winter: { awd: "optional", groundClearanceMm: 140, winterReliability: 4, traction: 3 },
    safety: {
      iihs: 5,
      nhtsaStars: 5,
      adasNote: "i-Activsense standard from 2019: smart brake support, lane keep, adaptive cruise.",
    },
    resale: 4,
    recallsAndIssues: {
      openRecallRisk: 4,
      issues: [
        { title: "Premature front brake wear", severity: "minor" },
        { title: "Infotainment glitches on early units", severity: "minor" },
      ],
    },
    typicalFeatures: ["Heated seats", "Apple CarPlay", "Android Auto", "Adaptive cruise", "Sunroof (GT)"],
    pros: ["Only AWD sedan in class", "Upscale interior", "Conventional automatic"],
    cons: ["Snug rear seat", "Average resale vs Toyota/Honda", "Firm ride"],
    market: { anchorYear: 2021, anchorPriceCad: 21500, annualDepreciation: 0.085 },
    expectedKmPerYear: KM_PER_YEAR,
  },
  {
    make: "Mazda",
    model: "CX-5",
    aliases: ["cx-5", "cx5", "cx 5"],
    body: "Compact SUV",
    reliability: {
      consumerReports: 4.5,
      repairPal: 4,
      engine: 4,
      transmission: 5,
      summary: "Very good. NA 2.5L + 6-speed auto; check 2018–19 heads for the cracking TSB.",
    },
    ownership: {
      fuelCombLper100km: 8.9,
      maintAnnualCad: 447,
      insuranceTier: 4,
      repairRisk: 4,
      partsAvailability: 4,
    },
    winter: { awd: "optional", groundClearanceMm: 193, winterReliability: 4, traction: 4 },
    safety: {
      iihs: 5,
      nhtsaStars: 5,
      adasNote: "i-Activsense widely standard: smart brake support, blind spot, adaptive cruise.",
    },
    resale: 4,
    recallsAndIssues: {
      openRecallRisk: 3,
      issues: [
        { title: "2018–19 non-turbo 2.5L cylinder-head cracking", severity: "major", note: "Resolved in 2021; verify TSB/repair history on 2018–19." },
        { title: "Infotainment ghost-touch", severity: "minor" },
        { title: "Soul Red paint chipping", severity: "minor" },
        { title: "Fuel-pump / PCM recalls", severity: "moderate", note: "Verify recalls completed." },
      ],
    },
    typicalFeatures: ["Heated seats", "Apple CarPlay", "Android Auto", "Blind spot", "Sunroof (GT)"],
    pros: ["Premium interior for the money", "i-Activ AWD is winter-strong", "Best value compact SUV"],
    cons: ["Thirstier than rivals", "Smaller cargo area", "Average resale"],
    market: { anchorYear: 2021, anchorPriceCad: 26500, annualDepreciation: 0.08 },
    expectedKmPerYear: KM_PER_YEAR,
  },
  {
    make: "Hyundai",
    model: "Elantra",
    aliases: ["elantra"],
    body: "Sedan",
    reliability: {
      consumerReports: 4,
      repairPal: 4.5,
      engine: 3.5,
      transmission: 4,
      summary: "Good. 2.0 Nu MPI is generally reliable; verify engine-related recalls done.",
    },
    ownership: {
      fuelCombLper100km: 7.4,
      maintAnnualCad: 452,
      insuranceTier: 5,
      repairRisk: 4,
      partsAvailability: 4,
    },
    winter: { awd: "none", groundClearanceMm: 140, winterReliability: 4, traction: 2 },
    safety: {
      iihs: 5,
      nhtsaStars: 5,
      adasNote: "SmartSense on most trims: forward collision, lane keep; adaptive cruise on upper trims.",
    },
    resale: 3,
    recallsAndIssues: {
      openRecallRisk: 3,
      issues: [
        { title: "Catalytic-converter / engine recalls on some years", severity: "moderate", note: "Verify all campaigns completed." },
        { title: "IVT software updates", severity: "minor" },
      ],
    },
    typicalFeatures: ["Heated seats", "Heated steering wheel", "Apple CarPlay", "Android Auto", "Blind spot"],
    pros: ["Cheapest entry price", "Well equipped for the money", "Low insurance"],
    cons: ["Weak resale", "FWD only — budget winter tires", "Average driving feel"],
    market: { anchorYear: 2021, anchorPriceCad: 18500, annualDepreciation: 0.1 },
    expectedKmPerYear: KM_PER_YEAR,
  },
  {
    make: "Hyundai",
    model: "Tucson",
    aliases: ["tucson"],
    body: "Compact SUV",
    reliability: {
      consumerReports: 4,
      repairPal: 4,
      engine: 3,
      transmission: 4,
      summary: "Good chassis; engine history matters — 2.4L Theta II needs the knock-sensor campaign verified.",
    },
    ownership: {
      fuelCombLper100km: 9.6,
      maintAnnualCad: 426,
      insuranceTier: 4,
      repairRisk: 3,
      partsAvailability: 4,
    },
    winter: { awd: "optional", groundClearanceMm: 172, winterReliability: 4, traction: 4 },
    safety: {
      iihs: 5,
      nhtsaStars: 5,
      adasNote: "SmartSense: forward collision, lane keep, blind spot; adaptive cruise on upper trims.",
    },
    resale: 3,
    recallsAndIssues: {
      openRecallRisk: 2,
      issues: [
        { title: "2.4L Theta II oil consumption / knock-sensor campaign", severity: "major", note: "Verify campaign completed; 2.0 Nu base engine less affected." },
        { title: "2019–21 ABS module / engine-fire recalls", severity: "major", note: "Confirm all recalls completed before purchase." },
      ],
    },
    typicalFeatures: ["Heated seats", "Heated steering wheel", "Apple CarPlay", "Blind spot", "Remote start (Luxury+)"],
    pros: ["Lower resale = cheaper entry", "HTRAC AWD strong in winter", "Long warranty when newer"],
    cons: ["Engine-recall homework required", "Thirstiest in class", "Weak resale"],
    market: { anchorYear: 2021, anchorPriceCad: 23500, annualDepreciation: 0.1 },
    expectedKmPerYear: KM_PER_YEAR,
  },
  {
    make: "Subaru",
    model: "Forester",
    aliases: ["forester"],
    body: "Compact SUV",
    reliability: {
      consumerReports: 4,
      repairPal: 3.5,
      engine: 3.5,
      transmission: 3.5,
      summary: "Good from 2019+ (FB engine + updated CVT); check oil-consumption history.",
    },
    ownership: {
      fuelCombLper100km: 8.2,
      maintAnnualCad: 632,
      insuranceTier: 4,
      repairRisk: 3,
      partsAvailability: 4,
    },
    winter: { awd: "standard", groundClearanceMm: 220, winterReliability: 5, traction: 5 },
    safety: {
      iihs: 5,
      nhtsaStars: 5,
      adasNote: "EyeSight standard on CVT models: pre-collision, adaptive cruise, lane keep.",
    },
    resale: 4,
    recallsAndIssues: {
      openRecallRisk: 4,
      issues: [
        { title: "Oil consumption on earlier FB engines", severity: "moderate", note: "2019+ largely resolved; check history." },
        { title: "Cold-start timing rattle", severity: "minor" },
      ],
    },
    typicalFeatures: ["Heated seats", "Apple CarPlay", "Android Auto", "Adaptive cruise (EyeSight)", "X-Mode"],
    pros: ["Best pure winter capability", "Standard symmetrical AWD", "Great visibility"],
    cons: ["Highest maintenance cost here", "CVT drone", "Modest power"],
    market: { anchorYear: 2021, anchorPriceCad: 27500, annualDepreciation: 0.08 },
    expectedKmPerYear: KM_PER_YEAR,
  },
  {
    make: "Subaru",
    model: "Crosstrek",
    aliases: ["crosstrek", "xv crosstrek"],
    body: "Subcompact SUV",
    reliability: {
      consumerReports: 4.5,
      repairPal: 4,
      engine: 4,
      transmission: 4,
      summary: "Very good, especially 2019+; the 2.0L is slow but durable with the updated CVT.",
    },
    ownership: {
      fuelCombLper100km: 7.9,
      maintAnnualCad: 600,
      insuranceTier: 4,
      repairRisk: 4,
      partsAvailability: 4,
    },
    winter: { awd: "standard", groundClearanceMm: 220, winterReliability: 5, traction: 5 },
    safety: {
      iihs: 5,
      nhtsaStars: 5,
      adasNote: "EyeSight on CVT models: pre-collision, adaptive cruise, lane keep.",
    },
    resale: 5,
    recallsAndIssues: {
      openRecallRisk: 4,
      issues: [
        { title: "Early FB20 oil consumption", severity: "moderate", note: "Mostly pre-2019; check history." },
        { title: "Weak 12V batteries (2019–20)", severity: "minor" },
      ],
    },
    typicalFeatures: ["Heated seats", "Apple CarPlay", "Android Auto", "X-Mode", "Adaptive cruise (EyeSight)"],
    pros: ["Standard AWD + 220mm clearance", "Holds value extremely well", "Cheap on fuel for an AWD"],
    cons: ["Slow (152 hp)", "Subaru maintenance costs", "Small cargo area"],
    market: { anchorYear: 2021, anchorPriceCad: 26000, annualDepreciation: 0.075 },
    expectedKmPerYear: KM_PER_YEAR,
  },
];

/** "Toyota RAV4" → info, keyed lookup */
const byKey = new Map(VEHICLE_MODELS.map((m) => [`${m.make} ${m.model}`.toLowerCase(), m]));

export function getModelInfo(make: string, model: string): VehicleModelInfo | null {
  return byKey.get(`${make} ${model}`.toLowerCase()) ?? null;
}

/**
 * Real dealer/site data occasionally names a DIFFERENT model that happens to
 * share a scored model's alias as a text prefix or whole-word match — e.g. a
 * "CX-50" is not our "CX-5" (a plain `.includes("cx-5")` matched it anyway:
 * "cx-50" contains "cx-5" as a substring), and a "Corolla Cross" is not our
 * "Corolla" (a genuinely different Toyota model/platform, and this one IS
 * still a whole, word-bounded match of "corolla" so boundary-checking alone
 * can't catch it — it needs an explicit exclusion). Keyed by "make model"
 * lowercase.
 */
const FALSE_POSITIVE_FOLLOWERS: Record<string, RegExp> = {
  "toyota corolla": /\bcorolla\s*cross\b/i,
};

/** Does `alias` occur in `text` as a real token — not as a text-prefix of a
 *  longer, different token (e.g. "cx-5" inside "cx-50")? */
function aliasMatches(text: string, alias: string): boolean {
  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${escaped}(?![a-z0-9])`, "i").test(text);
}

/**
 * Match a free-form scraped title (e.g. "2020 Toyota RAV4 XLE AWD") to a
 * supported model. Returns null for anything we don't score — those listings
 * are dropped by the crawler.
 */
export function matchModelFromTitle(title: string): VehicleModelInfo | null {
  const t = title.toLowerCase();
  const eligible = (m: VehicleModelInfo) => !FALSE_POSITIVE_FOLLOWERS[`${m.make} ${m.model}`.toLowerCase()]?.test(t);
  for (const m of VEHICLE_MODELS) {
    if (!t.includes(m.make.toLowerCase()) || !eligible(m)) continue;
    if (m.aliases.some((a) => aliasMatches(t, a))) return m;
  }
  // Mazda3 listings sometimes omit a space ("Mazda3") which already matches,
  // but CX-5 style names can appear without the make word ("CX-5 GT").
  for (const m of VEHICLE_MODELS) {
    if (!eligible(m)) continue;
    if (m.aliases.some((a) => a.length > 3 && aliasMatches(t, a))) return m;
  }
  return null;
}
