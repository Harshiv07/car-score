/**
 * Hyundai Canada new-model scraper — browser-free.
 *
 * hyundaicanada.com/en/showroom/{slug} server-renders a schema.org `Car`
 * JSON-LD block (engine, transmission, drivetrain, body, colours, fuel) plus a
 * visible "Starting MSRP $NN,NNN". Both are in the static HTML, so this works
 * on hosts without a browser (unlike Toyota/Honda/Mazda/Subaru, which render
 * their model data client-side).
 */

import { BROWSER_HEADERS, fetchWithTimeout } from "../scrapers/config";
import { LogFn } from "../scrapers/types";
import { NewCar } from "./types";

const SOURCE = "Hyundai Canada";
const SLUGS = [
  "tucson", "santa-fe", "kona", "palisade", "venue", // SUVs
  "elantra", "sonata", // cars
  "ioniq-5", "kona-electric", // EVs
];

interface CarLd {
  name?: string;
  model?: string;
  brand?: { name?: string };
  vehicleEngine?: { name?: string };
  vehicleTransmission?: string;
  driveWheelConfiguration?: string;
  bodyType?: string;
  color?: string;
  fuelCapacity?: string;
  description?: string;
  image?: string | string[];
}

function firstCarLd(html: string): CarLd | null {
  const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const b of blocks) {
    const json = b.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
    if (/"@type"\s*:\s*"Car"/i.test(json)) {
      try {
        return JSON.parse(json) as CarLd;
      } catch {
        /* try next */
      }
    }
  }
  return null;
}

function meta(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)`, "i");
  return html.match(re)?.[1] ?? null;
}

function toTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bEv\b/, "EV");
}

function inferFuel(name: string, engine: string | null, body: string | null): string {
  const t = `${name} ${engine ?? ""} ${body ?? ""}`.toLowerCase();
  if (/electric|ioniq|\bev\b/.test(t)) return "Electric";
  if (/plug-?in|phev/.test(t)) return "Plug-in Hybrid";
  if (/hybrid/.test(t)) return "Hybrid";
  return "Gas";
}

/** Parse one showroom page's HTML into a NewCar (exported for tests). */
export function parseHyundai(slug: string, url: string, html: string): NewCar | null {
  const ld = firstCarLd(html);
  if (!ld?.name) return null;

  const name = ld.name.trim(); // "2026 Hyundai TUCSON"
  const yearMatch = name.match(/\b(20\d\d)\b/);
  const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
  const model = toTitle(ld.model ?? name.replace(/\b20\d\d\b/, "").replace(/hyundai/i, "").trim());
  const engine = ld.vehicleEngine?.name?.trim() ?? null;
  const body = ld.bodyType?.trim() ?? null;

  const priceStr =
    html.match(/[Ss]tarting\s+(?:MSRP|from|at)[^$]{0,20}\$?\s?([\d,]{4,})/)?.[1] ??
    html.match(/"startingPrice"\s*:\s*"?\$?([\d,]{4,})/i)?.[1] ??
    null;
  const startingPriceCad = priceStr ? Number(priceStr.replace(/,/g, "")) : null;

  const image =
    meta(html, "og:image") ??
    meta(html, "twitter:image") ??
    (Array.isArray(ld.image) ? ld.image[0] : ld.image) ??
    null;

  return {
    id: `hyundai-${slug}`,
    make: "Hyundai",
    model,
    year,
    bodyType: body,
    startingPriceCad: startingPriceCad && startingPriceCad > 10000 ? startingPriceCad : null,
    engine,
    transmission: ld.vehicleTransmission?.trim() ?? null,
    drivetrain: ld.driveWheelConfiguration?.trim() ?? null,
    fuelType: inferFuel(name, engine, body),
    fuelCapacity: ld.fuelCapacity?.trim() ?? null,
    exteriorColours: ld.color ? ld.color.split(",").map((c) => c.trim()).filter(Boolean) : [],
    description: ld.description?.trim() ?? null,
    image,
    officialUrl: url,
    source: SOURCE,
  };
}

export async function fetchHyundaiNewCars(log: LogFn, timeoutMs: number): Promise<NewCar[]> {
  const out: NewCar[] = [];
  for (const slug of SLUGS) {
    const url = `https://www.hyundaicanada.com/en/showroom/${slug}`;
    try {
      const res = await fetchWithTimeout(url, { headers: BROWSER_HEADERS, timeoutMs });
      if (!res.ok) continue;
      const car = parseHyundai(slug, url, await res.text());
      if (car) out.push(car);
    } catch (e) {
      log("warn", `Hyundai ${slug}: ${(e as Error).message.slice(0, 60)}`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  log("info", `${SOURCE}: ${out.length} model(s) fetched.`);
  return out;
}
