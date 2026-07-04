/**
 * AutoTrader.ca — national aggregator. Search pages per supported model.
 * AutoTrader server-renders result tiles and embeds result JSON, so the
 * static extractor usually works; a browser fallback covers the rest.
 */

import { VEHICLE_MODELS } from "../data/vehicleModels";
import { makeScraper } from "./genericScraper";

const SLUGS: Record<string, string> = {
  "Toyota RAV4": "toyota/rav4",
  "Toyota Corolla": "toyota/corolla",
  "Honda Civic": "honda/civic",
  "Honda CR-V": "honda/cr-v",
  "Mazda Mazda3": "mazda/3",
  "Mazda CX-5": "mazda/cx-5",
  "Hyundai Elantra": "hyundai/elantra",
  "Hyundai Tucson": "hyundai/tucson",
  "Subaru Forester": "subaru/forester",
  "Subaru Crosstrek": "subaru/crosstrek",
};

const urls = VEHICLE_MODELS.map((m) => SLUGS[`${m.make} ${m.model}`])
  .filter(Boolean)
  .map((slug) => `https://www.autotrader.ca/cars/${slug}/on/?rcp=15&rcs=0&srt=9&prx=-1&hprc=True&wcp=True`);

export const autotrader = makeScraper({
  key: "autotrader",
  source: "AutoTrader.ca",
  urls,
  meta: { province: "ON" },
  jsFallback: true,
});
