/**
 * The new-car lineup, served from a curated file.
 *
 * It used to be built at request time by fetching nine Hyundai pages in
 * sequence, rendering twelve manufacturer pages in a headless browser one at a
 * time, and looking up photos on Wikimedia. The first visitor after every
 * restart waited on all of it, and most of it came back without a price. Canadian
 * MSRPs change a few times a year and no API publishes them, so the honest
 * source is a reviewed file with a visible "prices as of" date.
 *
 * `buildCatalog` is pure and strict: bad data throws, and the module validates
 * the shipped file at import, so a typo in the JSON fails the boot and the test
 * run rather than putting a wrong price in front of a buyer.
 */

import raw from "../data/newCars.json";
import { scoreNewModel } from "../scoring/engine";
import { BODY_GROUPS, BodyGroup, NewCar, NewTrim, Powertrain, POWERTRAINS } from "./types";

export interface NewCarsResult {
  cars: NewCar[];
  /** ISO timestamp the prices are as of (the page's old `fetchedAt`). */
  fetchedAt: string;
  pricesAsOf: string;
  priceNote: string;
  /** Always false now: nothing loads in the background. Kept for the first version of the page. */
  loading: false;
}

const MIN_PRICE = 5_000;
const MAX_PRICE = 250_000;

const fail = (where: string, msg: string): never => {
  throw new Error(`newCars.json: ${where}: ${msg}`);
};

const slug = (make: string, model: string) => `${make}-${model}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function str(v: unknown, where: string): string {
  if (typeof v !== "string" || v.trim() === "") fail(where, "must be a non-empty string");
  return (v as string).trim();
}

function validTrim(t: unknown, where: string): NewTrim {
  const o = (t ?? {}) as Record<string, unknown>;
  const price = o.priceCad;
  if (price !== null && (typeof price !== "number" || !Number.isInteger(price) || price < MIN_PRICE || price > MAX_PRICE)) {
    fail(where, `priceCad must be null or a whole number between ${MIN_PRICE} and ${MAX_PRICE}, got ${String(price)}`);
  }
  if (!(POWERTRAINS as readonly unknown[]).includes(o.powertrain)) fail(where, `powertrain must be one of ${POWERTRAINS.join(", ")}`);
  const l100 = o.fuelEconomyL100;
  if (l100 != null && (typeof l100 !== "number" || l100 <= 0 || l100 > 30)) fail(where, "fuelEconomyL100 must be a number between 0 and 30");
  return {
    name: str(o.name, `${where}.name`),
    priceCad: price as number | null,
    powertrain: o.powertrain as Powertrain,
    drivetrain: o.drivetrain == null ? null : str(o.drivetrain, `${where}.drivetrain`),
    ...(l100 != null ? { fuelEconomyL100: l100 as number } : {}),
  };
}

function validCar(m: unknown, index: number): NewCar {
  const o = (m ?? {}) as Record<string, unknown>;
  const make = str(o.make, `models[${index}].make`);
  const model = str(o.model, `models[${index}].model`);
  const where = `${make} ${model}`;
  const year = o.year;
  if (typeof year !== "number" || !Number.isInteger(year) || year < 2020 || year > 2035) fail(where, "year must be a plausible model year");
  if (!(BODY_GROUPS as readonly unknown[]).includes(o.bodyGroup)) fail(where, `bodyGroup must be one of ${BODY_GROUPS.join(", ")}`);
  const seats = o.seats;
  if (seats !== null && (typeof seats !== "number" || !Number.isInteger(seats) || seats < 2 || seats > 9)) fail(where, "seats must be null or 2-9");
  const officialUrl = str(o.officialUrl, `${where}.officialUrl`);
  if (!/^https:\/\//.test(officialUrl)) fail(where, "officialUrl must be an https URL");
  const image = o.image == null ? null : str(o.image, `${where}.image`);
  if (image && !/^https:\/\//.test(image)) fail(where, "image must be an https URL");
  if (!Array.isArray(o.trims)) fail(where, "trims must be an array (empty when no price is confirmed)");

  const trims = (o.trims as unknown[]).map((t, i) => validTrim(t, `${where}.trims[${i}]`));
  const names = new Set<string>();
  for (const t of trims) {
    if (names.has(t.name)) fail(where, `duplicate trim "${t.name}"`);
    names.add(t.name);
  }
  trims.sort((a, b) => (a.priceCad ?? Infinity) - (b.priceCad ?? Infinity));

  const priced = trims.map((t) => t.priceCad).filter((p): p is number => p != null);
  const fuels = [...new Set(trims.map((t) => t.powertrain))].sort(
    (a, b) => POWERTRAINS.indexOf(a) - POWERTRAINS.indexOf(b)
  );
  const drivetrains = [...new Set(trims.map((t) => t.drivetrain).filter((d): d is string => d != null))];
  const economies = trims.map((t) => t.fuelEconomyL100).filter((e): e is number => e != null);
  const source = str(o.priceSource, `${where}.priceSource`);
  const drivetrain = drivetrains.length ? drivetrains.join(", ") : null;

  return {
    id: slug(make, model),
    make,
    model,
    year: year as number,
    bodyType: str(o.bodyType, `${where}.bodyType`),
    bodyGroup: o.bodyGroup as BodyGroup,
    seats: seats as number | null,
    fuels,
    drivetrains,
    trims,
    startingPriceCad: priced.length ? Math.min(...priced) : null,
    fuelEconomyL100: economies.length ? Math.min(...economies) : null,
    image,
    officialUrl,
    priceSource: source,
    score: scoreNewModel(make, model, drivetrain),
    drivetrain,
    fuelType: fuels.length ? fuels.join(", ") : null,
    engine: null,
    transmission: null,
    fuelCapacity: null,
    exteriorColours: [],
    description: null,
    source: `${make} Canada`,
  };
}

export interface Catalog {
  pricesAsOf: string;
  priceNote: string;
  cars: NewCar[];
}

/** Validate and shape the file. Throws on anything a buyer could be misled by. */
export function buildCatalog(file: unknown): Catalog {
  const f = (file ?? {}) as Record<string, unknown>;
  const pricesAsOf = str(f.pricesAsOf, "pricesAsOf");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pricesAsOf) || Number.isNaN(Date.parse(pricesAsOf))) fail("pricesAsOf", "must be a YYYY-MM-DD date");
  if (f.currency !== "CAD") fail("currency", "must be CAD");
  const priceNote = str(f.priceNote, "priceNote");
  if (!Array.isArray(f.models) || f.models.length === 0) fail("models", "must be a non-empty array");

  const cars = (f.models as unknown[]).map((m, i) => validCar(m, i));
  const seen = new Set<string>();
  for (const c of cars) {
    if (seen.has(c.id)) fail(`${c.make} ${c.model}`, "duplicate model");
    seen.add(c.id);
  }
  // Best score first within each make, makes alphabetical, then by name.
  cars.sort((a, b) => a.make.localeCompare(b.make) || (b.score ?? -1) - (a.score ?? -1) || a.model.localeCompare(b.model));
  return { pricesAsOf, priceNote, cars };
}

/** Built once at import: instant to serve, and a bad file stops the server booting. */
const catalog = buildCatalog(raw);

export function getNewCars(): NewCarsResult {
  return {
    cars: catalog.cars,
    fetchedAt: new Date(`${catalog.pricesAsOf}T00:00:00Z`).toISOString(),
    pricesAsOf: catalog.pricesAsOf,
    priceNote: catalog.priceNote,
    loading: false,
  };
}
