import * as cheerio from "cheerio";
import { fetchWithTimeout } from "../scrapers/config";

/**
 * A real photo of the model from Wikipedia/Wikimedia Commons (free, licensed).
 * Tries "{Make} {Model}" then a simplified "{Make} {first word}", and upsizes
 * the thumbnail. Cached in-process. Used to fill in cars whose OEM page didn't
 * expose an image.
 */
const imgCache = new Map<string, string | null>();

async function wikiSummaryImage(title: string): Promise<string | null> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/\s+/g, "_"))}`;
  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "CarScore/2.0 (car listing app)", Accept: "application/json" },
    timeoutMs: 10_000,
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { thumbnail?: { source?: string } };
  // Use the API's thumbnail URL exactly as given: Wikimedia only serves
  // pre-rendered widths and returns HTTP 400 for fabricated ones (verified:
  // 330px works, 640px 400s on the same file).
  return j.thumbnail?.source ?? null;
}

export async function fetchCarImage(make: string, model: string): Promise<string | null> {
  const key = `${make} ${model}`.toLowerCase();
  if (imgCache.has(key)) return imgCache.get(key)!;
  const first = model.split(/\s+/)[0];
  const candidates = [`${make} ${model}`, `${make} ${first}`];
  let found: string | null = null;
  for (const title of candidates) {
    try {
      found = await wikiSummaryImage(title);
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
