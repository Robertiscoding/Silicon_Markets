import "dotenv/config";
import { formatUnits, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { GpuSymbol } from "./config.js";
import { publicClient, walletFromEnv } from "./chain.js";
import { publishPrints } from "./publish.js";

/**
 * End-to-end payout demo for a settled market:
 *
 *   1. publish the official Ornn print for the market's settlement (idempotent)
 *   2. resolve the market against the oracle
 *   3. list every forecast with win/lose status
 *   4. claim every winning forecast owned by the configured wallet
 *   5. show the USDC balance delta
 *
 * Usage:
 *   npm run settle -- --market-id 0 [--symbol "RTX 5090"]
 *
 * Env: ORACLE_ADDRESS, ORACLE_UPDATER_KEY, MARKET_ADDRESS (SiliconMarket),
 *      optional ARC_RPC_URL.
 */

const MARKET_ABI = [
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
] as const;

const STATUS = ["Open", "Resolved", "Refunding"] as const;

async function main() {
  const args = process.argv.slice(2);
  let marketId = 0n;
  let symbol: GpuSymbol = "RTX 5090";
  for (let i = 0; i < args.length; ++i) {
    if (args[i] === "--market-id") marketId = BigInt(args[++i]);
    else if (args[i] === "--symbol") symbol = args[++i] as GpuSymbol;
  }

  const market = process.env.MARKET_ADDRESS as Address | undefined;
  if (!market) throw new Error("MARKET_ADDRESS missing from env");
  const { wallet, account } = walletFromEnv();
  const key = process.env.ORACLE_UPDATER_KEY as Hex;
  const me = privateKeyToAccount(key).address.toLowerCase();

  const fmt = (v: bigint) => `$${Number(formatUnits(v, 6)).toFixed(2)}`;
  const px = (v: bigint) => `$${(Number(v) / 1e8).toFixed(2)}`;

  const balanceBefore = await publicClient.getBalance({ address: account });

  // --- market state ---
  let m = await publicClient.readContract({
    address: market,
    abi: MARKET_ABI,
    functionName: "getMarket",
    args: [marketId],
  });
  console.log(`\n=== Payout demo · ${m.gpuSymbol} market #${marketId} ===`);
  console.log(`settlement : ${new Date(Number(m.settlementTs) * 1000).toUTCString()}`);
  console.log(`pool       : ${fmt(m.totalStake)} USDC`);
  console.log(`status     : ${STATUS[m.status]}`);

  // --- 1. publish the official print (no-op if already on-chain) ---
  console.log(`\n[1/4] publishing Ornn print for dayKey=${m.dayKey} ...`);
  const { pushed } = await publishPrints({ dayKey: Number(m.dayKey), onlySymbol: symbol });
  console.log(pushed > 0 ? "      print published on-chain." : "      print already on-chain.");

  // --- 2. resolve ---
  if (m.status === 0) {
    console.log(`\n[2/4] resolving market against the oracle ...`);
    const hash = await wallet.writeContract({
      account: wallet.account!,
      chain: publicClient.chain,
      address: market,
      abi: MARKET_ABI,
      functionName: "resolve",
      args: [marketId],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`      resolved. tx https://testnet.arcscan.app/tx/${hash}`);
  } else {
    console.log(`\n[2/4] market already ${STATUS[m.status]}.`);
  }

  m = await publicClient.readContract({
    address: market,
    abi: MARKET_ABI,
    functionName: "getMarket",
    args: [marketId],
  });
  console.log(`      settlement print: ${px(m.settlementPrice)}/hr`);

  // --- 3. enumerate forecasts ---
  const count = await publicClient.readContract({
    address: market,
    abi: MARKET_ABI,
    functionName: "forecastCount",
    args: [marketId],
  });
  console.log(`\n[3/4] forecasts (${count}):`);
  const price = Number(m.settlementPrice);
  const winners: bigint[] = [];
  for (let i = 0n; i < count; ++i) {
    const f = await publicClient.readContract({
      address: market,
      abi: MARKET_ABI,
      functionName: "getForecast",
      args: [marketId, i],
    });
    const lo = Number(f.center) - Number(f.band);
    const hi = Number(f.center) + Number(f.band);
    const win = price >= lo && price <= hi;
    const who = f.user.toLowerCase() === me ? "you" : `${f.user.slice(0, 6)}…`;
    console.log(
      `      #${i} ${px(f.center)} ± ${px(f.band)}  stake ${fmt(f.stake)}  ${who.padEnd(8)} ${
        win ? "✓ WIN" : "✗ lose"
      }${f.claimed ? " (claimed)" : ""}`,
    );
    if (win && !f.claimed && f.user.toLowerCase() === me) winners.push(i);
  }

  // --- 4. claim ---
  console.log(`\n[4/4] claiming ${winners.length} winning forecast(s) ...`);
  for (const id of winners) {
    const hash = await wallet.writeContract({
      account: wallet.account!,
      chain: publicClient.chain,
      address: market,
      abi: MARKET_ABI,
      functionName: "claim",
      args: [marketId, id],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`      claimed #${id}. tx https://testnet.arcscan.app/tx/${hash}`);
  }

  const balanceAfter = await publicClient.getBalance({ address: account });
  const delta = balanceAfter - balanceBefore;
  console.log(`\n=== Result ===`);
  console.log(`balance before : ${Number(formatUnits(balanceBefore, 18)).toFixed(4)} USDC`);
  console.log(`balance after  : ${Number(formatUnits(balanceAfter, 18)).toFixed(4)} USDC`);
  console.log(
    `net change     : ${delta >= 0n ? "+" : ""}${Number(formatUnits(delta, 18)).toFixed(4)} USDC (payouts minus gas)`,
  );
  console.log(
    `\nWinners split the ${fmt(m.totalStake)} pool pro-rata by stake, minus the 1% protocol fee.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
