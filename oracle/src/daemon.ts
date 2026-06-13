import "dotenv/config";
import { publishPrints } from "./publish.js";
import { scrape } from "./scrape.js";

/**
 * Long-running daemon. Sleeps until the next 4 PM America/New_York boundary
 * (plus a small jitter), runs a full scrape+publish, and repeats. We compute
 * the boundary in pure JS using the en-US time zone formatter so we don't
 * have to bundle a tz library.
 */

const TIMEZONE = "America/New_York";

function nextSettlementMillis(now: Date): number {
  // Parse "now" into the target timezone parts.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const y = get("year"),
    mo = get("month"),
    d = get("day"),
    h = get("hour");

  // Find offset of TIMEZONE at "now" so we can build a UTC instant for (y,mo,d,16:00 ET).
  const target = utcInstantForLocal(y, mo, d, 16, 0);
  if (h < 16) return target;
  // After 16:00 ET — schedule for the next day.
  const tomorrow = new Date(target + 24 * 60 * 60 * 1000);
  const tParts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(tomorrow);
  const gt = (t: string) => Number(tParts.find((p) => p.type === t)?.value);
  return utcInstantForLocal(gt("year"), gt("month"), gt("day"), 16, 0);
}

/** Given local (y,mo,d,h,m) in TIMEZONE, return the corresponding UTC ms. */
function utcInstantForLocal(y: number, mo: number, d: number, h: number, m: number): number {
  // First guess: treat as UTC.
  const utcGuess = Date.UTC(y, mo - 1, d, h, m);
  // Discover what TIMEZONE thinks utcGuess is — diff gives the timezone offset.
  const local = new Date(utcGuess);
  const lparts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(local);
  const lget = (t: string) => Number(lparts.find((p) => p.type === t)?.value);
  const observed = Date.UTC(lget("year"), lget("month") - 1, lget("day"), lget("hour"), lget("minute"));
  const offset = observed - utcGuess; // positive = ahead of UTC, negative = behind
  return utcGuess - offset;
}

async function tick() {
  const t0 = Date.now();
  try {
    const scrapeRes = await scrape();
    console.log(`[daemon] scrape added=${scrapeRes.added} total=${scrapeRes.total}`);
    if (process.env.ORACLE_UPDATER_KEY && process.env.ORACLE_ADDRESS) {
      const pubRes = await publishPrints({ catchUp: true });
      console.log(`[daemon] publish pushed=${pubRes.pushed}`);
    }
  } catch (err) {
    console.error("[daemon] tick failed:", err);
  }
  console.log(`[daemon] tick complete in ${Date.now() - t0}ms`);
}

async function main() {
  console.log("[daemon] starting Silicon Markets oracle agent");
  // Always run an immediate tick on boot so a fresh deploy backfills.
  await tick();
  while (true) {
    const now = new Date();
    const target = nextSettlementMillis(now);
    // Add a 2-minute jitter so we hit Ornn after the new print is published.
    const wait = Math.max(0, target - now.getTime() + 2 * 60_000);
    const hours = (wait / 3_600_000).toFixed(2);
    console.log(`[daemon] sleeping ${hours}h until next 4 PM ET print`);
    await new Promise((r) => setTimeout(r, wait));
    await tick();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
