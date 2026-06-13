import { loadAllSeries } from "./history";
import { GPU_SYMBOLS, type GpuSymbol } from "./markets";
import { seedAllSeries, type PricePoint } from "./seed-history";

export async function loadMarketSeries(): Promise<Record<GpuSymbol, PricePoint[]>> {
  const oracle = await loadAllSeries();
  const seeded = seedAllSeries();

  return Object.fromEntries(
    GPU_SYMBOLS.map((symbol) => {
      const prints = oracle[symbol] ?? [];
      if (prints.length >= 2) {
        return [symbol, prints.map((p) => ({ ts: p.dayKey, price: p.price }))];
      }
      return [symbol, seeded[symbol] ?? []];
    }),
  ) as Record<GpuSymbol, PricePoint[]>;
}
