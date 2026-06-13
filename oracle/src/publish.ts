import "dotenv/config";
import { keccak256, toBytes } from "viem";
import { GPU_SYMBOLS, type GpuSymbol } from "./config.js";
import { ORNN_ORACLE_ABI, publicClient, walletFromEnv } from "./chain.js";
import { loadPrints } from "./store.js";

interface PublishOptions {
  /** If set, only push the print whose dayKey matches this unix seconds value. */
  dayKey?: number;
  /** If true, push every locally-known print that's missing from the oracle. */
  catchUp?: boolean;
  /** Limit to one symbol (handy for testing). */
  onlySymbol?: GpuSymbol;
}

/** Pushes prints from the local store onto OrnnOracle. */
export async function publishPrints(options: PublishOptions = {}): Promise<{ pushed: number }> {
  const { wallet, oracle } = walletFromEnv();
  const store = await loadPrints();
  let pushed = 0;

  const symbols: GpuSymbol[] = options.onlySymbol ? [options.onlySymbol] : [...GPU_SYMBOLS];

  for (const symbol of symbols) {
    const list = store.symbols[symbol] ?? [];
    if (list.length === 0) continue;
    const symHash = keccak256(toBytes(symbol));

    const candidates = options.dayKey
      ? list.filter((p) => p.dayKey === options.dayKey)
      : options.catchUp
        ? list
        : list.slice(-1); // default: only the latest print

    for (const print of candidates) {
      const [, , exists] = await publicClient.readContract({
        address: oracle,
        abi: ORNN_ORACLE_ABI,
        functionName: "getPrintBySymbolHash",
        args: [symHash, BigInt(print.dayKey)],
      });
      if (exists) continue;

      // Use the wallet's attached local account (signs via eth_sendRawTransaction);
      // passing a bare address would make viem attempt wallet_sendTransaction.
      const hash = await wallet.writeContract({
        account: wallet.account!,
        chain: publicClient.chain,
        address: oracle,
        abi: ORNN_ORACLE_ABI,
        functionName: "publishPrint",
        args: [symbol, BigInt(print.dayKey), BigInt(print.priceScaled)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      pushed += 1;
      console.log(
        `[publish] ${symbol} day=${print.dayKey} price=${print.price} tx=${hash} block=${receipt.blockNumber}`,
      );
    }
  }
  return { pushed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const opts: PublishOptions = {};
  for (let i = 0; i < args.length; ++i) {
    const a = args[i];
    if (a === "--catch-up") opts.catchUp = true;
    else if (a === "--day-key") opts.dayKey = Number(args[++i]);
    else if (a === "--symbol") opts.onlySymbol = args[++i] as GpuSymbol;
  }
  publishPrints(opts)
    .then((r) => console.log(`[publish] done, pushed=${r.pushed}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
