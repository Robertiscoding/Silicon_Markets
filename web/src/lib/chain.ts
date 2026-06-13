import { defineChain } from "viem";

export const ARC_RPC_URL =
  process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.network";

export const ARC_WSS_URL = process.env.NEXT_PUBLIC_ARC_WSS_URL ?? "";

export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_RPC_URL], webSocket: ARC_WSS_URL ? [ARC_WSS_URL] : undefined },
    public: { http: [ARC_RPC_URL], webSocket: ARC_WSS_URL ? [ARC_WSS_URL] : undefined },
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
