/**
 * `npm run dealer:probe -w server -- <domain> [more domains…]`
 *
 * Works out which platform a dealership site runs on and prints the
 * `dealers.json` entry for it, so adding a source is a config line rather than
 * a reverse-engineering session.
 *
 * Dealer websites are almost never bespoke — they are white-label builds from a
 * handful of vendors, and this repo already has an adapter per vendor. The work
 * in adding a dealer is therefore not writing a scraper, it is identifying the
 * platform and finding the one id that platform keys on. That is mechanical, so
 * it should be a script.
 *
 * Detection is by evidence rather than guesswork: each platform leaves a
 * distinct fingerprint in the served HTML, and for Convertus the company id is
 * read straight out of the inventory request the page itself makes.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

async function fetchHtml(url: string, timeoutMs: number): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-CA,en;q=0.9",
      },
    });
    const body = await res.text();
    // A challenge page still carries useful signal, so return it either way.
    return body.length > 200 ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

interface Probe {
  domain: string;
  reachable: boolean;
  blocked: boolean;
  platform: "convertus" | "stm" | "edealer" | "unknown";
  cp?: number;
  inventoryUrl?: string;
  note?: string;
}

const CANDIDATE_PATHS = ["/inventory/used/", "/used/", "/inventory/", "/vehicles/used/", "/"];

/** Cloudflare / generic challenge interstitials, which are not real pages. */
function isChallenge(html: string): boolean {
  return /Just a moment\.\.\.|__cf_chl|cf-browser-verification|Attention Required!/i.test(html);
}

function count(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length;
}

/**
 * Identify the platform from weight of evidence, not first mention.
 *
 * An earlier version tested `/edealer/i` and reported two Convertus dealers as
 * eDealer, because the word appears once, incidentally, on their pages. Checked
 * against the four dealers already in dealers.json — whose platforms are known
 * to be correct because their scrapers work — the served HTML actually says:
 *
 *   waynetoyota.com     convertus x179   edealer x1   (convertus)
 *   superiorhyundai.ca  convertus x94    edealer x1   (convertus)
 *   goremotorshonda.com wp-content/themes/motors x41  (stm)
 *
 * So each platform is matched on a marker that appears throughout its own build
 * — a theme path, an asset host, the inventory blob itself — and a lone mention
 * of a competitor's name no longer decides anything.
 */
function detectPlatform(html: string): { platform: Probe["platform"]; cp?: number } {
  const convertus = count(html, /convertus/gi);
  const motors = count(html, /wp-content\/themes\/motors|stm_listings/gi);
  const vehicleArray = count(html, /vehicleArray\s*[=:]/gi);

  // Convertus is the strongest signal when present: it is the theme and asset
  // host, so it appears dozens of times rather than once.
  if (convertus >= 5) {
    // The company id the adapter keys on. Not in the ajax URL (that request is
    // made at JS time) but present in the bootstrap config under several names,
    // all agreeing — verified against Wayne Toyota's known cp=3490.
    const cp =
      html.match(/"vmsID"\s*:\s*"?(\d{3,6})"?/i) ??
      html.match(/"inventoryId"\s*:\s*"?(\d{3,6})"?/i) ??
      html.match(/"dealer_id"\s*:\s*"?(\d{3,6})"?/i) ??
      html.match(/ajax-vehicles\.php[^"'<>]*?[?&]cp=(\d+)/i);
    return { platform: "convertus", cp: cp ? Number(cp[1]) : undefined };
  }

  // WordPress "Motors" theme, read via the per-vehicle sitemap.
  if (motors >= 3) return { platform: "stm" };

  // eDealer embeds the whole lot as a JS object literal in the static HTML.
  // Match the blob, not the vendor's name.
  if (vehicleArray >= 1) return { platform: "edealer" };

  return { platform: "unknown" };
}

async function probe(domain: string): Promise<Probe> {
  const host = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  // Some dealers only answer on one of the two — halfwaymotorsmazda.com refuses
  // the connection bare and serves (a challenge) on www, so trying one and
  // giving up reports "unknown platform" for a site that is really blocked.
  const hosts = host.startsWith("www.") ? [host, host.slice(4)] : [host, `www.${host}`];

  for (const path of CANDIDATE_PATHS) {
    for (const h of hosts) {
    const url = `https://${h}` + path;
    let html: string | null = null;
    try {
      html = await fetchHtml(url, 25_000);
    } catch {
      continue;
    }
    if (!html) continue;

    if (isChallenge(html)) {
      return {
        domain: host,
        reachable: true,
        blocked: true,
        platform: "unknown",
        inventoryUrl: url,
        note: "bot challenge (Cloudflare) — no free path; skip this dealer",
      };
    }

    const { platform, cp } = detectPlatform(html);
    if (platform !== "unknown") {
      return { domain: host, reachable: true, blocked: false, platform, cp, inventoryUrl: url };
    }
    }
  }

  return { domain: host, reachable: false, blocked: false, platform: "unknown", note: "no recognised platform" };
}

function entryFor(p: Probe, name: string): string | null {
  if (p.platform === "convertus" && p.cp) {
    return JSON.stringify({ key: p.domain.split(".")[0], name, city: "?", province: "?", platform: "convertus", cp: p.cp });
  }
  if (p.platform === "stm") {
    return JSON.stringify({ key: p.domain.split(".")[0], name, city: "?", province: "?", platform: "stm", domain: p.domain });
  }
  if (p.platform === "edealer") {
    return JSON.stringify({ key: p.domain.split(".")[0], name, city: "?", province: "?", platform: "edealer", urls: [p.inventoryUrl] });
  }
  return null;
}

async function main() {
  const domains = process.argv.slice(2).filter(Boolean);
  if (domains.length === 0) {
    console.error("Usage: npm run dealer:probe -w server -- <domain> [more…]");
    console.error("  e.g. npm run dealer:probe -w server -- waynetoyota.com superiorhyundai.ca");
    process.exit(1);
  }

  for (const d of domains) {
    const p = await probe(d);
    const status = p.blocked ? "BLOCKED" : p.platform === "unknown" ? "UNKNOWN" : p.platform.toUpperCase();
    console.log(`\n${p.domain}  [${status}]`);
    if (p.inventoryUrl) console.log(`  inventory : ${p.inventoryUrl}`);
    if (p.cp) console.log(`  convertus cp : ${p.cp}`);
    if (p.note) console.log(`  note      : ${p.note}`);
    const entry = entryFor(p, d);
    if (entry) console.log(`  dealers.json entry (fill in city/province):\n    ${entry},`);
  }
}

main().catch((e) => {
  console.error("Probe failed:", (e as Error).message);
  process.exit(1);
});
