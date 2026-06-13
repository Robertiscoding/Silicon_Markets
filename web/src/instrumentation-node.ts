import { spawn } from "node:child_process";
import { resolve } from "node:path";

/**
 * Node-only side effect: on local dev startup, run the Puppeteer-driven Ornn
 * scraper in the background. It overwrites ../oracle/data/prints.json, which the
 * /api/history route serves (busting its cache on file mtime), so the UI shows
 * fresh prices without any manual `npm run scrape:browser`.
 *
 * Disabled in production builds, and force-disabled with ORNN_SCRAPE_ON_STARTUP=0.
 */
function startStartupScrape() {
  if (process.env.NODE_ENV === "production") return;
  if (process.env.ORNN_SCRAPE_ON_STARTUP === "0") return;

  const g = globalThis as typeof globalThis & { __ornnScrapeStarted?: boolean };
  if (g.__ornnScrapeStarted) return;
  g.__ornnScrapeStarted = true;

  const oracleDir = resolve(process.cwd(), "..", "oracle");

  console.log("[ornn] fetching latest GPU prices via Puppeteer on startup ...");
  const child = spawn("npm", ["run", "scrape:browser"], {
    cwd: oracleDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  child.stdout?.on("data", (d: Buffer) => process.stdout.write(`[ornn] ${d}`));
  child.stderr?.on("data", (d: Buffer) => process.stderr.write(`[ornn] ${d}`));
  child.on("exit", (code) => console.log(`[ornn] startup price scrape finished (exit ${code ?? "?"})`));
  child.on("error", (err) => console.error("[ornn] failed to start scraper:", err));
}

startStartupScrape();
