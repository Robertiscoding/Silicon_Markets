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
