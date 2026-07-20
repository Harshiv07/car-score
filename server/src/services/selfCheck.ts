/**
 * Scraper self-check — a fast, network-independent way to confirm the scraping
 * pipeline (extract → normalize → score → store) is healthy. If this passes but
 * a live run finds nothing, the problem is the network/site (blocked datacenter
 * IP, markup change), not the code.
 *
 * Exposed three ways:
 *   - `verifyPipeline()`  — pure, used by tests and the CLI
 *   - `GET /api/scrape/selfcheck` — same result over HTTP
 *   - `npm run scrape:check -w server` — CLI wrapper (scripts/checkScraper.ts)
 */

import { extractListings } from "../scrapers/extract";
import { normalizeRecord } from "../scrapers/normalize";
import { scoreListing } from "../scoring/engine";
import { clutchToRaw } from "../scrapers/clutch";
import { convertusToRaw } from "../scrapers/convertus";
import { edealerToRaw } from "../scrapers/edealer";
import { cargurusTileToRaw } from "../scrapers/cargurus";
import { Listing } from "../types";

/** A supported model (Corolla) with a full JSON-LD record, plus an F-150 that
 *  must be dropped, plus a year-less Car that the strategy selection must not
 *  let shadow the usable ones. */
const FIXTURE_HTML = `<!doctype html><html><head>
<script type="application/ld+json">
[
  {"@type":"Car","name":"2021 Toyota Corolla LE","brand":"Toyota","model":"Corolla","vehicleModelDate":2021,
   "vehicleIdentificationNumber":"5YFEPMAE3MP200001","mileageFromOdometer":{"value":58000},
   "offers":{"price":20995},"url":"https://dealer.example.com/corolla-le"},
  {"@type":"Car","name":"2020 Honda CR-V EX AWD","brand":"Honda","model":"CR-V","vehicleModelDate":2020,
   "mileageFromOdometer":{"value":72000},"offers":{"price":26400},"url":"https://dealer.example.com/crv"},
  {"@type":"Car","name":"2019 Ford F-150 XLT","brand":"Ford","model":"F-150","vehicleModelDate":2019,
   "offers":{"price":31000},"url":"https://dealer.example.com/f150"}
]
</script></head><body></body></html>`;

/** A Clutch-API-shaped vehicle, to verify that mapping path too. */
const CLUTCH_FIXTURE = {
  year: 2022,
  mileage: 41000,
  make: { name: "Mazda" },
  model: { name: "CX-5" },
  trim: { name: "GS" },
  drivetrain: { name: "AWD" },
  fuelType: { name: "Gasoline" },
  cardPhotoUrl: "https://img.clutch.ca/x.jpg",
  ["vehiclePrice-ON"]: { price: 28990 },
};

export interface CheckStep {
  name: string;
  ok: boolean;
  detail: string;
}

export interface PipelineReport {
  ok: boolean;
  steps: CheckStep[];
}

export function verifyPipeline(): PipelineReport {
  const steps: CheckStep[] = [];
  const add = (name: string, ok: boolean, detail: string) => steps.push({ name, ok, detail });

  // 1. Extraction picks the usable strategy and finds all records.
  const raw = extractListings(FIXTURE_HTML);
  add("extract", raw.length === 3, `extracted ${raw.length} raw records (expected 3)`);

  // 2. Normalization keeps supported models with a year+price, drops the F-150.
  const meta = { sourceWebsite: "SelfCheck", baseUrl: "https://dealer.example.com", dealer: "SelfCheck" };
  const normalized = raw
    .map((r) => normalizeRecord(r, meta))
    .filter((l): l is Listing => l !== null);
  add(
    "normalize",
    normalized.length === 2 && normalized.every((l) => l.year > 0 && l.price > 0),
    `kept ${normalized.length} supported listings with year+price (expected 2: Corolla + CR-V)`
  );

  // 3. Clutch API mapping produces a valid supported listing.
  const clutchListing = normalizeRecord(clutchToRaw(CLUTCH_FIXTURE), {
    sourceWebsite: "Clutch.ca",
    baseUrl: "https://www.clutch.ca",
    dealer: "Clutch",
    province: "ON",
  });
  add(
    "clutch-map",
    !!clutchListing && clutchListing.make === "Mazda" && clutchListing.year === 2022 && clutchListing.mileageKm === 41000,
    clutchListing ? `mapped ${clutchListing.title} @ $${clutchListing.price}` : "Clutch mapping produced null"
  );

  // 3b. Convertus (dealer VMS API) mapping produces a valid supported listing.
  const convertusListing = normalizeRecord(
    convertusToRaw({ year: 2020, make: "Toyota", model: "RAV4", search_trim: "XLE", drive_train: "All Wheel Drive", fuel_type: "Gas", odometer: 48157, final_price: 30995, vin: "2T3R1RFV2LC102476" }),
    { sourceWebsite: "Wayne Toyota", baseUrl: "https://www.waynetoyota.com", dealer: "Wayne Toyota", province: "ON" }
  );
  add(
    "convertus-map",
    !!convertusListing && convertusListing.model === "RAV4" && convertusListing.drivetrain === "AWD" && convertusListing.vin === "2T3R1RFV2LC102476",
    convertusListing ? `mapped ${convertusListing.title} (${convertusListing.drivetrain})` : "Convertus mapping produced null"
  );

  // 3c. eDealer (Half-Way Motors Mazda-style) mapping produces a valid
  // supported listing, AND correctly rejects a text-prefix collision
  // (CX-50 is not our CX-5 — a real bug found live: a plain substring match
  // on "cx-5" matched inside "cx-50" until matchModelFromTitle was fixed).
  const edealerListing = normalizeRecord(
    edealerToRaw({ year: "2024", make: "Mazda", model: "CX-5", trim: "GT", driveTrain: "All Wheel Drive", fuelType: "Gasoline", mileage: "22000", price: 34998, vin: "JM3KFBCM4S0123456", detailUrl: "/used/vehicle/2024-mazda-cx-5-gt-id1.htm" }),
    { sourceWebsite: "Half-Way Motors Mazda", baseUrl: "https://example.com", dealer: "Half-Way Motors Mazda" }
  );
  const edealerFalsePositive = normalizeRecord(
    edealerToRaw({ year: "2025", make: "Mazda", model: "CX-50", trim: "GT", driveTrain: "All Wheel Drive", fuelType: "Gasoline", mileage: "12000", price: 42998, vin: "JM3KFBCM4S0999999", detailUrl: "/used/vehicle/2025-mazda-cx-50-gt-id2.htm" }),
    { sourceWebsite: "Half-Way Motors Mazda", baseUrl: "https://example.com", dealer: "Half-Way Motors Mazda" }
  );
  add(
    "edealer-map",
    !!edealerListing && edealerListing.model === "CX-5" && edealerListing.mileageKm === 22000 && edealerFalsePositive === null,
    edealerListing
      ? `mapped ${edealerListing.title} @ $${edealerListing.price}; correctly rejected CX-50 as not-CX-5: ${edealerFalsePositive === null}`
      : "eDealer mapping produced null"
  );

  // 3d. CarGurus (Scrapfly-rendered Remix tile) mapping produces a valid
  // supported listing with an exact-VDP url, not a generic search link.
  const cargurusListing = normalizeRecord(
    cargurusTileToRaw({
      data: {
        id: 449331565,
        vin: "2T3R1RFV2LC102476",
        localizedDrivetrain: "All-Wheel Drive",
        mileageData: { value: 74218 },
        priceData: { current: 36488 },
        ontologyData: { makeName: "Toyota", modelName: "RAV4", trimName: "Trail", carYear: 2021 },
      },
    })!,
    { sourceWebsite: "CarGurus.ca", baseUrl: "https://www.cargurus.ca", dealer: "SelfCheck Motors", province: "ON" }
  );
  add(
    "cargurus-map",
    !!cargurusListing &&
      cargurusListing.model === "RAV4" &&
      cargurusListing.mileageKm === 74218 &&
      cargurusListing.listingUrl === "https://www.cargurus.ca/details/449331565",
    cargurusListing ? `mapped ${cargurusListing.title} @ $${cargurusListing.price}` : "CarGurus mapping produced null"
  );

  // 4. Scoring yields a full 0–100 score for every normalized listing.
  const pool = [
    ...normalized,
    ...(clutchListing ? [clutchListing] : []),
    ...(convertusListing ? [convertusListing] : []),
    ...(edealerListing ? [edealerListing] : []),
    ...(cargurusListing ? [cargurusListing] : []),
  ];
  const scored = pool.map((l) => scoreListing(l, pool));
  const allScored =
    scored.length > 0 &&
    scored.every((s) => s && s.total >= 0 && s.total <= 100 && s.breakdown.length === 10);
  add("score", allScored, `scored ${scored.filter(Boolean).length}/${pool.length} listings in 0–100 with 10 categories`);

  return { ok: steps.every((s) => s.ok), steps };
}
