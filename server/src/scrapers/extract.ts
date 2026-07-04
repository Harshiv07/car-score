/**
 * Pull raw vehicle records out of an inventory page's HTML.
 *
 * Three strategies, in order of reliability:
 *   1. JSON-LD (schema.org Vehicle/Car/Product) — most Canadian dealer
 *      platforms (EDealer, Convermax, DealerOn, Dealer.com) emit these.
 *   2. Embedded state blobs (__NEXT_DATA__, __INITIAL_STATE__, dataLayer) —
 *      heuristic deep-search for arrays of vehicle-shaped objects.
 *   3. DOM card fallback — nodes containing a year + a price.
 *
 * Defensive by design: always returns [] rather than throwing, so one bad
 * page never sinks a scrape run.
 */

import * as cheerio from "cheerio";
import { RawVehicleRecord } from "./types";

/* ---- strategy 1: JSON-LD ------------------------------------------------ */

function collectVehicles(node: unknown, out: Record<string, unknown>[]): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => collectVehicles(n, out));
    return;
  }
  const obj = node as Record<string, unknown>;
  const type = obj["@type"];
  const types = Array.isArray(type) ? type : [type];
  if (types.some((t) => /^(Car|Vehicle|Motorcycle|Product|IndividualProduct)$/i.test(String(t ?? "")))) {
    out.push(obj);
  }
  for (const k of ["itemListElement", "item", "mainEntity", "@graph", "offers", "hasVariant"]) {
    if (obj[k]) collectVehicles(obj[k], out);
  }
}

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "name" in (v as object)) return str((v as { name: unknown }).name);
  return null;
}

function fromJsonLd(node: Record<string, unknown>): RawVehicleRecord {
  const offersRaw = node.offers;
  const offers = (Array.isArray(offersRaw) ? offersRaw[0] : offersRaw) as
    | Record<string, unknown>
    | undefined;
  const price = offers?.price ?? offers?.lowPrice ?? node.price;
  const odo = node.mileageFromOdometer as { value?: unknown } | number | undefined;
  const km = odo != null && typeof odo === "object" ? odo.value : odo;
  const brand = str(node.brand);
  const model = str(node.model);
  const year = node.vehicleModelDate ?? node.modelDate ?? node.productionDate;
  const image = Array.isArray(node.image) ? node.image[0] : node.image;
  return {
    title: [year, brand, str(node.name), model].filter(Boolean).join(" "),
    name: str(node.name),
    make: brand,
    model,
    year,
    price,
    km,
    drivetrain: str(node.driveWheelConfiguration) ?? str(node.vehicleConfiguration),
    vin: str(node.vehicleIdentificationNumber) ?? str(node.sku) ?? str(node.productID),
    trim: str(node.vehicleConfiguration) ?? str(node.trim),
    url: str(node.url),
    image: str(image),
    exteriorColour: str(node.color) ?? str(node.vehicleExteriorColor),
    engine: str((node.vehicleEngine as Record<string, unknown> | undefined)?.name),
    transmission: str(node.vehicleTransmission),
  };
}

export function extractJsonLd(html: string): RawVehicleRecord[] {
  const $ = cheerio.load(html);
  const out: Record<string, unknown>[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).contents().text();
    if (!txt) return;
    try {
      collectVehicles(JSON.parse(txt), out);
    } catch {
      /* malformed block — skip */
    }
  });
  return out.map(fromJsonLd);
}

/* ---- strategy 2: embedded state blobs ----------------------------------- */

function looksLikeVehicle(o: unknown): boolean {
  if (!o || typeof o !== "object") return false;
  const keys = Object.keys(o as object).map((k) => k.toLowerCase());
  const has = (names: string[]) => names.some((n) => keys.includes(n));
  return (
    has(["year", "modelyear"]) &&
    has(["price", "internetprice", "sellingprice", "askingprice"]) &&
    has(["model", "modelname", "carmodel"])
  );
}

function deepFindVehicles(node: unknown, out: Record<string, unknown>[], depth: number): void {
  if (depth > 8 || !node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    if (node.length && looksLikeVehicle(node[0])) {
      node.forEach((v) => looksLikeVehicle(v) && out.push(v as Record<string, unknown>));
    } else {
      node.forEach((n) => deepFindVehicles(n, out, depth + 1));
    }
    return;
  }
  for (const v of Object.values(node)) deepFindVehicles(v, out, depth + 1);
}

function pick(o: Record<string, unknown>, names: string[]): unknown {
  for (const n of names) {
    for (const k of Object.keys(o)) {
      if (k.toLowerCase() === n) return o[k];
    }
  }
  return undefined;
}

export function extractStateBlob(html: string): RawVehicleRecord[] {
  const blobs: unknown[] = [];
  const patterns = [
    /<script[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/,
    /window\.__NEXT_DATA__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/,
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/,
    /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/,
    /dataLayer\s*=\s*(\[[\s\S]*?\])\s*;/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      try {
        blobs.push(JSON.parse(m[1]));
      } catch {
        /* skip */
      }
    }
  }
  const found: Record<string, unknown>[] = [];
  blobs.forEach((b) => deepFindVehicles(b, found, 0));
  return found.map((o) => ({
    title: [
      pick(o, ["year", "modelyear"]),
      pick(o, ["make", "makename"]),
      pick(o, ["model", "modelname", "carmodel"]),
      pick(o, ["trim", "trimname"]),
    ]
      .filter(Boolean)
      .join(" "),
    make: str(pick(o, ["make", "makename"])),
    model: str(pick(o, ["model", "modelname", "carmodel"])),
    year: pick(o, ["year", "modelyear"]),
    price: pick(o, ["price", "internetprice", "sellingprice", "askingprice"]),
    km: pick(o, ["km", "kilometers", "kilometres", "odometer", "mileage"]),
    drivetrain: str(pick(o, ["drivetrain", "drivetype", "drive"])),
    vin: str(pick(o, ["vin"])),
    trim: str(pick(o, ["trim", "trimname"])),
    url: str(pick(o, ["url", "vdpurl", "link"])),
    image: str(pick(o, ["image", "imageurl", "photo", "thumbnail"])),
    exteriorColour: str(pick(o, ["exteriorcolor", "exteriorcolour", "extcolor"])),
    transmission: str(pick(o, ["transmission", "transmissiontype"])),
    engine: str(pick(o, ["engine", "enginedescription"])),
  }));
}

/* ---- strategy 3: DOM card fallback --------------------------------------- */

export function extractCards(html: string): RawVehicleRecord[] {
  const $ = cheerio.load(html);
  const out: RawVehicleRecord[] = [];
  const seen = new Set<string>();
  const sel =
    '[class*="vehicle"],[class*="listing"],[class*="inventory"],[class*="result"],[class*="srp"],[class*="vcard"],article';
  const candidates = $(sel).toArray();
  const candidateSet = new Set(candidates);

  for (const el of candidates) {
    const $el = $(el);
    // Only take the innermost matching container: if a matching descendant
    // exists, this node is a wrapper (results grid, page shell) — skip it and
    // let the tile itself be processed. This is what lets us accept long
    // tiles (AutoTrader's run 1,000+ chars) without swallowing whole pages.
    const hasMatchingChild = $el.find(sel).toArray().some((child) => candidateSet.has(child));
    if (hasMatchingChild) continue;

    const text = $el.text().replace(/\s+/g, " ").trim();
    if (!text || text.length > 1500) continue;
    if (!/\b(199\d|20[0-3]\d)\b/.test(text)) continue;
    if (!/\$\s?\d{1,3}[,\d]{3,}/.test(text)) continue;

    const link = $el.find("a[href]").attr("href");
    // Dedupe by detail-page link when available — tiles for different cars
    // can share a text prefix (badges, dealer name), but never a VDP URL.
    const key = link || text.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);

    const priceMatch = text.match(/\$\s?(\d{1,3}(?:[,\s]\d{3})+)/);
    const img = $el.find("img[src]").attr("src");
    out.push({
      title: text.slice(0, 160),
      year: text,
      price: priceMatch ? priceMatch[1] : null,
      km: text,
      drivetrain: text,
      url: link || null,
      image: img || null,
    });
  }
  return out;
}

/**
 * A record is only worth keeping if a model year and a price can be recovered
 * from it — normalize drops anything missing either. Some sites (AutoTrader)
 * emit JSON-LD `Car` objects with a price but no year field; those records are
 * structurally present but useless, and must not shadow a later strategy (the
 * DOM cards) that *does* carry the year in visible text.
 */
function isUsable(r: RawVehicleRecord): boolean {
  const hasPrice = r.price != null && r.price !== "";
  const yearHaystack = [r.year, r.title, r.name, r.trim].filter(Boolean).join(" ");
  const hasYear = /\b(19\d\d|20[0-3]\d)\b/.test(yearHaystack);
  return hasPrice && hasYear;
}

/**
 * Run all three strategies (JSON-LD, state blob, DOM cards — in reliability
 * order) and keep the one that produces the most *usable* records. This beats
 * "first non-empty wins": AutoTrader emits year-less JSON-LD with a couple of
 * accidentally-usable rows, which would otherwise shadow the DOM cards that
 * carry the year for every tile. Reliability order breaks ties, and a strategy
 * with zero usable records is only used if nothing better exists.
 */
export function extractListings(html: string | null): RawVehicleRecord[] {
  if (!html) return [];
  let best: RawVehicleRecord[] = [];
  let bestUsable = -1;
  for (const fn of [extractJsonLd, extractStateBlob, extractCards]) {
    let rows: RawVehicleRecord[];
    try {
      rows = fn(html);
    } catch {
      continue;
    }
    if (!rows || rows.length === 0) continue;
    const usable = rows.filter(isUsable).length;
    // Strictly-greater keeps the earlier (more reliable) strategy on ties.
    if (usable > bestUsable) {
      best = rows;
      bestUsable = usable;
    }
  }
  return best;
}
