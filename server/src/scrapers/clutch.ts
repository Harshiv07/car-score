/**
 * Clutch.ca — online used-car retailer. Next.js app: listing data lives in
 * the __NEXT_DATA__ blob, which the state-blob extractor picks up. Browser
 * fallback covers pages that hydrate client-side.
 */

import { makeScraper } from "./genericScraper";

const MODEL_PATHS = [
  "toyota-rav4", "toyota-corolla", "honda-civic", "honda-cr-v", "mazda-mazda3",
  "mazda-cx-5", "hyundai-elantra", "hyundai-tucson", "subaru-forester", "subaru-crosstrek",
];

export const clutch = makeScraper({
  key: "clutch",
  source: "Clutch.ca",
  urls: MODEL_PATHS.map((p) => `https://www.clutch.ca/buy/${p}`),
  meta: { dealer: "Clutch", province: "ON" },
  jsFallback: true,
  bestEffort: true,
});
