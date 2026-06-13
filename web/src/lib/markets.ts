export const GPU_SYMBOLS = [
  "RTX 5090",
  "H100 SXM",
  "H200",
  "B200",
  "A100 SXM4",
  "RTX PRO 6000 WS",
] as const;

export type GpuSymbol = (typeof GPU_SYMBOLS)[number];
