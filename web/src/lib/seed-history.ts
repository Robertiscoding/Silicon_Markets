import { GPU_SYMBOLS, type GpuSymbol } from "./markets";

export interface PricePoint {
  ts: number;
  price: number;
}

const BASE_SPOT: Record<GpuSymbol, number> = {
  "RTX 5090": 2.45,
  "H100 SXM": 3.82,
  H200: 4.15,
  B200: 5.1,
  "A100 SXM4": 2.05,
  "RTX PRO 6000 WS": 1.88,
};

function walkPrice(base: number, dayIndex: number, symbol: GpuSymbol): number {
  const seed = symbol.split("").reduce((n, c) => n + c.charCodeAt(0), 0);
  const wave = Math.sin((dayIndex + seed) * 0.17) * 0.06;
  const drift = Math.cos((dayIndex + seed) * 0.04) * 0.03;
  return +(base * (1 + wave + drift)).toFixed(4);
}

export function seedSeries(symbol: GpuSymbol, days = 90): PricePoint[] {
  const base = BASE_SPOT[symbol];
  const end = Math.floor(Date.now() / 1000);
  const daySec = 86_400;
  const points: PricePoint[] = [];

  for (let i = days; i >= 0; i--) {
    points.push({
      ts: end - i * daySec,
      price: walkPrice(base, days - i, symbol),
    });
  }

  return points;
}

export function seedAllSeries(): Record<GpuSymbol, PricePoint[]> {
  return Object.fromEntries(GPU_SYMBOLS.map((symbol) => [symbol, seedSeries(symbol)])) as Record<
    GpuSymbol,
    PricePoint[]
  >;
}
