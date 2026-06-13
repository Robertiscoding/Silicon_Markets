import type { Address } from "viem";
import { ARC_USDC_ADDRESS } from "./chain";

export const SILICON_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_SILICON_MARKET_ADDRESS ??
  "0x85Ba60E96b3f34e8dd276aFb75eD109533581b00") as Address;

export const ORNN_ORACLE_ADDRESS = (process.env.NEXT_PUBLIC_ORNN_ORACLE_ADDRESS ??
  "0x869977eD0D68b9F1265cbdf80648E629B40C7635") as Address;

export const BUCKET_MARKET_ADDRESS = (process.env.NEXT_PUBLIC_BUCKET_MARKET_ADDRESS ??
  "0x34a8935a3429bE67cC4622BaBEb9D7934a43097c") as Address;

export const USDC_ADDRESS = (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? ARC_USDC_ADDRESS) as Address;

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
    name: "impliedOddsBps",
    stateMutability: "view",
    inputs: [
      { name: "marketId", type: "uint256" },
      { name: "hypotheticalPrice", type: "uint128" },
    ],
    outputs: [{ name: "", type: "uint16" }],
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
] as const;
