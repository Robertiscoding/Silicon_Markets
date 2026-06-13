import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DATA_DIR, PRINTS_FILE, type GpuSymbol } from "./config.js";
import type { NormalizedPrint } from "./ornn.js";

export interface PrintsStore {
  updatedAt: string;
  symbols: Partial<Record<GpuSymbol, NormalizedPrint[]>>;
}

const EMPTY: PrintsStore = { updatedAt: new Date(0).toISOString(), symbols: {} };

export async function loadPrints(): Promise<PrintsStore> {
  try {
    const raw = await readFile(PRINTS_FILE, "utf8");
    return JSON.parse(raw) as PrintsStore;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
    throw err;
  }
}

export async function savePrints(store: PrintsStore): Promise<void> {
  await mkdir(dirname(PRINTS_FILE), { recursive: true });
  // Ensure deterministic ordering by symbol then dayKey for easy diffing.
  for (const sym of Object.keys(store.symbols) as GpuSymbol[]) {
    store.symbols[sym]!.sort((a, b) => a.dayKey - b.dayKey);
  }
  await writeFile(PRINTS_FILE, JSON.stringify(store, null, 2) + "\n");
}

/** Merge fresh prints into the store, keyed by (symbol, dayKey). Returns the new prints found. */
export function mergePrints(
  store: PrintsStore,
  fresh: Record<GpuSymbol, NormalizedPrint[]>,
): NormalizedPrint[] {
  const added: NormalizedPrint[] = [];
  for (const symbol of Object.keys(fresh) as GpuSymbol[]) {
    const existing = store.symbols[symbol] ?? [];
    const known = new Set(existing.map((p) => p.dayKey));
    for (const p of fresh[symbol]) {
      if (known.has(p.dayKey)) continue;
      existing.push(p);
      added.push(p);
    }
    store.symbols[symbol] = existing;
  }
  if (added.length > 0) store.updatedAt = new Date().toISOString();
  return added;
}

export { DATA_DIR };
