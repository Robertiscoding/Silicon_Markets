export const GPU_SYMBOLS = [
  "RTX 5090",
  "H100 SXM",
  "H200",
  "B200",
  "A100 SXM4",
  "RTX PRO 6000 WS",
] as const;

export type GpuSymbol = (typeof GPU_SYMBOLS)[number];

export function formatUsd(value: number, fractionDigits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatHr(value: number): string {
  return `${formatUsd(value, value < 10 ? 4 : 2)}/hr`;
}

export function rawToUsdc(raw: bigint): number {
  return Number(raw) / 1_000_000;
}

export function priceToScaled(usd: number): bigint {
  if (!Number.isFinite(usd) || usd <= 0) throw new Error(`Invalid price ${usd}`);
  return BigInt(Math.round(usd * 1e8));
}

export function usdcToRaw(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}

export function settlementTsForDate(d: Date): number {
  const tz = "America/New_York";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return utcMsForLocal(get("year"), get("month"), get("day"), 16, 0, tz) / 1000;
}

export function nextSettlementTs(now: Date = new Date()): number {
  const today = settlementTsForDate(now) * 1000;
  if (now.getTime() < today) return today / 1000;
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return settlementTsForDate(tomorrow);
}

export function configuredSettlementTs(now: Date = new Date()): number {
  const override = Number(process.env.NEXT_PUBLIC_SETTLEMENT_TS);
  if (Number.isFinite(override) && override > 0) return override;
  return nextSettlementTs(now);
}

export function formatSettlesIn(nowTs: number, settlementTs: number): string {
  const seconds = Math.max(0, settlementTs - nowTs);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function impliedOddsLabel(bps: number): string {
  if (bps <= 0) return "—";
  return `${(bps / 100).toFixed(0)}%`;
}

export function expectedPayout(stake: number, oddsBps: number, feeBps = 100): number {
  if (oddsBps <= 0) return 0;
  const odds = oddsBps / 10_000;
  return (stake * (1 - feeBps / 10_000)) / odds;
}

export function gaussianBandProbability(
  spot: number,
  center: number,
  band: number,
  sigmaPct = 0.04,
): number {
  if (spot <= 0 || band <= 0) return 0;
  const sigma = Math.max(spot * sigmaPct, 1e-6);
  const lo = (center - band - spot) / sigma;
  const hi = (center + band - spot) / sigma;
  return Math.max(0, Math.min(1, normCdf(hi) - normCdf(lo)));
}

function utcMsForLocal(y: number, mo: number, d: number, h: number, m: number, tz: string): number {
  const utcGuess = Date.UTC(y, mo - 1, d, h, m);
  const lparts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcGuess));
  const lget = (t: string) => Number(lparts.find((p) => p.type === t)?.value);
  const observed = Date.UTC(lget("year"), lget("month") - 1, lget("day"), lget("hour"), lget("minute"));
  return utcGuess - (observed - utcGuess);
}

function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * ax);
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1.0 + sign * y);
}
