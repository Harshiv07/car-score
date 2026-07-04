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

test("extractListings tries strategies in order and never throws on garbage", () => {
  assert.deepEqual(extractListings(null), []);
  assert.deepEqual(extractListings("not html at all %%%"), []);
  assert.equal(extractListings(JSONLD_PAGE).length, 1);
});
