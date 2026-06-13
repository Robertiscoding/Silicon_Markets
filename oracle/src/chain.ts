import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  type Address,
  type Hex,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ARC_TESTNET } from "./config.js";

export const arcTestnet = defineChain(ARC_TESTNET);

export const ORNN_ORACLE_ABI = [
  {
    type: "function",
    name: "publishPrint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gpuSymbol", type: "string" },
      { name: "dayKey", type: "uint256" },
      { name: "price", type: "uint128" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getPrintBySymbolHash",
    stateMutability: "view",
    inputs: [
      { name: "symbolHash", type: "bytes32" },
      { name: "dayKey", type: "uint256" },
    ],
    outputs: [
      { name: "price", type: "uint128" },
      { name: "publishedAt", type: "uint64" },
      { name: "exists", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "latestDayKey",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "PrintPublished",
    inputs: [
      { name: "gpuSymbolHash", type: "bytes32", indexed: true },
      { name: "gpuSymbol", type: "string", indexed: false },
      { name: "dayKey", type: "uint256", indexed: true },
      { name: "price", type: "uint128", indexed: false },
    ],
  },
] as const;

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(process.env.ARC_RPC_URL),
});

export function walletFromEnv(): { wallet: WalletClient; account: Address; oracle: Address } {
  const key = process.env.ORACLE_UPDATER_KEY as Hex | undefined;
  if (!key) throw new Error("ORACLE_UPDATER_KEY missing from env");
  const oracle = process.env.ORACLE_ADDRESS as Address | undefined;
  if (!oracle) throw new Error("ORACLE_ADDRESS missing from env");
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(process.env.ARC_RPC_URL),
  });
  return { wallet, account: account.address, oracle };
}
