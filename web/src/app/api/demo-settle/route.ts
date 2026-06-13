import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, ARC_RPC_URL } from "@/lib/chain";
import {
  ORNN_ORACLE_ABI,
  ORNN_ORACLE_ADDRESS,
  SILICON_MARKET_ABI,
  SILICON_MARKET_ADDRESS,
} from "@/lib/contracts";
import { loadMarketSeries } from "@/lib/load-series";
import type { GpuSymbol } from "@/lib/markets";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      symbol?: GpuSymbol;
      address?: Address;
      settlementTs?: number;
    };
    const symbol = body.symbol ?? "RTX 5090";

    const key = process.env.DEMO_PRIVATE_KEY as Hex | undefined;
    if (!key) {
      return NextResponse.json({ error: "DEMO_PRIVATE_KEY not configured" }, { status: 500 });
    }
    const DEMO_MARKET = (process.env.DEMO_MARKET_ADDRESS ??
      process.env.NEXT_PUBLIC_DEMO_MARKET_ADDRESS) as Address | undefined;
    if (!DEMO_MARKET) {
      return NextResponse.json({ error: "DEMO_MARKET_ADDRESS not configured" }, { status: 500 });
    }

    const account = privateKeyToAccount(key);
    const pc = createPublicClient({
      chain: arcTestnet,
      transport: http(ARC_RPC_URL),
      pollingInterval: 1_000,
    });
    const wc = createWalletClient({ account, chain: arcTestnet, transport: http(ARC_RPC_URL) });

    const send = async (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params: any,
    ): Promise<Hex> => {
      const hash = await wc.writeContract({ account, chain: arcTestnet, ...params });
      await pc.waitForTransactionReceipt({ hash });
      return hash;
    };

    const series = await loadMarketSeries();
    const spot = series[symbol]?.at(-1)?.price;
    if (!spot) return NextResponse.json({ error: "no spot price available" }, { status: 500 });

    let seeds: { center: number; band: number; stake: bigint }[] = [];
    let mirrored = false;
    if (body.address && body.settlementTs) {
      const [liveId, exists] = await pc.readContract({
        address: SILICON_MARKET_ADDRESS,
        abi: SILICON_MARKET_ABI,
        functionName: "marketIdFor",
        args: [symbol, BigInt(body.settlementTs)],
      });
      if (exists) {
        const n = Number(
          await pc.readContract({
            address: SILICON_MARKET_ADDRESS,
            abi: SILICON_MARKET_ABI,
            functionName: "forecastCount",
            args: [liveId],
          }),
        );
        const me = body.address.toLowerCase();
        for (let i = 0; i < Math.min(n, 30) && seeds.length < 5; i++) {
          const f = await pc.readContract({
            address: SILICON_MARKET_ADDRESS,
            abi: SILICON_MARKET_ABI,
            functionName: "getForecast",
            args: [liveId, BigInt(i)],
          });
          if (f.user.toLowerCase() !== me) continue;
          seeds.push({
            center: Number(f.center) / 1e8,
            band: Number(f.band) / 1e8,
            stake: BigInt(Math.min(Number(f.stake), 1_000_000)),
          });
        }
        mirrored = seeds.length > 0;
      }
    }
    if (seeds.length === 0) {
      seeds = [
        { center: spot, band: spot * 0.03, stake: BigInt(400_000) },
        { center: spot * 1.04, band: spot * 0.015, stake: BigInt(300_000) },
        { center: spot * 0.96, band: spot * 0.015, stake: BigInt(300_000) },
      ];
    }

    const txs: Record<string, string | string[]> = {};

    const latestBlock = await pc.getBlock();
    let settlementTs = Number(latestBlock.timestamp) + 15 + seeds.length * 6;
    for (;;) {
      const [, exists] = await pc.readContract({
        address: DEMO_MARKET,
        abi: SILICON_MARKET_ABI,
        functionName: "marketIdFor",
        args: [symbol, BigInt(settlementTs)],
      });
      if (!exists) break;
      settlementTs += 1;
    }
    txs.create = await send({
      address: DEMO_MARKET,
      abi: SILICON_MARKET_ABI,
      functionName: "createMarket",
      args: [symbol, BigInt(settlementTs)],
    });
    const [marketId] = await pc.readContract({
      address: DEMO_MARKET,
      abi: SILICON_MARKET_ABI,
      functionName: "marketIdFor",
      args: [symbol, BigInt(settlementTs)],
    });

    const toScaled = (usd: number) => BigInt(Math.round(usd * 1e8));
    txs.locks = [];
    for (const s of seeds) {
      (txs.locks as string[]).push(
        await send({
          address: DEMO_MARKET,
          abi: SILICON_MARKET_ABI,
          functionName: "lockForecast",
          args: [marketId, toScaled(s.center), toScaled(s.band), s.stake],
        }),
      );
    }

    for (;;) {
      const block = await pc.getBlock();
      if (Number(block.timestamp) >= settlementTs) break;
      await sleep(2000);
    }

    const movePct = Math.random() * 10 - 5;
    const settlePrice = +(spot * (1 + movePct / 100)).toFixed(4);
    txs.publish = await send({
      address: ORNN_ORACLE_ADDRESS,
      abi: ORNN_ORACLE_ABI,
      functionName: "publishPrint",
      args: [symbol, BigInt(settlementTs), toScaled(settlePrice)],
    });

    txs.resolve = await send({
      address: DEMO_MARKET,
      abi: SILICON_MARKET_ABI,
      functionName: "resolve",
      args: [marketId],
    });
    const market = await pc.readContract({
      address: DEMO_MARKET,
      abi: SILICON_MARKET_ABI,
      functionName: "getMarket",
      args: [marketId],
    });
    const refunded = market.status === 2;
    const pool = Number(market.totalStake) / 1e6;
    const winningStake = Number(market.winningStake) / 1e6;

    const results = seeds.map((s) => {
      const win = !refunded && Math.abs(settlePrice - s.center) <= s.band;
      const stake = Number(s.stake) / 1e6;
      const payout =
        refunded ? stake : win && winningStake > 0 ? (pool * 0.99 * stake) / winningStake : 0;
      return {
        center: s.center,
        band: s.band,
        stake,
        win,
        payout: +payout.toFixed(4),
      };
    });

    return NextResponse.json({
      marketId: Number(marketId),
      mirrored,
      spot,
      settlePrice,
      movePct: +movePct.toFixed(2),
      refunded,
      pool,
      winningStake,
      results,
      totalWon: +results.reduce((s, r) => s + r.payout, 0).toFixed(4),
      txs,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 300) }, { status: 500 });
  }
}
