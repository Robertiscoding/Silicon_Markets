import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { GPU_SYMBOLS, type GpuSymbol } from "./markets";

export interface NormalizedPrint {
  symbol: GpuSymbol;
  dayKey: number;
  timestamp: string;
  price: number;
  priceScaled: string;
}

interface PrintsFile {
  updatedAt: string;
  symbols: Record<string, NormalizedPrint[]>;
}

const DATA_PATH = resolve(process.cwd(), "..", "oracle", "data", "prints.json");

let cache: { mtime: number; payload: PrintsFile } | null = null;

export async function loadAllPrints(): Promise<PrintsFile> {
  try {
    const info = await stat(DATA_PATH);
    if (cache && cache.mtime === info.mtimeMs) return cache.payload;
    const raw = await readFile(DATA_PATH, "utf8");
    const parsed = JSON.parse(raw) as PrintsFile;
    cache = { mtime: info.mtimeMs, payload: parsed };
    return parsed;
  } catch {
    return { updatedAt: new Date(0).toISOString(), symbols: {} };
  }
}

export async function loadAllSeries(): Promise<Record<GpuSymbol, NormalizedPrint[]>> {
  const all = await loadAllPrints();
  return Object.fromEntries(
    GPU_SYMBOLS.map((s) => [s, (all.symbols[s] ?? []) as NormalizedPrint[]]),
  ) as Record<GpuSymbol, NormalizedPrint[]>;
}
