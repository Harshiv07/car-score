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
  // DataDome usually blocks plain headless Chromium too, but a residential IP
  // (local dev) or a stealth rendering service sometimes passes — try once.
  jsFallback: true,
  bestEffort: true,
});
