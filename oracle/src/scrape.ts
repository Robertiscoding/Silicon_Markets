import { GPU_SYMBOLS } from "./config.js";
import { fetchAll } from "./ornn.js";
import { loadPrints, mergePrints, savePrints } from "./store.js";

/** Fetches every GPU's daily-print history from Ornn and merges into data/prints.json. */
export async function scrape(): Promise<{ added: number; total: number }> {
  const fresh = await fetchAll(GPU_SYMBOLS);
  const store = await loadPrints();
  const added = mergePrints(store, fresh);
  await savePrints(store);
  const total = Object.values(store.symbols).reduce((acc, list) => acc + (list?.length ?? 0), 0);
  return { added: added.length, total };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrape()
    .then((r) => {
      console.log(`[scrape] added=${r.added} total=${r.total}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
