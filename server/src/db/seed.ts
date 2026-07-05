/**
 * Seed listings — loaded on first run so the app is useful before the first
 * scrape. Carried over from CarScore V1's scraped snapshot (AutoTrader /
 * Clutch, Ontario) plus additional representative Canadian listings across
 * the supported models. A "Refresh Listings" run merges real scraped data on
 * top of these via the normal dedupe path.
 */

import { Drivetrain, FuelType, Listing } from "../types";
import { finalizeListing } from "../util/listingKeys";

interface SeedRow {
  make: string;
  model: string;
  trim: string | null;
  year: number;
  price: number;
  km: number | null;
  drivetrain: Drivetrain;
  fuelType?: FuelType;
  engine?: string;
  transmission?: string;
  extColour?: string;
  dealer?: string;
  city?: string;
  province?: string;
  source: string;
  url?: string;
  cpo?: boolean;
  warrantyMonths?: number;
  warrantyNote?: string;
  carfax?: boolean;
  accident?: boolean | null;
  features?: string[];
}

const rows: SeedRow[] = [
  // ---- Carried over from the V1 scrape snapshot ----
  { make: "Mazda", model: "CX-5", trim: "GS", year: 2021, price: 24990, km: 74500, drivetrain: "AWD",
    engine: "2.5L NA I4", transmission: "6-speed automatic", extColour: "Polymetal Grey",
    city: "Mississauga", province: "ON", source: "AutoTrader.ca", url: "https://www.autotrader.ca/cars/mazda/cx-5/",
    carfax: true, accident: false, features: ["Heated seats", "Apple CarPlay", "Android Auto", "Blind spot"] },
  { make: "Toyota", model: "RAV4", trim: "XLE", year: 2020, price: 25988, km: 88000, drivetrain: "AWD",
    engine: "2.5L NA I4", transmission: "8-speed automatic", extColour: "Magnetic Grey",
    city: "Barrie", province: "ON", source: "AutoTrader.ca", url: "https://www.autotrader.ca/cars/toyota/rav4/",
    carfax: true, accident: false, features: ["Heated seats", "Sunroof", "Apple CarPlay", "Adaptive cruise", "Lane keep"] },
  { make: "Toyota", model: "RAV4", trim: "LE", year: 2019, price: 28888, km: 61000, drivetrain: "AWD",
    engine: "2.5L NA I4", transmission: "8-speed automatic", extColour: "Blueprint",
    city: "Toronto", province: "ON", source: "AutoTrader.ca", url: "https://www.autotrader.ca/cars/toyota/rav4/",
    carfax: true, accident: false, features: ["Heated seats", "Apple CarPlay", "Adaptive cruise", "Lane keep"] },
  { make: "Honda", model: "CR-V", trim: "EX", year: 2019, price: 25396, km: 95000, drivetrain: "AWD",
    engine: "1.5L turbo I4", transmission: "CVT", extColour: "Crystal Black",
    city: "Hamilton", province: "ON", source: "AutoTrader.ca", url: "https://www.autotrader.ca/cars/honda/cr-v/",
    carfax: true, accident: false, features: ["Heated seats", "Remote start", "Sunroof", "Apple CarPlay", "Adaptive cruise"] },
  { make: "Honda", model: "CR-V", trim: "EX", year: 2019, price: 29000, km: 72000, drivetrain: "AWD",
    engine: "1.5L turbo I4", transmission: "CVT", extColour: "Platinum White",
    city: "Toronto", province: "ON", source: "AutoTrader.ca", url: "https://www.autotrader.ca/cars/honda/cr-v/",
    carfax: true, accident: false, features: ["Heated seats", "Remote start", "Sunroof", "Apple CarPlay", "Adaptive cruise"] },
  { make: "Mazda", model: "CX-5", trim: "GT", year: 2019, price: 29995, km: 68000, drivetrain: "AWD",
    engine: "2.5L NA I4", transmission: "6-speed automatic", extColour: "Soul Red Crystal",
    city: "Toronto", province: "ON", source: "AutoTrader.ca", url: "https://www.autotrader.ca/cars/mazda/cx-5/",
    carfax: true, accident: false, features: ["Heated seats", "Sunroof", "Apple CarPlay", "Blind spot", "Adaptive cruise"] },
  { make: "Mazda", model: "CX-5", trim: "GS", year: 2018, price: 19590, km: 89482, drivetrain: "AWD",
    engine: "2.5L NA I4", transmission: "6-speed automatic", extColour: "Deep Crystal Blue",
    dealer: "Clutch", city: "Etobicoke", province: "ON", source: "Clutch.ca", url: "https://www.clutch.ca/buy/mazda-cx-5",
    carfax: true, accident: false, warrantyMonths: 3, warrantyNote: "Clutch certified, 210-pt inspection",
    features: ["Heated seats", "Apple CarPlay", "Blind spot"] },
  { make: "Subaru", model: "Forester", trim: "2.5i", year: 2019, price: 19166, km: 120000, drivetrain: "AWD",
    engine: "2.5L boxer I4", transmission: "CVT", extColour: "Dark Grey",
    city: "Toronto", province: "ON", source: "AutoTrader.ca", url: "https://www.autotrader.ca/cars/subaru/forester/",
    carfax: true, accident: false, features: ["Heated seats", "Apple CarPlay", "Adaptive cruise", "X-Mode"] },

  // ---- Additional representative listings (dealers + aggregators) ----
  { make: "Toyota", model: "RAV4", trim: "XLE", year: 2021, price: 29800, km: 64000, drivetrain: "AWD",
    engine: "2.5L NA I4", transmission: "8-speed automatic", extColour: "Silver Sky",
    dealer: "Wayne Toyota", city: "Thunder Bay", province: "ON", source: "Wayne Toyota",
    url: "https://www.waynetoyota.com/vehicles/used/", cpo: true, warrantyMonths: 12,
    warrantyNote: "Toyota Certified — balance of factory powertrain", carfax: true, accident: false,
    features: ["Heated seats", "Apple CarPlay", "Adaptive cruise", "Lane keep", "Blind spot"] },
  { make: "Toyota", model: "Corolla", trim: "LE", year: 2021, price: 20995, km: 58000, drivetrain: "FWD",
    engine: "1.8L NA I4", transmission: "CVT", extColour: "Classic Silver",
    dealer: "Wayne Toyota", city: "Thunder Bay", province: "ON", source: "Wayne Toyota",
    url: "https://www.waynetoyota.com/vehicles/used/", cpo: true, warrantyMonths: 12,
    carfax: true, accident: false, features: ["Heated seats", "Apple CarPlay", "Adaptive cruise", "Lane keep"] },
  { make: "Toyota", model: "Corolla", trim: "SE", year: 2020, price: 19495, km: 84000, drivetrain: "FWD",
    engine: "2.0L NA I4", transmission: "CVT", extColour: "Blue Flame",
    city: "Ottawa", province: "ON", source: "CarGurus.ca", url: "https://www.cargurus.ca/",
    carfax: true, accident: false, features: ["Heated seats", "Apple CarPlay", "Adaptive cruise"] },
  { make: "Honda", model: "Civic", trim: "EX", year: 2020, price: 22990, km: 71000, drivetrain: "FWD",
    engine: "1.5L turbo I4", transmission: "CVT", extColour: "Modern Steel",
    dealer: "Gore Motors Honda", city: "Thunder Bay", province: "ON", source: "Gore Motors Honda",
    url: "https://www.goremotorshonda.com/vehicles/used/", carfax: true, accident: false,
    features: ["Heated seats", "Remote start", "Sunroof", "Apple CarPlay", "Adaptive cruise"] },
  { make: "Honda", model: "Civic", trim: "LX", year: 2021, price: 23490, km: 49000, drivetrain: "FWD",
    engine: "2.0L NA I4", transmission: "CVT", extColour: "Crystal Black",
    city: "London", province: "ON", source: "CarGurus.ca", url: "https://www.cargurus.ca/",
    carfax: true, accident: false, features: ["Heated seats", "Apple CarPlay", "Adaptive cruise", "Lane keep"] },
  { make: "Honda", model: "CR-V", trim: "LX AWD", year: 2020, price: 27900, km: 78000, drivetrain: "AWD",
    engine: "1.5L turbo I4", transmission: "CVT", extColour: "Sonic Grey",
    dealer: "Gore Motors Honda", city: "Thunder Bay", province: "ON", source: "Gore Motors Honda",
    url: "https://www.goremotorshonda.com/vehicles/used/", cpo: true, warrantyMonths: 24,
    warrantyNote: "Honda Certified — 7yr/160,000 km powertrain", carfax: true, accident: false,
    features: ["Heated seats", "Remote start", "Apple CarPlay", "Adaptive cruise"] },
  { make: "Mazda", model: "Mazda3", trim: "GS AWD", year: 2020, price: 21495, km: 67000, drivetrain: "AWD",
    engine: "2.5L NA I4", transmission: "6-speed automatic", extColour: "Machine Grey",
    dealer: "Half-Way Motors Mazda", city: "Thunder Bay", province: "ON", source: "Half-Way Motors Mazda",
    url: "https://www.halfwaymotorsmazda.com/vehicles/used/", carfax: true, accident: false,
    features: ["Heated seats", "Apple CarPlay", "Android Auto", "Adaptive cruise", "Blind spot"] },
  { make: "Mazda", model: "Mazda3", trim: "GX", year: 2019, price: 16990, km: 92000, drivetrain: "FWD",
    engine: "2.0L NA I4", transmission: "6-speed automatic", extColour: "Snowflake White",
    city: "Kitchener", province: "ON", source: "AutoTrader.ca", url: "https://www.autotrader.ca/cars/mazda/3/",
    carfax: true, accident: null, features: ["Apple CarPlay", "Android Auto"] },
  { make: "Hyundai", model: "Tucson", trim: "Preferred AWD", year: 2020, price: 21990, km: 83000, drivetrain: "AWD",
    engine: "2.0L NA I4", transmission: "6-speed automatic", extColour: "Magnetic Force",
    dealer: "Superior Hyundai", city: "Thunder Bay", province: "ON", source: "Superior Hyundai",
    url: "https://www.superiorhyundai.ca/vehicles/used/", carfax: true, accident: false,
    features: ["Heated seats", "Heated steering wheel", "Apple CarPlay", "Blind spot"] },
  { make: "Hyundai", model: "Tucson", trim: "Essential", year: 2021, price: 23800, km: 60000, drivetrain: "AWD",
    engine: "2.0L NA I4", transmission: "6-speed automatic", extColour: "White Cream",
    city: "Sudbury", province: "ON", source: "CarGurus.ca", url: "https://www.cargurus.ca/",
    carfax: true, accident: false, features: ["Heated seats", "Apple CarPlay", "Lane keep"] },
  { make: "Hyundai", model: "Elantra", trim: "Preferred", year: 2021, price: 17995, km: 55000, drivetrain: "FWD",
    engine: "2.0L NA I4", transmission: "IVT", extColour: "Fluid Metal",
    dealer: "Superior Hyundai", city: "Thunder Bay", province: "ON", source: "Superior Hyundai",
    url: "https://www.superiorhyundai.ca/vehicles/used/", carfax: true, accident: false,
    features: ["Heated seats", "Heated steering wheel", "Apple CarPlay", "Blind spot", "Lane keep"] },
  { make: "Subaru", model: "Crosstrek", trim: "Touring", year: 2020, price: 24495, km: 69000, drivetrain: "AWD",
    engine: "2.0L boxer I4", transmission: "CVT", extColour: "Cool Grey Khaki",
    city: "Ottawa", province: "ON", source: "AutoTrader.ca", url: "https://www.autotrader.ca/cars/subaru/crosstrek/",
    carfax: true, accident: false, features: ["Heated seats", "Apple CarPlay", "X-Mode", "Adaptive cruise"] },
  { make: "Subaru", model: "Crosstrek", trim: "Convenience", year: 2021, price: 26900, km: 47000, drivetrain: "AWD",
    engine: "2.0L boxer I4", transmission: "CVT", extColour: "Horizon Blue",
    city: "Winnipeg", province: "MB", source: "Clutch.ca", url: "https://www.clutch.ca/",
    carfax: true, accident: false, warrantyMonths: 3, warrantyNote: "Clutch certified, 210-pt inspection",
    features: ["Heated seats", "Apple CarPlay", "Android Auto", "X-Mode"] },
  { make: "Subaru", model: "Forester", trim: "Convenience", year: 2021, price: 27400, km: 52000, drivetrain: "AWD",
    engine: "2.5L boxer I4", transmission: "CVT", extColour: "Jasper Green",
    city: "Toronto", province: "ON", source: "CarGurus.ca", url: "https://www.cargurus.ca/",
    carfax: true, accident: false, features: ["Heated seats", "Apple CarPlay", "Adaptive cruise", "Lane keep", "X-Mode"] },
];

/**
 * Kept only so existing databases can be cleaned: the app no longer seeds
 * fabricated demo listings (users want to see scraped inventory only). The
 * dedupe keys are deterministic, so storage can delete any previously-seeded
 * rows on startup. Real scraped dealer cars carry a VIN → a different key.
 */
export const SEED_LISTINGS: Listing[] = rows.map((r) =>
  finalizeListing({
    title: `${r.year} ${r.make} ${r.model}${r.trim ? ` ${r.trim}` : ""}`,
    make: r.make,
    model: r.model,
    trim: r.trim,
    year: r.year,
    drivetrain: r.drivetrain,
    engine: r.engine ?? null,
    transmission: r.transmission ?? null,
    fuelType: r.fuelType ?? "Gas",
    vin: null,
    price: r.price,
    mileageKm: r.km,
    fuelEconomy: null,
    exteriorColour: r.extColour ?? null,
    interiorColour: null,
    dealer: r.dealer ?? null,
    isDealer: r.dealer != null,
    city: r.city ?? null,
    province: r.province ?? null,
    sourceWebsite: r.source,
    listingUrl: r.url ?? null,
    image: null,
    cpo: r.cpo ?? false,
    warrantyMonths: r.warrantyMonths ?? null,
    warrantyNote: r.warrantyNote ?? null,
    carfaxAvailable: r.carfax ?? false,
    accidentReported: r.accident ?? null,
    recalls: [],
    features: r.features ?? [],
  })
);

/** Deterministic dedupe keys of the old seed rows, for one-time cleanup. */
export const SEED_DEDUPE_KEYS: ReadonlySet<string> = new Set(SEED_LISTINGS.map((l) => l.dedupeKey));
