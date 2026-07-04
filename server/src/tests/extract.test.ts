import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJsonLd, extractStateBlob, extractCards, extractListings } from "../scrapers/extract";

const JSONLD_PAGE = `<!doctype html><html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "item": {
        "@type": "Car",
        "name": "2020 Toyota RAV4 XLE AWD",
        "brand": { "@type": "Brand", "name": "Toyota" },
        "model": "RAV4",
        "vehicleModelDate": "2020",
        "vehicleIdentificationNumber": "2T3P1RFV8LC081989",
        "mileageFromOdometer": { "@type": "QuantitativeValue", "value": 88000, "unitCode": "KMT" },
        "offers": { "@type": "Offer", "price": "25988", "priceCurrency": "CAD" },
        "url": "https://dealer.example.com/vehicles/2020-toyota-rav4/"
      }
    }
  ]
}
</script></head><body></body></html>`;

const NEXT_DATA_PAGE = `<!doctype html><html><body>
<script id="__NEXT_DATA__" type="application/json">
{"props":{"pageProps":{"results":[
  {"year":2019,"make":"Honda","model":"CR-V","trim":"EX","price":25396,"kilometers":95000,"driveTrain":"AWD","vin":"2HKRW2H85KH100001","vdpUrl":"/used/honda-crv-1"},
  {"year":2021,"make":"Mazda","model":"CX-5","trim":"GS","price":24990,"kilometers":74500,"driveTrain":"AWD","vin":null,"vdpUrl":"/used/mazda-cx5-2"}
]}}}
</script></body></html>`;

const CARDS_PAGE = `<!doctype html><html><body>
<div class="vehicle-card">
  <a href="/inventory/2021-hyundai-tucson-preferred-awd">2021 Hyundai Tucson Preferred AWD</a>
  <span class="price">$23,800</span>
  <span class="odo">60,000 km</span>
</div>
<div class="vehicle-card">
  <a href="/inventory/2020-subaru-crosstrek-touring">2020 Subaru Crosstrek Touring</a>
  <span class="price">$24,495</span>
  <span class="odo">69,000 km</span>
</div>
</body></html>`;

test("JSON-LD strategy extracts nested ItemList vehicles", () => {
  const rows = extractJsonLd(JSONLD_PAGE);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].make, "Toyota");
  assert.equal(rows[0].vin, "2T3P1RFV8LC081989");
  assert.equal(Number(rows[0].price), 25988);
  assert.equal(Number(rows[0].km), 88000);
});

test("state-blob strategy finds vehicle arrays in __NEXT_DATA__", () => {
  const rows = extractStateBlob(NEXT_DATA_PAGE);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].model, "CR-V");
  assert.equal(Number(rows[1].price), 24990);
});

test("DOM-card fallback finds year+price tiles", () => {
  const rows = extractCards(CARDS_PAGE);
  assert.ok(rows.length >= 2, `expected >=2 cards, got ${rows.length}`);
  assert.ok(rows.some((r) => (r.title ?? "").includes("Tucson")));
});

// AutoTrader-style page: a results wrapper whose class also matches the tile
// selector, containing several LONG tiles (>600 chars each — the old cap
// silently dropped these, which is why a live scrape found only 1 listing).
function longTile(year: number, model: string, slug: string, price: string): string {
  const filler =
    "Certified Pre-Owned One Owner No Accidents Heated Seats Apple CarPlay Android Auto " +
    "Adaptive Cruise Control Lane Keep Assist Blind Spot Monitoring Backup Camera Alloy Wheels " +
    "Bluetooth Push Button Start Keyless Entry Dual Zone Climate Remote Start Power Liftgate " +
    "Dealer Demo Fresh Trade Local Vehicle Winter Tires Included Financing Available OAC " +
    "Extended Warranty Available Certified Technicians 150 Point Inspection Free CARFAX Report " +
    "Price includes admin fee Call for details Book a test drive today Trade-ins welcome";
  return `<div class="result-item">
    <a href="/a/${slug}/">${year} Toyota ${model} XLE AWD</a>
    <span class="price-amount">$${price}</span>
    <span class="odometer">64,000 km</span>
    <p>${filler}</p>
  </div>`;
}

const AUTOTRADER_STYLE_PAGE = `<!doctype html><html><body>
<div class="search-results-wrapper listing-container">
  ${longTile(2021, "RAV4", "toyota-rav4-thunder-bay-1", "29,800")}
  ${longTile(2020, "RAV4", "toyota-rav4-barrie-2", "25,988")}
  ${longTile(2019, "RAV4", "toyota-rav4-toronto-3", "23,500")}
</div>
</body></html>`;

test("DOM-card fallback handles long tiles and skips the wrapper (AutoTrader regression)", () => {
  const rows = extractCards(AUTOTRADER_STYLE_PAGE);
  assert.equal(rows.length, 3, `expected all 3 long tiles, got ${rows.length}`);
  const urls = rows.map((r) => r.url).sort();
  assert.deepEqual(urls, [
    "/a/toyota-rav4-barrie-2/",
    "/a/toyota-rav4-thunder-bay-1/",
    "/a/toyota-rav4-toronto-3/",
  ]);
});

test("extractListings tries strategies in order and never throws on garbage", () => {
  assert.deepEqual(extractListings(null), []);
  assert.deepEqual(extractListings("not html at all %%%"), []);
  assert.equal(extractListings(JSONLD_PAGE).length, 1);
});

// AutoTrader regression: JSON-LD is served WITHOUT a per-listing year, so those
// records are structurally present but useless (normalize needs a year). The
// DOM cards carry the year in visible text. extractListings must prefer the
// strategy with the most USABLE (year+price) records, not the first non-empty
// one — otherwise a live run finds ~1 listing instead of a page full.
const YEARLESS_JSONLD_PLUS_CARDS = `<!doctype html><html><head>
<script type="application/ld+json">
[
  {"@type":"Car","name":"Toyota Corolla SE","brand":"Toyota","model":"Corolla","offers":{"price":24999}},
  {"@type":"Car","name":"Toyota Corolla LE","brand":"Toyota","model":"Corolla","offers":{"price":21988}},
  {"@type":"Car","name":"Toyota Corolla L","brand":"Toyota","model":"Corolla","offers":{"price":19995}}
]
</script></head><body>
<div class="vehicle-card"><a href="/a/1">2022 Toyota Corolla SE</a><span>$24,999</span><span>35,000 km</span></div>
<div class="vehicle-card"><a href="/a/2">2020 Toyota Corolla LE</a><span>$21,988</span><span>67,000 km</span></div>
<div class="vehicle-card"><a href="/a/3">2019 Toyota Corolla L</a><span>$19,995</span><span>72,000 km</span></div>
</body></html>`;

test("year-less JSON-LD must not shadow the year-bearing DOM cards", () => {
  const rows = extractListings(YEARLESS_JSONLD_PLUS_CARDS);
  assert.equal(rows.length, 3, "should keep 3 records");
  // The chosen strategy must be the cards: every record carries a real year.
  const withYear = rows.filter((r) => /\b20\d\d\b/.test(String(r.year) + " " + String(r.title)));
  assert.equal(withYear.length, 3, "all chosen records must have a usable year");
});
