import "dotenv/config";
import { publishPrints } from "./publish.js";
import { scrape } from "./scrape.js";

/** One full cycle: scrape Ornn, persist to disk, push fresh prints onchain. */
async function tick() {
  const t0 = Date.now();
  const scrapeRes = await scrape();
  console.log(`[tick] scrape added=${scrapeRes.added} total=${scrapeRes.total}`);
  if (process.env.ORACLE_UPDATER_KEY && process.env.ORACLE_ADDRESS) {
    const pubRes = await publishPrints({ catchUp: true });
    console.log(`[tick] publish pushed=${pubRes.pushed}`);
  } else {
    console.log("[tick] skipping publish (no ORACLE_UPDATER_KEY / ORACLE_ADDRESS)");
  }
  console.log(`[tick] complete in ${Date.now() - t0}ms`);
}

tick().catch((err) => {
  console.error(err);
  process.exit(1);
});
