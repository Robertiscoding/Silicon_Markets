import { ORNN_BASE, PRICE_SCALE, type GpuSymbol } from "./config.js";

export interface RawPrint {
  timestamp: string; // ISO-8601 (UTC)
  index_value: number; // USD per GPU-hour
}

export interface IndexHistoryResponse {
  success: boolean;
  gpu_type: string;
  data: RawPrint[];
}

export interface NormalizedPrint {
  symbol: GpuSymbol;
  /** Unix seconds at the published 4 PM ET boundary. Used as the contract dayKey. */
  dayKey: number;
  /** Original ISO timestamp from Ornn (kept for audit). */
  timestamp: string;
  /** Index value scaled by 1e8 (price * 1e8) as a bigint string. */
  priceScaled: string;
  /** Original float for human display. */
  price: number;
}

/** Fetches the daily 4 PM ET prints for a single symbol. */
export async function fetchIndexHistory(symbol: GpuSymbol): Promise<NormalizedPrint[]> {
  const url = `${ORNN_BASE}/api/gpu/${encodeURIComponent(symbol)}/index-history`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "silicon-markets-oracle/0.1" },
  });
  if (!res.ok) throw new Error(`Ornn ${symbol} -> HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as IndexHistoryResponse;
  if (!body.success || !Array.isArray(body.data)) {
    throw new Error(`Ornn ${symbol}: malformed response ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.data.map((p) => normalize(symbol, p));
}

export function normalize(symbol: GpuSymbol, raw: RawPrint): NormalizedPrint {
  const dayKey = Math.floor(new Date(raw.timestamp).getTime() / 1000);
  const priceScaled = priceToScaled(raw.index_value);
  return {
    symbol,
    dayKey,
    timestamp: raw.timestamp,
    priceScaled: priceScaled.toString(),
    price: raw.index_value,
  };
}

/** Converts a USD/hr float into a bigint scaled by 1e8 with safe rounding. */
export function priceToScaled(usdPerHour: number): bigint {
  if (!Number.isFinite(usdPerHour) || usdPerHour <= 0) {
    throw new Error(`Invalid price: ${usdPerHour}`);
  }
  // 1e8 fits in safe integer range for the prices we see (< $100/hr) so we can
  // multiply in floating-point first and then round.
  return BigInt(Math.round(usdPerHour * Number(PRICE_SCALE)));
}

/** Convenience: pull every symbol in parallel. */
export async function fetchAll(symbols: readonly GpuSymbol[]): Promise<Record<GpuSymbol, NormalizedPrint[]>> {
  const entries = await Promise.all(symbols.map(async (s) => [s, await fetchIndexHistory(s)] as const));
  return Object.fromEntries(entries) as Record<GpuSymbol, NormalizedPrint[]>;
}
