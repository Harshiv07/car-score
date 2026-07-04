import { Scraper } from "./types";
import { autotrader } from "./autotrader";
import { cargurus } from "./cargurus";
import { clutch } from "./clutch";
import { dealerScrapers } from "./dealer";

/** All registered scrapers, run in this order by the scrape service. */
export const scrapers: Scraper[] = [autotrader, cargurus, clutch, ...dealerScrapers];
