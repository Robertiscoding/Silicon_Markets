import { scrape } from "./scrape.js";

/**
 * Pulls the entire ~90-day history that Ornn exposes for every tracked GPU and
 * persists it locally. The first run on a fresh checkout populates the history
 * file used by the web app's historical-chart endpoint.
 */
async function main() {
  console.log("[backfill] fetching full Ornn history for all symbols ...");
  const { added, total } = await scrape();
  console.log(`[backfill] complete. added=${added} total=${total}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
