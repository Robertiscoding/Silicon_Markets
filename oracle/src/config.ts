import "dotenv/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Arc Testnet network parameters from https://docs.arc.io/arc/references/connect-to-arc.md */
export const ARC_TESTNET = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.arc.network"] },
    public: { http: ["https://rpc.testnet.arc.network"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
} as const;

/** USDC ERC-20 interface on Arc Testnet (6 decimals). */
export const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

/**
 * Tracked GPU symbols. These are the exact strings the Ornn backend will accept; the
 * smart contracts hash these via keccak256(bytes(symbol)) for cheap onchain lookups.
 */
export const GPU_SYMBOLS = [
  "H100 SXM",
  "H200",
  "B200",
  "A100 SXM4",
  "RTX 5090",
  "RTX PRO 6000 WS",
] as const;

export type GpuSymbol = (typeof GPU_SYMBOLS)[number];

export const ORNN_BASE = "https://ornn-backend-api-135941626504.us-central1.run.app";

export const PRICE_SCALE = 100_000_000n; // 1e8, matches OrnnOracle

export const DATA_DIR = resolve(__dirname, "..", "data");
export const PRINTS_FILE = resolve(DATA_DIR, "prints.json");
