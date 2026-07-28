/**
 * Clutch's tiny, shared, per-IP WAF budget (~3-4 requests) is spent in phases
 * for maximum COVERAGE: Phase 1 fetches ONE combined all-models page for
 * breadth, then Phase 2 spends the rest of the budget on single-model queries
 * for the models that came back thin, RAREST FIRST (each single-model page
 * returns that model's complete inventory — verified live: Forester 13/13).
 * These tests drive `clutch.run()` with a mocked `fetch` (no browser tier —
 * SCRAPE_JS_FALLBACK=0) to lock in that budget-allocation behavior.
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

// Builds a mocked `fetch` for clutch.run(): the combined all-models query
// (10 models[]) returns page 0 with `combinedCounts[model]` vehicles each;
// single-model queries (1 models[]) return `single(model)` — or, if that's a
// number, a 202 block. Records what got fetched for assertions.
function mockClutchFetch(
  t: { mock: { method: typeof import("node:test").mock.method } },
  opts: {
    combinedCounts: (model: string) => number;
    single: (model: string, attemptIndex: number) => number | { count: number };
  }
) {
  const combinedPages: number[] = [];
  const singleModels: string[] = [];
  const vehiclesFor = (model: string, count: number, base: number) =>
    Array.from({ length: count }, (_, j) => ({
      id: base + j,
      year: 2022,
      make: { name: MODEL_TARGETS.find((x) => x.model === model)!.make },
      model: { name: model },
      // Price varies per vehicle: the dedupe key falls back to
      // year+make+model+trim+price+dealer without a VIN, so a fixed price
      // would silently collapse a model's vehicles into one.
      ["vehiclePrice-ON"]: { price: 20000 + base + j },
    }));

  t.mock.method(globalThis, "fetch", async (input: string | URL) => {
    const params = new URL(input).searchParams;
    const requested = params.getAll("models[]");
    if (requested.length === 1) {
      const model = requested[0];
      const attemptIndex = singleModels.length;
      singleModels.push(model);
      const r = opts.single(model, attemptIndex);
      if (typeof r === "number") return new Response("", { status: r }); // e.g. 202 block
      return new Response(
        JSON.stringify({ page: 0, pageSize: 32, totalCount: r.count, totalPages: 1, vehicles: vehiclesFor(model, r.count, 9000 + attemptIndex * 100) }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    const page = Number(params.get("page"));
    combinedPages.push(page);
    let id = 0;
    const vehicles: unknown[] = [];
    for (const m of MODEL_TARGETS) vehicles.push(...vehiclesFor(m.model, opts.combinedCounts(m.model), (id += 1000)));
    return new Response(
      JSON.stringify({ page, pageSize: 32, totalCount: 300, totalPages: 10, vehicles }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  });

  return { combinedPages, singleModels };
}

test(
  "Phase 1 fetches ONE combined page for breadth, Phase 2 fills every model with one single-model request (regression)",
  { timeout: 20_000 },
  async (t) => {
    // Combined page 0 seeds all 10 models at 1 each (below MIN); each then
    // gets one single-model fill to a real sample. Crucially: NO deeper
    // combined pages are fetched — that budget goes to the per-model fills.
    const { combinedPages, singleModels } = mockClutchFetch(t, {
      combinedCounts: () => 1,
      single: () => ({ count: MIN_PER_MODEL + 5 }),
    });

    const result = await clutch.run(() => {});

    assert.deepEqual(combinedPages, [0], "only ONE combined page — deeper pages would waste the shared WAF budget");
    assert.equal(new Set(singleModels).size, 10, "every model gets exactly one single-model fill");
    assert.equal(singleModels.length, 10, "no model is single-queried twice (its one page already returns everything)");
    const counts = new Map<string, number>();
    for (const l of result.listings) counts.set(`${l.make} ${l.model}`, (counts.get(`${l.make} ${l.model}`) ?? 0) + 1);
    for (const m of MODEL_TARGETS) {
      assert.ok((counts.get(`${m.make} ${m.model}`) ?? 0) >= MIN_PER_MODEL, `${m.model} must be filled to a real sample`);
    }
  }
);

test(
  "Phase 2 spends the budget rarest-first, stops at the first WAF block, and never re-queries a sufficient model (regression)",
  { timeout: 20_000 },
  async (t) => {
    // Combined page 0 leaves graded scarcity: Forester 0, Crosstrek 1, Mazda3
    // 2, CX-5 3, Tucson 4 — everyone else already over MIN. The fill must go
    // rarest-first and, once the 3rd single-model request is WAF-blocked, stop
    // immediately (the shared per-IP budget is spent) — never reaching CX-5 or
    // Tucson, and never touching the already-sufficient high-volume models.
    const scarcity: Record<string, number> = { Forester: 0, Crosstrek: 1, Mazda3: 2, "CX-5": 3, Tucson: 4 };
    const { combinedPages, singleModels } = mockClutchFetch(t, {
      combinedCounts: (model) => scarcity[model] ?? MIN_PER_MODEL + 3,
      single: (_model, attemptIndex) => (attemptIndex >= 2 ? 202 : { count: MIN_PER_MODEL + 5 }),
    });

    await clutch.run(() => {});

    assert.deepEqual(combinedPages, [0]);
    assert.deepEqual(
      singleModels,
      ["Forester", "Crosstrek", "Mazda3"],
      "rarest-first, and stops at the blocked 3rd request — never reaching CX-5/Tucson or any sufficient model"
    );
  }
);

test(
  "even when the combined breadth page is WAF-blocked outright, Phase 2 still tries single-model fills for every model (regression)",
  { timeout: 20_000 },
  async (t) => {
    // Page 0 itself is a 202 (common on a flagged IP). listings start empty →
    // every model is "under-represented" → the single-model fills must still
    // run (they can succeed even when the combined query was blocked).
    const combinedSeen: number[] = [];
    const singleSeen: string[] = [];
    t.mock.method(globalThis, "fetch", async (input: string | URL) => {
      const requested = new URL(input).searchParams.getAll("models[]");
      if (requested.length === 1) {
        const model = requested[0];
        singleSeen.push(model);
        const n = MIN_PER_MODEL + 5;
        return new Response(
          JSON.stringify({
            page: 0,
            pageSize: 32,
            totalCount: n,
            totalPages: 1,
            vehicles: Array.from({ length: n }, (_, j) => ({
              // Clutch ids are globally unique, not per-model. The mock used to
              // restart at 0 for every model, so all ten models produced the
              // same /vehicles/{id} URLs — which now correctly dedupe to one
              // car each, making this look like a scraper failure. Namespacing
              // by model reproduces what the real API returns.
              id: `${model}-${j}`,
              year: 2022,
              make: { name: MODEL_TARGETS.find((x) => x.model === model)!.make },
              model: { name: model },
              ["vehiclePrice-ON"]: { price: 20000 + j },
            })),
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      combinedSeen.push(Number(new URL(input).searchParams.get("page")));
      return new Response("", { status: 202 }); // breadth page blocked outright
    });

    const result = await clutch.run(() => {});

    assert.deepEqual(combinedSeen, [0], "the combined breadth page is attempted once");
    assert.equal(new Set(singleSeen).size, 10, "all 10 models are still filled via single-model queries");
    assert.ok(result.listings.length >= 10 * MIN_PER_MODEL, "every model got a real sample despite the blocked breadth page");
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
