import type { Address } from "viem";
import { ARC_USDC_ADDRESS } from "./chain";

export const SILICON_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_SILICON_MARKET_ADDRESS ??
  "0x85Ba60E96b3f34e8dd276aFb75eD109533581b00") as Address;

export const ORNN_ORACLE_ADDRESS = (process.env.NEXT_PUBLIC_ORNN_ORACLE_ADDRESS ??
  "0x869977eD0D68b9F1265cbdf80648E629B40C7635") as Address;

export const BUCKET_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_BUCKET_MARKET_ADDRESS ??
  "0x34a8935a3429bE67cC4622BaBEb9D7934a43097c") as Address;

/** Demo SiliconMarket (tradingCutoff = 0) used by the one-click settlement demo. */
export const DEMO_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_DEMO_MARKET_ADDRESS ??
  "0xfE3b59ACC233480C0ed58315fF08cf376c98c200") as Address;

export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ??
  ARC_USDC_ADDRESS) as Address;

/** Trimmed ABI exposing only the methods the UI calls. Generated from the Solidity sources. */
export const SILICON_MARKET_ABI = [
  {
    type: "function",
    name: "createMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gpuSymbol", type: "string" },
      { name: "settlementTs", type: "uint64" },
    ],
    outputs: [{ name: "marketId", type: "uint256" }],
  },
  {
    type: "function",
    name: "lockForecast",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "center", type: "int128" },
      { name: "band", type: "uint128" },
      { name: "stake", type: "uint128" },
    ],
    outputs: [{ name: "forecastId", type: "uint256" }],
  },
  {
    type: "function",
    name: "resolve",
    stateMutability: "nonpayable",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "forecastId", type: "uint256" },
    ],
    outputs: [{ name: "payout", type: "uint256" }],
  },
  {
    type: "function",
    name: "marketIdFor",
    stateMutability: "view",
    inputs: [
      { name: "gpuSymbol", type: "string" },
      { name: "settlementTs", type: "uint64" },
    ],
    outputs: [
      { name: "marketId", type: "uint256" },
      { name: "exists", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "marketCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "gpuSymbol", type: "string" },
          { name: "gpuSymbolHash", type: "bytes32" },
          { name: "settlementTs", type: "uint64" },
          { name: "dayKey", type: "uint256" },
          { name: "totalStake", type: "uint256" },
          { name: "winningStake", type: "uint256" },
          { name: "settlementPrice", type: "uint128" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "forecastCount",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getForecast",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "forecastId", type: "uint256" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "center", type: "int128" },
          { name: "band", type: "uint128" },
          { name: "stake", type: "uint128" },
          { name: "claimed", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "impliedOddsBps",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "hypotheticalPrice", type: "uint128" },
    ],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "event",
    name: "ForecastLocked",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "forecastId", type: "uint256", indexed: true },
      { name: "user", type: "address", indexed: true },
      { name: "center", type: "int128", indexed: false },
      { name: "band", type: "uint128", indexed: false },
      { name: "stake", type: "uint128", indexed: false },
    ],
  },
] as const;

export const BUCKET_MARKET_ABI = [
  {
    type: "function",
    name: "getMarket",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "gpuSymbol", type: "string" },
          { name: "gpuSymbolHash", type: "bytes32" },
          { name: "settlementTs", type: "uint64" },
          { name: "bucketLow", type: "uint128" },
          { name: "bucketWidth", type: "uint128" },
          { name: "bucketCount", type: "uint16" },
          { name: "winningBucket", type: "uint16" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "bestAsk",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "bucketIdx", type: "uint16" },
    ],
    outputs: [
      { name: "price", type: "uint128" },
      { name: "sizeAvailable", type: "uint128" },
      { name: "maker", type: "address" },
      { name: "askId", type: "uint256" },
      { name: "exists", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "quoteBucket",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "bucketIdx", type: "uint16" },
      { name: "maxShares", type: "uint128" },
    ],
    outputs: [
      { name: "sharesAvailable", type: "uint128" },
      { name: "totalCost", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "fillBucketsAround",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "centerBucket", type: "uint16" },
      { name: "halfWidth", type: "uint16" },
      { name: "sharesPerBucket", type: "uint128" },
      { name: "maxCost", type: "uint128" },
    ],
    outputs: [
      { name: "totalShares", type: "uint128" },
      { name: "totalCost", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "marketIdFor",
    stateMutability: "view",
    inputs: [
      { name: "gpuSymbol", type: "string" },
      { name: "settlementTs", type: "uint64" },
    ],
    outputs: [
      { name: "marketId", type: "uint256" },
      { name: "exists", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "postAsk",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "bucketIdx", type: "uint16" },
      { name: "pricePerShare", type: "uint128" },
      { name: "size", type: "uint128" },
    ],
    outputs: [{ name: "askId", type: "uint256" }],
  },
  {
    type: "function",
    name: "fillBucket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "bucketIdx", type: "uint16" },
      { name: "maxShares", type: "uint128" },
      { name: "maxCost", type: "uint128" },
    ],
    outputs: [
      { name: "sharesBought", type: "uint128" },
      { name: "costPaid", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "claimYes",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "bucketIdx", type: "uint16" },
    ],
    outputs: [{ name: "payout", type: "uint256" }],
  },
  {
    type: "function",
    name: "yesShares",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "bucketIdx", type: "uint256" },
      { name: "holder", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "AskPosted",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "bucketIdx", type: "uint256", indexed: true },
      { name: "askId", type: "uint256", indexed: true },
      { name: "maker", type: "address", indexed: false },
      { name: "pricePerShare", type: "uint128", indexed: false },
      { name: "size", type: "uint128", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Filled",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "bucketIdx", type: "uint256", indexed: true },
      { name: "askId", type: "uint256", indexed: true },
      { name: "taker", type: "address", indexed: false },
      { name: "maker", type: "address", indexed: false },
      { name: "shares", type: "uint128", indexed: false },
      { name: "cost", type: "uint128", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AskCancelled",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "bucketIdx", type: "uint256", indexed: true },
      { name: "askId", type: "uint256", indexed: true },
    ],
  },
  {
    type: "event",
    name: "MarketResolved",
    inputs: [
      { name: "marketId", type: "uint256", indexed: true },
      { name: "settlementPrice", type: "uint128", indexed: false },
      { name: "winningBucket", type: "uint16", indexed: false },
    ],
  },
] as const;

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
    name: "isUpdater",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;
