/**
 * CarGurus.ca — best-effort. Sits behind DataDome anti-bot; a datacenter IP
 * will normally get a challenge page, in which case this source simply
 * reports nothing and the run continues.
 */

import { makeScraper } from "./genericScraper";

const ZIP = "P7B"; // Thunder Bay
export const cargurus = makeScraper({
  key: "cargurus",
  source: "CarGurus.ca",
  urls: [
    `https://www.cargurus.ca/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?sourceContext=carGurusHomePageModel&zip=${ZIP}&distance=250`,
  ],
  meta: { province: "ON" },
  jsFallback: false, // DataDome blocks headless browsers too; not worth the cost
  bestEffort: true,
});
