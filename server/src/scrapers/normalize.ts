/**
 * Turn a raw extracted record into a normalized `Listing`, or null if it
 * isn't one of the supported models / lacks the minimum viable fields
 * (year + price). All parsing is forgiving — scraped values arrive as
 * strings, numbers or free text.
 */

import { Drivetrain, FuelType, Listing } from "../types";
import { matchModelFromTitle, VehicleModelInfo } from "../data/vehicleModels";
import { finalizeListing } from "../util/listingKeys";
import { RawVehicleRecord } from "./types";

export function parseNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = String(v).replace(/[,\s]/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

export function parseYear(v: unknown, fallbackText?: string | null): number | null {
  for (const cand of [v, fallbackText]) {
    if (cand == null) continue;
    const m = String(cand).match(/\b(199\d|20[0-3]\d)\b/);
    if (m) return Number(m[1]);
  }
  return null;
}

export function parseKm(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v > 3000 ? v : null;
  const text = String(v);
  const m = text.match(/([\d,\s.]+)\s*(km|kms|kilomet)/i);
  if (m) {
    const n = parseNumber(m[1]);
    return n != null && n > 100 ? Math.round(n) : null;
  }
  return null;
}

export function inferDrivetrain(text: string | null | undefined): Drivetrain {
  const t = (text ?? "").toLowerCase();
  if (/awd|4wd|4x4|htrac|i-activ|all[- ]wheel|symmetrical|real ?time/.test(t)) return "AWD";
  if (/rwd|rear[- ]wheel/.test(t)) return "RWD";
  if (/fwd|front[- ]wheel|2wd/.test(t)) return "FWD";
  return "Unknown";
}

export function inferFuelType(text: string | null | undefined): FuelType {
  const t = (text ?? "").toLowerCase();
  if (/plug-?in|phev|hybrid/.test(t)) return "Hybrid";
  if (/electric|\bev\b/.test(t)) return "Electric";
  if (/diesel/.test(t)) return "Diesel";
  return "Gas";
}

const FEATURE_KEYWORDS = [
  "heated seats", "heated steering", "remote start", "sunroof", "moonroof",
  "apple carplay", "carplay", "android auto", "adaptive cruise", "blind spot",
  "lane keep", "leather", "navigation", "backup camera",
];

export function inferFeatures(text: string | null | undefined): string[] {
  const t = (text ?? "").toLowerCase();
  const found = new Set<string>();
  for (const kw of FEATURE_KEYWORDS) {
    if (t.includes(kw)) {
      found.add(kw === "carplay" ? "Apple CarPlay" : kw === "moonroof" ? "Sunroof" : kw.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }
  return [...found];
}

export interface NormalizeMeta {
  sourceWebsite: string;
  baseUrl: string;
  dealer?: string | null;
  city?: string | null;
  province?: string | null;
}

export function normalizeRecord(raw: RawVehicleRecord, meta: NormalizeMeta): Listing | null {
  const haystack = [raw.title, raw.name, raw.make, raw.model, raw.trim].filter(Boolean).join(" ");
  const info: VehicleModelInfo | null = matchModelFromTitle(haystack);
  if (!info) return null;

  const year = parseYear(raw.year, haystack);
  const price = parseNumber(raw.price);
  if (!year || !price || price < 3000 || price > 200000) return null;

  const combinedText = `${haystack} ${raw.drivetrain ?? ""}`;
  let url = raw.url ?? null;
  if (url && url.startsWith("/")) url = new URL(url, meta.baseUrl).toString();
  let image = raw.image ?? null;
  if (image && image.startsWith("/")) image = new URL(image, meta.baseUrl).toString();

  const trim =
    raw.trim && raw.trim.length <= 40
      ? raw.trim
      : extractTrim(haystack, info);

  return finalizeListing({
    title: `${year} ${info.make} ${info.model}${trim ? ` ${trim}` : ""}`,
    make: info.make,
    model: info.model,
    trim,
    year,
    drivetrain: inferDrivetrain(combinedText),
    engine: raw.engine ?? null,
    transmission: raw.transmission ?? null,
    fuelType: inferFuelType(combinedText),
    vin: raw.vin && /^[A-HJ-NPR-Z0-9]{11,17}$/i.test(raw.vin.trim()) ? raw.vin.trim().toUpperCase() : null,
    price: Math.round(price),
    mileageKm: parseKm(raw.km),
    fuelEconomy: parseNumber(raw.fuelEconomy),
    exteriorColour: raw.exteriorColour ?? null,
    interiorColour: raw.interiorColour ?? null,
    dealer: meta.dealer ?? null,
    isDealer: meta.dealer != null,
    city: meta.city ?? null,
    province: meta.province ?? null,
    sourceWebsite: meta.sourceWebsite,
    listingUrl: url,
    image,
    cpo: raw.cpo ?? /certified|cpo\b/i.test(haystack),
    warrantyMonths: null,
    warrantyNote: null,
    carfaxAvailable: raw.carfax ?? /carfax/i.test(haystack),
    accidentReported: /no accident|accident[- ]free|clean carfax/i.test(haystack) ? false : null,
    recalls: [],
    features: raw.features ?? inferFeatures(haystack),
  });
}

/** Best-effort trim: the words after the model name in the title. */
function extractTrim(title: string, info: VehicleModelInfo): string | null {
  const t = title.toLowerCase();
  for (const alias of info.aliases) {
    const i = t.indexOf(alias);
    if (i >= 0) {
      const rest = title.slice(i + alias.length).trim();
      const words = rest.split(/\s+/).slice(0, 3).join(" ").replace(/[|•·].*$/, "").trim();
      if (words && words.length <= 30 && !/\$|\d{5,}/.test(words)) return words;
      return null;
    }
  }
  return null;
}
