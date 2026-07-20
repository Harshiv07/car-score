/**
 * Clutch is queried as ONE combined request listing all 5 makes + all 10
 * supported models; the API returns a mix of every model on each page, so one
 * paginated query covers all models even though the WAF only allows ~5 pages
 * before challenging. Verified live: the combined query returns totalCount≈778
 * spanning every supported model.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildAllModelsQueryUrl,
  buildModelsQueryUrl,
  clutch,
  MIN_PER_MODEL,
  MODEL_TARGETS,
  parseProductCard,
  productPageSlug,
  productPageUrl,
  shouldContinueViaBrowser,
} from "../scrapers/clutch";
import { VEHICLE_MODELS } from "../data/vehicleModels";

// No browser tier in unit tests: a WAF-blocked page would otherwise trigger a
// real Chromium launch (see crawl.ts's openBrowserSession), making the test
// slow + network-dependent. That path is verified live, not here.
process.env.SCRAPE_JS_FALLBACK = "0";

test("MODEL_TARGETS mirrors the scored models", () => {
  assert.equal(MODEL_TARGETS.length, VEHICLE_MODELS.length);
  assert.ok(MODEL_TARGETS.some((t) => t.make === "Mazda" && t.model === "CX-5"));
  assert.ok(MODEL_TARGETS.some((t) => t.make === "Mazda" && t.model === "Mazda3"));
  assert.ok(MODEL_TARGETS.some((t) => t.make === "Subaru" && t.model === "Forester"));
});

test("the combined query lists all 5 makes + 10 models in one request", () => {
  const params = new URL(buildAllModelsQueryUrl(0)).searchParams;
  assert.deepEqual([...new Set(params.getAll("makes[]"))].sort(), ["Honda", "Hyundai", "Mazda", "Subaru", "Toyota"]);
  assert.equal(params.getAll("models[]").length, 10);
  assert.ok(params.getAll("models[]").includes("CX-5"));
  assert.ok(params.getAll("models[]").includes("Crosstrek"));
  assert.equal(params.get("page"), "0");
  assert.equal(new URL(buildAllModelsQueryUrl(4)).searchParams.get("page"), "4");
});

test("the combined query sends exactly the params a real clutch.ca session sends — nothing extra", () => {
  // Regression: a stray non-standard param (e.g. a custom page size) is a
  // request shape no real browser produces, which is exactly what the WAF flags.
  const params = new URL(buildAllModelsQueryUrl(0)).searchParams;
  assert.deepEqual(
    [...new Set(params.keys())].sort(),
    ["downPayment", "interestRate", "isBiweekly", "makes[]", "models[]", "page"].sort()
  );
});

test(
  "paginates until the WAF challenges, keeps what it got, and covers every model (regression)",
  { timeout: 20_000 },
  async (t) => {
    // Each page returns a MIX of models (how the real combined query behaves).
    // Pages 0-1 succeed spanning all 10 models between them; page 2 is a 202
    // WAF challenge → stop and keep pages 0-1. Every model gets exactly 1
    // vehicle here (below MIN_PER_MODEL), so the top-up phase also fires —
    // one single-model request per model (length-1 models[]), always
    // distinguishable from a 10-model main-query page.
    const mainPagesFetched: number[] = [];
    t.mock.method(globalThis, "fetch", async (input: string | URL) => {
      const params = new URL(input).searchParams;
      const page = Number(params.get("page"));
      const requestedModels = params.getAll("models[]");
      if (requestedModels.length === 1) {
        // A top-up request: single model, gets the whole page to itself.
        const model = requestedModels[0];
        return new Response(
          JSON.stringify({
            page: 0,
            pageSize: 32,
            totalCount: 1,
            totalPages: 1,
            vehicles: [
              {
                id: 900,
                year: 2022,
                make: { name: MODEL_TARGETS.find((t2) => t2.model === model)!.make },
                model: { name: model },
                ["vehiclePrice-ON"]: { price: 21000 },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      mainPagesFetched.push(page);
      if (page >= 2) return new Response("", { status: 202 }); // WAF challenge, not "no results"
      const models = MODEL_TARGETS.slice(page * 5, page * 5 + 5); // pages 0,1 → all 10 models
      return new Response(
        JSON.stringify({
          page,
          pageSize: 32,
          totalCount: 320,
          totalPages: 10,
          vehicles: models.map((m, i) => ({
            id: page * 100 + i,
            year: 2022,
            make: { name: m.make },
            model: { name: m.model },
            ["vehiclePrice-ON"]: { price: 20000 + i },
          })),
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const result = await clutch.run(() => {});

    // Main pagination stops at the first WAF-challenged page (2), after
    // keeping 0-1.
    assert.deepEqual(mainPagesFetched, [0, 1, 2]);
    const models = new Set(result.listings.map((l) => `${l.make} ${l.model}`));
    assert.equal(models.size, 10, "every supported model must appear — the combined query mixes them across pages");
  }
);

test(
  "tops up models the main pagination left thin with one request per model, without re-querying models that already have enough (regression)",
  { timeout: 20_000 },
  async (t) => {
    // 3 "high-volume" models get well over MIN_PER_MODEL each across pages
    // 0-1; the other 7 get 1 each. Page 2 is WAF-challenged. A shared top-up
    // request would let one low model crowd out the rest (the bug this
    // replaced) — single-model requests can't, by construction.
    const HIGH = new Set(["RAV4", "Corolla", "Civic"]);
    const HIGH_PER_PAGE = Math.ceil(MIN_PER_MODEL / 2) + 4; // comfortably clears MIN_PER_MODEL across 2 pages
    const requests: { page: number; models: string[] }[] = [];

    t.mock.method(globalThis, "fetch", async (input: string | URL) => {
      const params = new URL(input).searchParams;
      const page = Number(params.get("page"));
      const requestedModels = params.getAll("models[]");
      requests.push({ page, models: requestedModels });

      if (requestedModels.length === 1) {
        // Top-up request: exactly one model, must never be an already-HIGH one.
        // Returns comfortably more than MIN_PER_MODEL, same as a real single-
        // model page (verified live: Forester → 13/13 in one page).
        const model = requestedModels[0];
        assert.ok(!HIGH.has(model), `top-up must never re-request an already-sufficient model (got ${model})`);
        const topUpCount = MIN_PER_MODEL + 5;
        return new Response(
          JSON.stringify({
            page: 0,
            pageSize: 32,
            totalCount: topUpCount,
            totalPages: 1,
            vehicles: Array.from({ length: topUpCount }, (_, j) => ({
              id: 6000 + j,
              year: 2022,
              make: { name: MODEL_TARGETS.find((t2) => t2.model === model)!.make },
              model: { name: model },
              ["vehiclePrice-ON"]: { price: 23000 + j },
            })),
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }

      if (page >= 2) return new Response("", { status: 202 });
      // Pages 0-1: HIGH_PER_PAGE vehicles for each HIGH model, 1 for everyone
      // else, split across the two pages (doesn't need to be exact, just consistent).
      const vehicles: unknown[] = [];
      let id = page * 1000;
      for (const t2 of MODEL_TARGETS) {
        const count = HIGH.has(t2.model) ? HIGH_PER_PAGE : 1; // x2 pages => well over MIN_PER_MODEL / ~1-2 low
        if (page === 1 && !HIGH.has(t2.model)) continue; // low models only appear on page 0
        for (let i = 0; i < count; i++) {
          // Price varies per vehicle — the dedupe key falls back to
          // year+make+model+trim+price+dealer when there's no VIN, so a fixed
          // price here would silently collapse all of a model's vehicles into 1.
          vehicles.push({ id: id++, year: 2022, make: { name: t2.make }, model: { name: t2.model }, ["vehiclePrice-ON"]: { price: 20000 + id } });
        }
      }
      return new Response(
        JSON.stringify({ page, pageSize: 32, totalCount: 320, totalPages: 10, vehicles }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    const result = await clutch.run(() => {});

    const counts = new Map<string, number>();
    for (const l of result.listings) counts.set(`${l.make} ${l.model}`, (counts.get(`${l.make} ${l.model}`) ?? 0) + 1);
    for (const t2 of MODEL_TARGETS) {
      const count = counts.get(`${t2.make} ${t2.model}`) ?? 0;
      if (HIGH.has(t2.model)) {
        assert.ok(count >= MIN_PER_MODEL, `${t2.model} already had enough (${count}) — must not be topped up further`);
      } else {
        assert.ok(
          count >= MIN_PER_MODEL,
          `${t2.model} was under-represented (had ~1) and must be topped up to a real sample, got ${count}`
        );
      }
    }

    const topUpCalls = requests.filter((r) => r.models.length === 1);
    assert.equal(topUpCalls.length, 7, "exactly one top-up request per under-represented model");
    const topUpModels = new Set(topUpCalls.map((r) => r.models[0]));
    assert.equal(topUpModels.size, 7, "each low model topped up exactly once, no duplicates");
    for (const m of topUpModels) assert.ok(!HIGH.has(m));
  }
);

test(
  "stops burning bare-fetch requests on the first WAF block during top-up, instead of retrying every remaining low model (regression)",
  { timeout: 20_000 },
  async (t) => {
    // Main pagination leaves every model at exactly 1 (all 10 are "low").
    // The very first top-up (single-model) request is WAF-blocked (202) —
    // with no browser fallback in unit tests (SCRAPE_JS_FALLBACK=0), the loop
    // must give up immediately rather than spending 9 more doomed requests.
    let topUpAttempts = 0;
    t.mock.method(globalThis, "fetch", async (input: string | URL) => {
      const params = new URL(input).searchParams;
      const page = Number(params.get("page"));
      const requestedModels = params.getAll("models[]");
      if (requestedModels.length === 1) {
        topUpAttempts++;
        return new Response("", { status: 202 });
      }
      if (page >= 1) return new Response("", { status: 202 });
      return new Response(
        JSON.stringify({
          page,
          pageSize: 32,
          totalCount: 10,
          totalPages: 10,
          vehicles: MODEL_TARGETS.map((m, i) => ({
            id: i,
            year: 2022,
            make: { name: m.make },
            model: { name: m.model },
            ["vehiclePrice-ON"]: { price: 20000 + i },
          })),
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });

    await clutch.run(() => {});
    assert.equal(topUpAttempts, 1, "must stop after the first blocked top-up request, not retry every low model");
  }
);

test("shouldContinueViaBrowser tries the browser tier even when page 0 itself was blocked (regression)", () => {
  // page 0 failing outright leaves totalPages at the unknown-default of 1 —
  // this must still say "try the browser," not "give up, it's unreachable"
  // (the bug: an earlier version special-cased this as "unreachable").
  assert.equal(shouldContinueViaBrowser(0, 1, true), true);
  // Finished naturally (consumed every real page) — nothing left to do.
  assert.equal(shouldContinueViaBrowser(5, 5, true), false);
  // Blocked partway through a known multi-page run — more pages remain.
  assert.equal(shouldContinueViaBrowser(2, 10, true), true);
  // Hit the page cap with more real pages left.
  assert.equal(shouldContinueViaBrowser(8, 20, true), true);
  // No browser available on this host (e.g. Render) — never attempt it.
  assert.equal(shouldContinueViaBrowser(0, 1, false), false);
  assert.equal(shouldContinueViaBrowser(2, 10, false), false);
});

test("productPageSlug/productPageUrl match clutch.ca's real URLs exactly", () => {
  // Every example is a URL the user pasted from browsing the live site.
  assert.equal(productPageSlug({ make: "Subaru", model: "Forester" }), "subaru-forester");
  assert.equal(productPageSlug({ make: "Toyota", model: "RAV4" }), "toyota-rav4");
  assert.equal(productPageSlug({ make: "Mazda", model: "Mazda3" }), "mazda-mazda3");
  assert.equal(productPageSlug({ make: "Mazda", model: "CX-5" }), "mazda-cx-5");
  assert.equal(productPageSlug({ make: "Honda", model: "CR-V" }), "honda-cr-v");
  assert.equal(productPageSlug({ make: "Honda", model: "Civic" }), "honda-civic");
  assert.equal(productPageSlug({ make: "Hyundai", model: "Elantra" }), "hyundai-elantra");

  assert.equal(productPageUrl({ make: "Subaru", model: "Forester" }, 1), "https://www.clutch.ca/cars/subaru-forester");
  assert.equal(productPageUrl({ make: "Hyundai", model: "Tucson" }, 2), "https://www.clutch.ca/cars/hyundai-tucson?page=2");
  assert.equal(productPageUrl({ make: "Toyota", model: "RAV4" }, 3), "https://www.clutch.ca/cars/toyota-rav4?page=3");
});

test("parseProductCard reads real clutch.ca card markup (regression, captured live)", () => {
  const target = { make: "Hyundai", model: "Elantra" };

  // A plain card.
  const plain = parseProductCard(
    {
      href: "/vehicles/110068",
      leaves: [
        "Compare",
        "favorite",
        "2022 Hyundai Elantra",
        "Preferred",
        "•",
        "40,410 km",
        "$20,290",
        "$144/biweekly",
        "$0 down",
        "$149 shipping",
        "Excl. HST & Licensing; Incl. OMVIC Fee",
      ],
    },
    target
  );
  assert.equal(plain?.year, 2022);
  assert.equal(plain?.make, "Hyundai");
  assert.equal(plain?.model, "Elantra");
  assert.equal(plain?.trim, "Preferred");
  assert.equal(plain?.km, 40410);
  assert.equal(plain?.price, 20290);
  assert.equal(plain?.url, "https://www.clutch.ca/vehicles/110068");

  // A sale card: two price leaves — must take the current (first) price, not
  // the strikethrough original.
  const sale = parseProductCard(
    {
      href: "/vehicles/101539",
      leaves: [
        "Compare",
        "Sale",
        "favorite",
        "2024 Hyundai Elantra",
        "Luxury",
        "•",
        "27,409 km",
        "$23,490",
        "$24,790",
        "$165/biweekly",
        "$0 down",
        "$149 shipping",
        "Excl. HST & Licensing; Incl. OMVIC Fee",
      ],
    },
    target
  );
  assert.equal(sale?.price, 23490, "must take the current price, not the strikethrough original");
  assert.equal(sale?.trim, "Luxury");

  // A "N+ views today" badge sits between "Compare" and "favorite" — must not
  // be mistaken for the trim.
  const withViewsBadge = parseProductCard(
    {
      href: "/vehicles/113383",
      leaves: [
        "Compare",
        "60+ views today",
        "favorite",
        "2021 Hyundai Elantra",
        "N Line",
        "•",
        "62,348 km",
        "$19,890",
        "$141/biweekly",
        "$0 down",
        "$149 shipping",
        "Excl. HST & Licensing; Incl. OMVIC Fee",
      ],
    },
    target
  );
  assert.equal(withViewsBadge?.trim, "N Line");
  assert.equal(withViewsBadge?.year, 2021);

  // A multi-word trim with punctuation.
  const complexTrim = parseProductCard(
    {
      href: "/vehicles/113912",
      leaves: [
        "Compare",
        "favorite",
        "2022 Hyundai Elantra",
        "Preferred w/Sun & Tech Package",
        "•",
        "117,044 km",
        "$17,990",
        "$129/biweekly",
        "$0 down",
        "$149 shipping",
        "Excl. HST & Licensing; Incl. OMVIC Fee",
      ],
    },
    target
  );
  assert.equal(complexTrim?.trim, "Preferred w/Sun & Tech Package");

  // No usable href → no listing (can't build a link).
  assert.equal(parseProductCard({ href: "", leaves: ["2022 Hyundai Elantra", "Preferred"] }, target), null);

  // No year leaf at all → not a vehicle card.
  assert.equal(parseProductCard({ href: "/vehicles/1", leaves: ["Compare", "favorite"] }, target), null);
});

test("buildModelsQueryUrl scopes to an arbitrary subset (used by the top-up phase)", () => {
  const subset = [
    { make: "Mazda", model: "Mazda3" },
    { make: "Subaru", model: "Forester" },
  ];
  const params = new URL(buildModelsQueryUrl(subset, 0)).searchParams;
  assert.deepEqual([...new Set(params.getAll("makes[]"))].sort(), ["Mazda", "Subaru"]);
  assert.deepEqual(params.getAll("models[]"), ["Mazda3", "Forester"]);
});
