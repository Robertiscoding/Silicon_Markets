"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from "wagmi";
import { SILICON_MARKET_ABI, SILICON_MARKET_ADDRESS } from "@/lib/contracts";
import { arcscanTx } from "@/lib/chain";
import { formatUsd } from "@/lib/markets";

const MAX_MARKETS = 12;
const MAX_FORECASTS = 10;

interface Row {
  marketId: number;
  forecastId: number;
  gpuSymbol: string;
  settlePrice: number;
  refunded: boolean;
  center: number;
  band: number;
  stake: number;
  win: boolean;
  payout: number;
  claimed: boolean;
}

export function PayoutsView() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [status, setStatus] = useState("");
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: count, refetch: refetchCount } = useReadContract({
    address: SILICON_MARKET_ADDRESS,
    abi: SILICON_MARKET_ABI,
    functionName: "marketCount",
  });

  const total = Number(count ?? 0);
  const ids = useMemo(
    () => Array.from({ length: Math.min(total, MAX_MARKETS) }, (_, i) => total - 1 - i),
    [total],
  );

  const { data: marketReads, refetch: refetchMarkets } = useReadContracts({
    contracts: ids.map((i) => ({
      address: SILICON_MARKET_ADDRESS,
      abi: SILICON_MARKET_ABI,
      functionName: "getMarket" as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: ids.length > 0 },
  });

  const { data: countReads } = useReadContracts({
    contracts: ids.map((i) => ({
      address: SILICON_MARKET_ADDRESS,
      abi: SILICON_MARKET_ABI,
      functionName: "forecastCount" as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: ids.length > 0 },
  });

  const pairs = useMemo(() => {
    if (!countReads) return [];
    const out: { marketId: number; forecastId: number }[] = [];
    ids.forEach((marketId, k) => {
      const res = countReads[k];
      if (res?.status !== "success") return;
      const n = Math.min(Number(res.result), MAX_FORECASTS);
      for (let f = 0; f < n; f++) out.push({ marketId, forecastId: f });
    });
    return out;
  }, [countReads, ids]);

  const { data: forecastReads, refetch: refetchForecasts } = useReadContracts({
    contracts: pairs.map((p) => ({
      address: SILICON_MARKET_ADDRESS,
      abi: SILICON_MARKET_ABI,
      functionName: "getForecast" as const,
      args: [BigInt(p.marketId), BigInt(p.forecastId)] as const,
    })),
    query: { enabled: pairs.length > 0 },
  });

  const rows = useMemo<Row[]>(() => {
    if (!forecastReads || !marketReads || !address) return [];
    const me = address.toLowerCase();
    const marketById = new Map<number, NonNullable<(typeof marketReads)[number]["result"]>>();
    ids.forEach((id, k) => {
      const res = marketReads[k];
      if (res?.status === "success" && res.result) marketById.set(id, res.result);
    });

    return pairs.flatMap((p, k) => {
      const res = forecastReads[k];
      const m = marketById.get(p.marketId);
      if (res?.status !== "success" || !res.result || !m) return [];
      if (m.status === 0) return [];
      const f = res.result;
      if (f.user.toLowerCase() !== me) return [];

      const refunded = m.status === 2;
      const settlePrice = Number(m.settlementPrice) / 1e8;
      const center = Number(f.center) / 1e8;
      const band = Number(f.band) / 1e8;
      const stake = Number(f.stake) / 1e6;
      const win = !refunded && Math.abs(settlePrice - center) <= band;
      const pool = Number(m.totalStake) / 1e6;
      const winningStake = Number(m.winningStake) / 1e6;
      const payout =
        refunded ? stake : win && winningStake > 0 ? (pool * 0.99 * stake) / winningStake : 0;

      return [
        {
          marketId: p.marketId,
          forecastId: p.forecastId,
          gpuSymbol: m.gpuSymbol,
          settlePrice,
          refunded,
          center,
          band,
          stake,
          win,
          payout: +payout.toFixed(4),
          claimed: f.claimed,
        },
      ];
    });
  }, [forecastReads, marketReads, pairs, ids, address]);

  const claimable = rows.filter((r) => (r.win || r.refunded) && !r.claimed);
  const totalClaimable = claimable.reduce((s, r) => s + r.payout, 0);

  async function handleClaim(r: Row) {
    const id = `${r.marketId}-${r.forecastId}`;
    setBusyId(id);
    try {
      setStatus(`Claiming ${formatUsd(r.payout)}…`);
      const hash = await writeContractAsync({
        address: SILICON_MARKET_ADDRESS,
        abi: SILICON_MARKET_ABI,
        functionName: "claim",
        args: [BigInt(r.marketId), BigInt(r.forecastId)],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      setLastTxHash(hash);
      setStatus(`Claimed ${formatUsd(r.payout)}`);
      refetchCount();
      refetchMarkets();
      refetchForecasts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg.slice(0, 120)}`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-[900px] mx-auto w-full flex flex-col gap-4">
      <div>
        <h1 className="font-display text-[26px] text-foreground m-0">Payouts</h1>
        <p className="text-muted-strong text-[13px] mt-1">
          Claimable: <span className="text-accent">{formatUsd(totalClaimable)}</span>
        </p>
      </div>

      {!address ? (
        <div className="panel p-5 text-muted-strong text-[13px]">Connect wallet to view payouts.</div>
      ) : rows.length === 0 ? (
        <div className="panel p-5 text-muted-strong text-[13px]">No settled positions yet.</div>
      ) : (
        <div className="panel overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-muted">
                <th className="px-4 py-3 font-medium">Market</th>
                <th className="px-4 py-3 font-medium">Settled</th>
                <th className="px-4 py-3 font-medium">Band</th>
                <th className="px-4 py-3 font-medium text-right">Stake</th>
                <th className="px-4 py-3 font-medium text-right">Payout</th>
                <th className="px-4 py-3 font-medium text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = `${r.marketId}-${r.forecastId}`;
                const inBand = r.win || r.refunded;
                return (
                  <tr key={id} className="border-b border-[var(--border)] last:border-0">
                    <td className="px-4 py-3 text-foreground">
                      {r.gpuSymbol} #{r.marketId}
                    </td>
                    <td className="px-4 py-3 text-muted-strong">
                      ${r.settlePrice.toFixed(2)}
                      {r.refunded ? " (refund)" : ""}
                    </td>
                    <td className="px-4 py-3 font-mono-thin text-muted-strong tabular-nums">
                      ${(r.center - r.band).toFixed(2)}–${(r.center + r.band).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatUsd(r.stake)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {inBand ? (
                        <span className="text-accent">{formatUsd(r.payout)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inBand && !r.claimed ? (
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => handleClaim(r)}
                          className="btn-outline text-[11px] py-1 px-3 disabled:opacity-40"
                        >
                          {busyId === id ? "…" : "Claim"}
                        </button>
                      ) : inBand ? (
                        <span className="text-muted text-[11px]">claimed</span>
                      ) : (
                        <span className="text-[var(--danger)] text-[11px]">lost</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {status ? (
        <p className="text-[11px] text-muted m-0">
          {status}
          {lastTxHash ? (
            <>
              {" · "}
              <a
                href={arcscanTx(lastTxHash)}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                tx
              </a>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
