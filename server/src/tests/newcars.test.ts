/**
 * Hyundai new-car parsing — network-independent. Pulls specs from the page's
 * schema.org Car JSON-LD and the starting MSRP from the visible text.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHyundai } from "../newcars/hyundai";
import { parseOemRendered } from "../newcars/oem";

const PAGE = `<!doctype html><html><head>
<meta property="og:image" content="https://img.hyundai.ca/tucson.jpg">
<script type="application/ld+json">
{
 "@context": "https://schema.org",
 "@type": "Car",
 "name": "2026 Hyundai TUCSON",
 "brand": { "@type": "Brand", "name": "Hyundai" },
 "model": "TUCSON",
 "vehicleEngine": { "@type": "EngineSpecification", "name": "Smartstream 2.5L GDI 4-cylinder" },
 "vehicleTransmission": "8-speed Automatic",
 "driveWheelConfiguration": "AWD",
 "bodyType": "Compact SUV",
 "color": "Ash Black, Ultimate Red, Shimmering Silver",
 "fuelCapacity": "54L",
 "description": "A compact SUV with hybrid options."
}
</script></head><body>
<div class="pricing">Starting MSRP $35,099</div>
</body></html>`;

test("parses a Hyundai model page into a NewCar", () => {
  const car = parseHyundai("tucson", "https://www.hyundaicanada.com/en/showroom/tucson", PAGE);
  assert.ok(car);
  assert.equal(car!.id, "hyundai-tucson");
  assert.equal(car!.make, "Hyundai");
  assert.equal(car!.model, "Tucson");
  assert.equal(car!.year, 2026);
  assert.equal(car!.bodyType, "Compact SUV");
  assert.equal(car!.startingPriceCad, 35099);
  assert.equal(car!.transmission, "8-speed Automatic");
  assert.equal(car!.drivetrain, "AWD");
  assert.equal(car!.fuelCapacity, "54L");
  assert.deepEqual(car!.exteriorColours, ["Ash Black", "Ultimate Red", "Shimmering Silver"]);
  assert.equal(car!.image, "https://img.hyundai.ca/tucson.jpg");
  assert.equal(car!.officialUrl, "https://www.hyundaicanada.com/en/showroom/tucson");
});

test("infers Electric fuel type for EV models", () => {
  const evPage = PAGE.replace("2026 Hyundai TUCSON", "2025 IONIQ 5").replace("Compact SUV", "Electric SUV");
  const car = parseHyundai("ioniq-5", "https://www.hyundaicanada.com/en/showroom/ioniq-5", evPage);
  assert.equal(car!.fuelType, "Electric");
});

test("returns null when there is no Car JSON-LD", () => {
  assert.equal(parseHyundai("x", "https://x", "<html><body>no data</body></html>"), null);
});

const OEM_HTML = `<!doctype html><html><head>
<meta property="og:image" content="https://toyota.ca/rav4.jpg"></head>
<body><h1>2026 RAV4</h1>
<div class="hero">The RAV4 SUV. Starting from $35,962. Hybrid available.</div>
</body></html>`;

test("parses a rendered OEM (Toyota) page into a NewCar", () => {
  const car = parseOemRendered(
    { make: "Toyota", model: "RAV4", url: "https://www.toyota.ca/toyota/en/vehicles/rav4/overview" },
    OEM_HTML
  );
  assert.ok(car);
  assert.equal(car!.make, "Toyota");
  assert.equal(car!.model, "RAV4");
  assert.equal(car!.year, 2026);
  assert.equal(car!.startingPriceCad, 35962);
  assert.equal(car!.bodyType, "SUV");
  assert.equal(car!.image, "https://toyota.ca/rav4.jpg");
  assert.equal(car!.source, "Toyota Canada");
});

test("OEM parser leaves price null when the page has no price", () => {
  const car = parseOemRendered(
    { make: "Mazda", model: "CX-50", url: "https://www.mazda.ca/en/vehicles/cx-50/" },
    "<html><body><h1>2025 MAZDA CX-50</h1><p>A compact SUV.</p></body></html>"
  );
  assert.ok(car);
  assert.equal(car!.startingPriceCad, null);
  assert.equal(car!.bodyType, "SUV");
});
