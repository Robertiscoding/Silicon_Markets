import { defineChain } from "viem";

export const ARC_RPC_URL =
  process.env.NEXT_PUBLIC_ARC_RPC_URL ??
  "https://aged-virulent-haze.arc-testnet.quiknode.pro/a005157527edc7c0ca240184126bfd3eaab95d5d/";

export const ARC_WSS_URL =
  process.env.NEXT_PUBLIC_ARC_WSS_URL ??
  "wss://aged-virulent-haze.arc-testnet.quiknode.pro/a005157527edc7c0ca240184126bfd3eaab95d5d/";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_RPC_URL], webSocket: [ARC_WSS_URL] },
    public: { http: [ARC_RPC_URL], webSocket: [ARC_WSS_URL] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: "https://testnet.arcscan.app" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
  testnet: true,
});

export const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000" as const;

export const ARC_EURC_ADDRESS = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as const;

export function arcscanTx(hash: string): string {
  return `${arcTestnet.blockExplorers.default.url}/tx/${hash}`;
}

export function arcscanAddress(address: string): string {
  return `${arcTestnet.blockExplorers.default.url}/address/${address}`;
}
