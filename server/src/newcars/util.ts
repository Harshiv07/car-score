import * as cheerio from "cheerio";
import { fetchWithTimeout } from "../scrapers/config";

/**
 * A real photo of the model from Wikimedia Commons (free, licensed, public
 * image library — commons.wikimedia.org). Two calls:
 *   1. `list=search` over file-namespace bitmaps for "{make} {model}" —
 *      searches Commons' whole catalogue (every model-year photo anyone has
 *      uploaded), not just the one photo a Wikipedia article's infobox happens
 *      to use.
 *   2. `prop=imageinfo&iiurlwidth=` on the top hit — this GENERATES a
 *      thumbnail at the requested width on demand. The page-summary REST API
 *      we used before only serves a handful of pre-cached widths and returns
 *      HTTP 400 for anything else, which is why several cards stayed blank.
 * Cached in-process. Used to fill in cars whose OEM page didn't expose one.
 */
const imgCache = new Map<string, string | null>();
const UA = "CarScore/2.0 (https://cargrade.vercel.app; car listing app)";
// Close-up/detail/technical shots that make poor hero images even when they
// genuinely are the right model — a fuel-gauge closeup or an engine/hybrid-
// system diagram matches the model name fine, it's just not a photo of the
// car's exterior.
const BAD_TITLE =
  /logo|badge|icon|emblem|diagram|cutaway|brochure|advertisement|dashboard|interior|steering|gauge|cluster|speedometer|odometer|\bengine\b|drivetrain|differential|transmission|gearbox|chassis|undercarriage|hybrid[ _-]?system|\.svg$/i;

function normalizeToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Pick the first Commons search result that's both relevant (names the model)
 * and not a technical/marketing close-up. Pure and exported for testing —
 * this is what stopped "Mazda CX-50" from matching a "Mazda CX-60" photo and
 * "Toyota Corolla" from matching an engine-bay closeup.
 */
export function pickRelevantTitle(titles: string[], mustContainToken: string): string | null {
  const needle = normalizeToken(mustContainToken);
  return titles.find((t) => !BAD_TITLE.test(t) && normalizeToken(t).includes(needle)) ?? null;
}

async function commonsApi<T>(params: Record<string, string>): Promise<T | null> {
  const qs = new URLSearchParams({ action: "query", format: "json", origin: "*", ...params });
  const res = await fetchWithTimeout(`https://commons.wikimedia.org/w/api.php?${qs}`, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    timeoutMs: 10_000,
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

interface SearchResult {
  query?: { search?: { title: string }[] };
}
interface ImageInfoResult {
  query?: { pages?: Record<string, { imageinfo?: { thumburl?: string }[] }> };
}

async function thumbUrlFor(title: string, width: number): Promise<string | null> {
  const info = await commonsApi<ImageInfoResult>({
    titles: title,
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: String(width),
  });
  const page = Object.values(info?.query?.pages ?? {})[0];
  return page?.imageinfo?.[0]?.thumburl ?? null;
}

/**
 * Search Commons for `query` and return the thumbnail URL of the first result
 * that actually names `mustContainToken` (Commons' full-text search often
 * returns loosely-related hits — e.g. searching "Mazda CX-50" can rank
 * "Mazda CX-60" first — so relevance is enforced here, not trusted from rank).
 */
async function searchCommonsImage(query: string, mustContainToken: string, width: number): Promise<string | null> {
  const search = await commonsApi<SearchResult>({
    list: "search",
    srnamespace: "6", // File: namespace
    srlimit: "15",
    srsearch: `filetype:bitmap ${query}`,
  });
  const titles = search?.query?.search?.map((s) => s.title) ?? [];
  const title = pickRelevantTitle(titles, mustContainToken);
  return title ? thumbUrlFor(title, width) : null;
}

export async function fetchCarImage(make: string, model: string, year?: number): Promise<string | null> {
  const key = `${make} ${model}`.toLowerCase();
  if (imgCache.has(key)) return imgCache.get(key)!;
  const first = model.split(/\s+/)[0];
  // Year-qualified query first (prefers a photo of the current generation);
  // fall back to unqualified, then to just the make + first model word for
  // compound names ("Civic Sedan" → "Civic"). Validate every candidate
  // against the model token so an off-model match never slips through.
  const candidates = [
    year ? `${year} ${make} ${model}` : null,
    `${make} ${model}`,
    `${make} ${first}`,
  ].filter((q): q is string => !!q);

  let found: string | null = null;
  for (const q of candidates) {
    try {
      found = await searchCommonsImage(q, model, 640);
    } catch {
      found = null;
    }
    if (found) break;
  }
  imgCache.set(key, found);
  return found;
}

/**
 * Best-effort hero image for a model page: prefer social-share meta images
 * (they're always a real photo of the car), then a large content <img> that
 * references the model, skipping logos/icons/placeholders.
 */
export function pickImage(html: string, hint?: string): string | null {
  const $ = cheerio.load(html);
  for (const sel of [
    'meta[property="og:image"]',
    'meta[property="og:image:secure_url"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
    'link[rel="image_src"]',
  ]) {
    const el = $(sel).first();
    const c = el.attr("content") ?? el.attr("href");
    if (c && /^https?:\/\//.test(c) && !/logo|sprite|placeholder/i.test(c)) return c;
  }

  const hintRe = hint ? new RegExp(hint.replace(/[^a-z0-9]+/gi, ".?"), "i") : null;
  const ok = (u: string) => /^https?:\/\//.test(u) && !/logo|icon|sprite|placeholder|badge|pixel|\.svg(\?|$)/i.test(u);
  const firstFromSrcset = (v: string) => v.split(",")[0]?.trim().split(/\s+/)[0] ?? "";

  let hero: string | null = null;
  let fallback: string | null = null;
  $("img, source").each((_, el) => {
    if (hero) return;
    const src =
      $(el).attr("src") ??
      $(el).attr("data-src") ??
      $(el).attr("data-lazy-src") ??
      firstFromSrcset($(el).attr("srcset") ?? $(el).attr("data-srcset") ?? "");
    const alt = $(el).attr("alt") ?? "";
    if (!ok(src)) return;
    if (hintRe && (hintRe.test(src) || hintRe.test(alt))) hero = src;
    else if (!fallback && /jpe?g|png|webp/i.test(src)) fallback = src;
  });
  if (hero) return hero;

  // Last resort: a raw-HTML scan for a vehicle-ish image URL that names the model.
  if (hintRe) {
    for (const m of html.matchAll(/https?:\/\/[^"'\s)]+\.(?:jpe?g|png|webp)(?:\?[^"'\s)]*)?/gi)) {
      if (hintRe.test(m[0]) && ok(m[0])) return m[0];
    }
  }
  return fallback;
}
