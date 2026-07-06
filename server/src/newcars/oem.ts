/**
 * Generic OEM new-model scraper for sites that render their model pages
 * client-side (Toyota, Honda, Mazda, Subaru). These have no static structured
 * data, so we render the page with Playwright and read the year (from the H1),
 * the starting price (from the visible "from / starting at $NN,NNN"), a hero
 * image and inferred body/fuel. Needs Chromium — on hosts without it
 * (fetchWithPlaywright returns null) these simply contribute nothing, and the
 * browser-free Hyundai adapter still populates the tab.
 */

import * as cheerio from "cheerio";
import { fetchWithPlaywright } from "../scrapers/crawl";
import { LogFn } from "../scrapers/types";
import { NewCar } from "./types";

interface OemModel {
  make: string;
  model: string;
  url: string;
}

// A focused, first-car-relevant lineup across the four brands.
const OEM_MODELS: OemModel[] = [
  { make: "Toyota", model: "RAV4", url: "https://www.toyota.ca/toyota/en/vehicles/rav4/overview" },
  { make: "Toyota", model: "Corolla", url: "https://www.toyota.ca/toyota/en/vehicles/corolla/overview" },
  { make: "Toyota", model: "Camry", url: "https://www.toyota.ca/toyota/en/vehicles/camry/overview" },
  { make: "Honda", model: "Civic Sedan", url: "https://www.honda.ca/en/civic_sedan" },
  { make: "Honda", model: "Accord", url: "https://www.honda.ca/en/accord" },
  { make: "Honda", model: "CR-V", url: "https://www.honda.ca/en/crv" },
  { make: "Mazda", model: "CX-50", url: "https://www.mazda.ca/en/vehicles/cx-50/" },
  { make: "Mazda", model: "CX-5", url: "https://www.mazda.ca/en/vehicles/cx-5/" },
  { make: "Mazda", model: "Mazda3", url: "https://www.mazda.ca/en/vehicles/mazda3-sport/" },
  { make: "Subaru", model: "Forester", url: "https://www.subaru.ca/en/vehicles/forester" },
  { make: "Subaru", model: "Outback", url: "https://www.subaru.ca/en/vehicles/outback" },
  { make: "Subaru", model: "Crosstrek", url: "https://www.subaru.ca/en/vehicles/crosstrek" },
];

function inferBody(text: string): string | null {
  const t = text.toLowerCase();
  if (/\bpickup|truck\b/.test(t)) return "Truck";
  if (/\bhatchback\b/.test(t)) return "Hatchback";
  if (/\bsuv|crossover|sport utility\b/.test(t)) return "SUV";
  if (/\bsedan\b/.test(t)) return "Sedan";
  return null;
}

function inferFuel(text: string): string {
  const t = text.toLowerCase();
  if (/\belectric|\bev\b|battery electric|bz4x|solterra/.test(t)) return "Electric";
  if (/plug-?in hybrid|phev|prime/.test(t)) return "Plug-in Hybrid";
  if (/hybrid/.test(t)) return "Hybrid";
  return "Gas";
}

/** Parse a rendered OEM model page into a NewCar (exported for tests). */
export function parseOemRendered(m: OemModel, html: string): NewCar | null {
  const $ = cheerio.load(html);
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  const bodyText = $("body").text().replace(/\s+/g, " ");
  const head = `${h1} ${bodyText.slice(0, 600)}`;

  const year = Number((h1.match(/\b(20\d\d)\b/) || bodyText.match(/\b(20\d\d)\b/))?.[1] ?? 0) || new Date().getFullYear();

  // Only trust a price that's explicitly labelled as a starting/MSRP figure —
  // a bare "$NN,NNN" anywhere on these marketing pages is unreliable (finance
  // offers, top trims, comparisons).
  const priceStr = bodyText.match(
    /(?:starting(?:\s+at|\s+from)?|from|as low as|starting msrp|msrp of)[^$]{0,20}\$\s?([\d,]{5,})/i
  )?.[1];
  const price = priceStr ? Number(priceStr.replace(/,/g, "")) : null;

  const image =
    $('meta[property="og:image"]').attr("content") ??
    $('meta[name="twitter:image"]').attr("content") ??
    null;

  return {
    id: `${m.make}-${m.model}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    make: m.make,
    model: m.model,
    year,
    bodyType: inferBody(h1) ?? inferBody(bodyText),
    startingPriceCad: price && price > 12000 && price < 200000 ? price : null,
    engine: null,
    transmission: null,
    drivetrain: null,
    fuelType: inferFuel(head),
    fuelCapacity: null,
    exteriorColours: [],
    description: null,
    image,
    officialUrl: m.url,
    source: `${m.make} Canada`,
  };
}

export async function fetchOemNewCars(log: LogFn): Promise<NewCar[]> {
  const out: NewCar[] = [];
  // Sequential: Playwright renders one page at a time (small memory footprint),
  // and this runs in the background behind a 6h cache.
  for (const m of OEM_MODELS) {
    const html = await fetchWithPlaywright(m.url, log);
    if (!html) continue; // no browser on this host, or a nav failure
    const car = parseOemRendered(m, html);
    if (car) out.push(car);
  }
  dropSharedPrices(out);
  if (out.length) log("info", `OEM sites: ${out.length} model(s) rendered.`);
  return out;
}

/**
 * If two+ models from the same make share an identical price, it's almost
 * certainly a site-wide banner (e.g. a finance offer), not each car's MSRP —
 * clear it rather than show the same wrong number on every card.
 */
function dropSharedPrices(cars: NewCar[]): void {
  const counts = new Map<string, number>();
  for (const c of cars) {
    if (c.startingPriceCad != null) counts.set(`${c.make}|${c.startingPriceCad}`, (counts.get(`${c.make}|${c.startingPriceCad}`) ?? 0) + 1);
  }
  for (const c of cars) {
    if (c.startingPriceCad != null && (counts.get(`${c.make}|${c.startingPriceCad}`) ?? 0) > 1) {
      c.startingPriceCad = null;
    }
  }
}
