import { GPU_SYMBOLS, type GpuSymbol } from "./markets";

/**
 * Model-implied consensus.
 *
 * A deterministic skew-normal distribution per GPU, seeded from the live Ornn
 * spot print: a crowd view of where the 4 PM ET print may settle, with a
 * confidence score derived from how tight the distribution is. Deterministic
 * (no RNG at render time) so server- and client-rendered output match.
 */

export interface ConsensusBin {
  /** Bin centre price ($/hr). */
  center: number;
  /** Share of distribution mass in this bin (0..1, sums to ~1 across bins). */
  weight: number;
}

export interface ConsensusForecast {
  symbol: GpuSymbol;
  spot: number;
  /** Distribution mean (the headline consensus). */
  consensus: number;
  /** Central 50% band of the distribution. */
  low: number;
  high: number;
  /** (consensus - spot) / spot * 100. */
  movePct: number;
  /** 0..1 — tighter distribution → higher. */
  confidence: number;
  bins: ConsensusBin[];
}

interface Profile {
  /** Mean offset from spot, as a fraction (e.g. +0.024 = 2.4% above spot). */
  drift: number;
  /** Std-dev of the distribution as a fraction of spot. */
  sigma: number;
  /** Skew of the distribution; positive = fat upper tail. */
  skew: number;
}

const PROFILE: Record<GpuSymbol, Profile> = {
  "RTX 5090": { drift: 0.024, sigma: 0.045, skew: 0.35 },
  "H100 SXM": { drift: 0.018, sigma: 0.038, skew: 0.12 },
  H200: { drift: 0.031, sigma: 0.052, skew: 0.4 },
  B200: { drift: 0.046, sigma: 0.063, skew: 0.55 },
  "A100 SXM4": { drift: -0.014, sigma: 0.034, skew: -0.25 },
  "RTX PRO 6000 WS": { drift: 0.009, sigma: 0.041, skew: 0.05 },
};

const BIN_COUNT = 27;
/** Half-width of the distribution window, in sigmas. */
const WINDOW_SIGMAS = 3.2;

/** Standard-normal density. */
function gaussian(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z);
}

export function buildConsensus(symbol: GpuSymbol, spot: number): ConsensusForecast {
  const p = PROFILE[symbol] ?? { drift: 0.01, sigma: 0.04, skew: 0 };
  const safeSpot = spot > 0 ? spot : 1;
  const mean = safeSpot * (1 + p.drift);
  const sigma = Math.max(safeSpot * p.sigma, 1e-4);

  const lo = mean - WINDOW_SIGMAS * sigma;
  const hi = mean + WINDOW_SIGMAS * sigma;
  const step = (hi - lo) / (BIN_COUNT - 1);

  // Skew-normal-ish weights: gaussian core × logistic skew factor.
  const raw: { center: number; w: number }[] = [];
  let total = 0;
  for (let i = 0; i < BIN_COUNT; i++) {
    const center = lo + i * step;
    const z = (center - mean) / sigma;
    const skewFactor = 1 / (1 + Math.exp(-p.skew * z)); // 0.5 at mean
    const w = gaussian(center, mean, sigma) * (0.5 + skewFactor);
    raw.push({ center, w });
    total += w;
  }
  const bins: ConsensusBin[] = raw.map((b) => ({
    center: b.center,
    weight: b.w / total,
  }));

  // Weighted mean is the published consensus (≈ mean, nudged by skew).
  const consensus = bins.reduce((s, b) => s + b.center * b.weight, 0);

  // Central 50% band via cumulative weight.
  let cum = 0;
  let low = bins[0].center;
  let high = bins[bins.length - 1].center;
  let setLow = false;
  for (const b of bins) {
    cum += b.weight;
    if (!setLow && cum >= 0.25) {
      low = b.center;
      setLow = true;
    }
    if (cum >= 0.75) {
      high = b.center;
      break;
    }
  }

  // Confidence: tighter crowd (smaller sigma fraction) → higher. Mapped so
  // ~3% sigma ≈ 0.85, ~7% sigma ≈ 0.45.
  const confidence = Math.max(0.2, Math.min(0.97, 1 - p.sigma * 8));

  return {
    symbol,
    spot: safeSpot,
    consensus,
    low,
    high,
    movePct: ((consensus - safeSpot) / safeSpot) * 100,
    confidence,
    bins,
  };
}

export function buildAllConsensus(spots: Partial<Record<GpuSymbol, number>>): ConsensusForecast[] {
  return GPU_SYMBOLS.map((s) => buildConsensus(s, spots[s] ?? 1));
}

export function confidenceLabel(c: number): string {
  if (c >= 0.72) return "High";
  if (c >= 0.5) return "Medium";
  return "Low";
}
