"use client";

import { useMemo, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
  useWriteContract,
} from "wagmi";
import { maxUint256 } from "viem";
import {
  ERC20_ABI,
  SILICON_MARKET_ABI,
  SILICON_MARKET_ADDRESS,
  USDC_ADDRESS,
} from "@/lib/contracts";
import {
  expectedPayout,
  formatUsd,
  gaussianBandProbability,
  impliedOddsLabel,
  priceToScaled,
  rawToUsdc,
  usdcToRaw,
  type GpuSymbol,
} from "@/lib/markets";
import { PoolDepthModal } from "./pool-depth-modal";
import { GlassToggle } from "./glass";

interface ForecastPanelProps {
  symbol: GpuSymbol;
  marketId: bigint | null;
  spotPrice: number;
  forecastCenter: number;
  forecastBand: number;
  stakeUsd: number;
  onStakeChange: (s: number) => void;
  onBandChange: (b: number) => void;
  settlementTs: number;
  nowTs: number;
}

const STAKE_PRESETS = [10, 50, 100];

/** Fallback grid geometry when no on-chain book exists yet (centered on spot). */
const FALLBACK_BUCKET_WIDTH = 0.01;
const FALLBACK_BUCKET_COUNT = 24;

export function ForecastPanel({
  symbol,
  marketId,
  spotPrice,
  forecastCenter,
  forecastBand,
  stakeUsd,
  onStakeChange,
  onBandChange,
  settlementTs,
  nowTs,
}: ForecastPanelProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const [status, setStatus] = useState<string>("");
  const [bookOpen, setBookOpen] = useState(false);
  const [funding, setFunding] = useState(false);

  // Self-serve top-up via Circle App Kit Send (server route holds the key).
  async function handleFund() {
    if (!address || funding) return;
    setFunding(true);
    setStatus("Sending test USDC via Circle App Kit…");
    try {
      const res = await fetch("/api/fund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setStatus(`Funded $${data.amount} USDC · tx ${String(data.txHash ?? "").slice(0, 10)}…`);
      refetchBalance();
    } catch (err: unknown) {
      setStatus(`Funding failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setFunding(false);
    }
  }

  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });
  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, SILICON_MARKET_ADDRESS] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const stakeRaw = useMemo(() => usdcToRaw(stakeUsd), [stakeUsd]);

  const { data: oddsBpsAtCenter, refetch: refetchOdds } = useReadContract({
    address: SILICON_MARKET_ADDRESS,
    abi: SILICON_MARKET_ABI,
    functionName: "impliedOddsBps",
    args: marketId !== null ? [marketId, priceToScaled(forecastCenter)] : undefined,
    query: { enabled: marketId !== null, refetchInterval: 18_000 },
  });
  const onchainOddsBps = oddsBpsAtCenter ?? 0;

  // Real pool size — payouts are pari-mutuel, so winnings can never exceed
  // what's actually staked in the pool (plus your own stake), minus the fee.
  const { data: poolInfo, refetch: refetchPool } = useReadContract({
    address: SILICON_MARKET_ADDRESS,
    abi: SILICON_MARKET_ABI,
    functionName: "getMarket",
    args: marketId !== null ? [marketId] : undefined,
    query: { enabled: marketId !== null, refetchInterval: 18_000 },
  });
  const poolUsd = poolInfo ? Number(poolInfo.totalStake) / 1e6 : null;

  // All forecasts in the market, so we can surface the connected wallet's
  // positions right after they lock one.
  const { data: numForecasts, refetch: refetchCount } = useReadContract({
    address: SILICON_MARKET_ADDRESS,
    abi: SILICON_MARKET_ABI,
    functionName: "forecastCount",
    args: marketId !== null ? [marketId] : undefined,
    query: { enabled: marketId !== null, refetchInterval: 30_000 },
  });
  const forecastTotal = Math.min(Number(numForecasts ?? 0), 100);
  const { data: forecastReads, refetch: refetchForecasts } = useReadContracts({
    contracts:
      marketId !== null && forecastTotal > 0
        ? Array.from({ length: forecastTotal }, (_, i) => ({
            address: SILICON_MARKET_ADDRESS,
            abi: SILICON_MARKET_ABI,
            functionName: "getForecast" as const,
            args: [marketId as bigint, BigInt(i)] as const,
          }))
        : [],
    query: { enabled: marketId !== null && forecastTotal > 0 },
  });
  const allForecasts = useMemo(() => {
    if (!forecastReads) return [];
    return forecastReads.flatMap((res) => {
      if (res.status !== "success" || !res.result) return [];
      const f = res.result;
      return [
        {
          user: f.user.toLowerCase(),
          center: Number(f.center) / 1e8,
          band: Number(f.band) / 1e8,
          stake: Number(f.stake) / 1e6,
        },
      ];
    });
  }, [forecastReads]);
  const myForecasts = useMemo(
    () => (address ? allForecasts.filter((f) => f.user === address.toLowerCase()) : []),
    [allForecasts, address],
  );

  // Any new forecast (yours included) refreshes pool, odds and positions via WSS.
  useWatchContractEvent({
    address: SILICON_MARKET_ADDRESS,
    abi: SILICON_MARKET_ABI,
    eventName: "ForecastLocked",
    args: marketId !== null ? { marketId } : undefined,
    enabled: marketId !== null,
    onLogs: () => {
      refetchPool();
      refetchOdds();
      refetchCount();
      refetchForecasts();
    },
  });

  // Gaussian backstop for when the pool can't price the band yet.
  const fallbackProb = useMemo(
    () => gaussianBandProbability(spotPrice, forecastCenter, forecastBand),
    [spotPrice, forecastCenter, forecastBand],
  );
  const fallbackBps = Math.round(Math.max(0.005, Math.min(0.99, fallbackProb)) * 10_000);

  // Odds come from the live pari-mutuel pool, falling back to the Gaussian
  // band estimate when the pool can't price the band yet.
  const effectiveOddsBps = onchainOddsBps > 0 ? onchainOddsBps : fallbackBps;
  const oddsSource: "chain" | "fallback" = onchainOddsBps > 0 ? "chain" : "fallback";
  const isFirstMover = oddsSource === "fallback" && poolUsd !== null && poolUsd === 0;

  // Odds-implied payout, hard-capped by the pari-mutuel pool: even if you're
  // the only winner you collect at most (pool + your stake) × (1 − 1% fee).
  const oddsPayout = expectedPayout(stakeUsd, effectiveOddsBps);
  const poolCap = poolUsd !== null ? (poolUsd + stakeUsd) * 0.99 : null;
  const payout = poolCap !== null ? Math.min(oddsPayout, poolCap) : oddsPayout;
  const poolCapped = poolCap !== null && oddsPayout > poolCap;

  // -------- pool depth (one chart, real stakes only) --------
  // The range is anchored to PLACED on-chain forecasts (min/max of every
  // center ± band) plus spot — deliberately NOT the band being dragged, so the
  // chart doesn't rescale under the cursor and the spread stays readable.
  const depth = useMemo(() => {
    const center = spotPrice > 0 ? spotPrice : forecastCenter || 1;
    let lo = center - (FALLBACK_BUCKET_COUNT / 2) * FALLBACK_BUCKET_WIDTH;
    let hi = center + (FALLBACK_BUCKET_COUNT / 2) * FALLBACK_BUCKET_WIDTH;
    for (const f of allForecasts) {
      lo = Math.min(lo, f.center - f.band);
      hi = Math.max(hi, f.center + f.band);
    }
    lo = Math.max(0.01, Math.floor(lo * 100) / 100 - FALLBACK_BUCKET_WIDTH);
    hi = Math.ceil(hi * 100) / 100 + FALLBACK_BUCKET_WIDTH;
    // Keep the bar count readable: widen buckets if the range is large.
    const rawCount = Math.round((hi - lo) / FALLBACK_BUCKET_WIDTH);
    const width =
      rawCount > 36
        ? Math.ceil(rawCount / FALLBACK_BUCKET_COUNT) * FALLBACK_BUCKET_WIDTH
        : FALLBACK_BUCKET_WIDTH;
    const count = Math.max(FALLBACK_BUCKET_COUNT, Math.ceil((hi - lo) / width));

    return Array.from({ length: count }, (_, i) => {
      const bucketLow = +(lo + i * width).toFixed(4);
      const bucketHigh = +(bucketLow + width).toFixed(4);
      let pool = 0;
      let mine = 0;
      for (const f of allForecasts) {
        if (f.center - f.band <= bucketHigh && f.center + f.band >= bucketLow) {
          pool += f.stake;
          if (address && f.user === address.toLowerCase()) mine += f.stake;
        }
      }
      return {
        bucketIdx: i,
        bucketLow,
        bucketHigh,
        poolUsd: pool,
        mineUsd: mine,
        isCovered:
          forecastCenter - forecastBand <= bucketHigh && forecastCenter + forecastBand >= bucketLow,
      };
    });
  }, [allForecasts, address, spotPrice, forecastCenter, forecastBand]);
  const maxDepthUsd = Math.max(0.01, ...depth.map((d) => d.poolUsd));

  // -------- tx wiring --------
  const { writeContractAsync, data: txHash } = useWriteContract();
  const { isLoading: txPending } = useWaitForTransactionReceipt({ hash: txHash });

  const visibleStatus = useMemo(() => {
    if (status) return status;
    if (txHash) return `Transaction submitted: ${txHash.slice(0, 10)}…`;
    return "";
  }, [status, txHash]);

  async function handleLock() {
    if (!address) return;
    try {
      // Markets roll daily; creation is permissionless. If no market exists
      // for the upcoming settlement yet, create it as part of the same flow.
      let id = marketId;
      if (id === null) {
        setStatus("Creating market for this settlement…");
        const createHash = await writeContractAsync({
          address: SILICON_MARKET_ADDRESS,
          abi: SILICON_MARKET_ABI,
          functionName: "createMarket",
          args: [symbol, BigInt(settlementTs)],
        });
        await publicClient?.waitForTransactionReceipt({ hash: createHash });
        const lookup = await publicClient?.readContract({
          address: SILICON_MARKET_ADDRESS,
          abi: SILICON_MARKET_ABI,
          functionName: "marketIdFor",
          args: [symbol, BigInt(settlementTs)],
        });
        if (!lookup || !lookup[1]) throw new Error("Market creation didn't register");
        id = lookup[0];
      }

      const needsApproval = !allowance || (allowance as bigint) < stakeRaw;
      if (needsApproval) {
        setStatus("Approving USDC…");
        const approveHash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [SILICON_MARKET_ADDRESS, maxUint256],
        });
        // Wait for the approval to mine so the lock can't race it and revert.
        await publicClient?.waitForTransactionReceipt({ hash: approveHash });
      }
      setStatus("Locking forecast…");
      const hash = await writeContractAsync({
        address: SILICON_MARKET_ADDRESS,
        abi: SILICON_MARKET_ABI,
        functionName: "lockForecast",
        args: [
          id,
          priceToScaled(forecastCenter),
          priceToScaled(forecastBand),
          stakeRaw,
        ],
      });
      setStatus(`Locked! tx ${hash.slice(0, 10)}…`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg.slice(0, 120)}`);
    }
  }

  const usdcAvailable = usdcBalance ? rawToUsdc(usdcBalance as bigint) : 0;
  const maxStake = Math.max(100, Math.floor(usdcAvailable));
  const tradingClosed = nowTs > 0 && nowTs >= settlementTs - 300;
  const lockedOut =
    !address || stakeUsd <= 0 || stakeUsd > usdcAvailable || txPending || tradingClosed;

  const stakeMaxSlider = Math.max(maxStake, 250);

  return (
    <div className="panel p-4 flex flex-col gap-3.5 h-full">
      {/* Oracle header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[12px] text-foreground font-medium">Oracle</div>
          <div className="text-[11px] text-muted mt-0.5">Ornn RTX rental index</div>
        </div>
        <button
          type="button"
          onClick={() => setBookOpen(true)}
          title="Expanded view of the pool depth chart with every forecast listed"
          className="shrink-0 text-[10px] font-mono-thin px-2 py-1 rounded-full border border-[var(--border-strong)] text-muted-strong hover:text-accent hover:border-[var(--accent)] transition-colors"
        >
          <span className="text-accent">pool depth</span> ↗
        </button>
      </div>

      <PoolDepthModal
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        symbol={symbol}
        depth={depth}
        forecasts={allForecasts}
        myAddress={address}
        poolUsd={poolUsd}
        forecastCenter={forecastCenter}
        forecastBand={forecastBand}
      />

      <div className="h-px divider" />

      {/* Your Forecast */}
      <div>
        <div className="text-[11px] text-muted-strong font-medium">Your Forecast</div>
        <div className="flex items-baseline gap-1 mt-1.5">
          <span className="font-display text-[32px] text-accent glow-text leading-none tabular-nums">
            ${forecastCenter.toFixed(2)}
          </span>
          <span className="text-foreground text-[14px] tabular-nums">
            ± ${forecastBand.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Pool depth — real on-chain stakes per price bucket */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted">Pool depth</span>
          <span
            className="text-[10px] text-muted-strong inline-flex items-center gap-1.5"
            title="Live on-chain stakes, read from the Arc market contract"
          >
            <span className="pulse-dot" /> live
          </span>
        </div>
        <div className="grid grid-flow-col auto-cols-fr gap-[1.5px] items-end h-[56px] panel-flat p-1">
          {depth.map((d) => {
            const isEmpty = d.poolUsd <= 0;
            const heightPct = Math.max(10, (d.poolUsd / maxDepthUsd) * 100);
            const label = `$${d.bucketLow.toFixed(2)}–$${d.bucketHigh.toFixed(2)} · staked $${d.poolUsd.toFixed(2)}${d.mineUsd > 0 ? ` (yours $${d.mineUsd.toFixed(2)})` : ""}`;
            return (
              <div key={d.bucketIdx} className="h-full flex items-end" title={label}>
                {isEmpty ? (
                  <div
                    className={`w-full h-full rounded-sm border border-dashed transition-colors duration-150 ${
                      d.isCovered
                        ? "border-[rgba(60,224,107,0.55)] bg-[rgba(60,224,107,0.1)]"
                        : "border-[var(--border)]"
                    }`}
                  />
                ) : (
                  <div
                    className={`w-full rounded-t-sm transition-[height,background] duration-150 ${
                      d.isCovered
                        ? "bg-[var(--accent)] shadow-[0_0_18px_rgba(60,224,107,0.45)]"
                        : "bg-[rgba(80,200,120,0.22)]"
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[9.5px] text-muted font-mono-thin mt-1">
          <span>
            {forecastCenter - forecastBand < (depth[0]?.bucketLow ?? 0) && (
              <span className="text-accent">← </span>
            )}
            ${depth[0]?.bucketLow.toFixed(2) ?? ""}
          </span>
          <span className="text-accent">
            ${(forecastCenter - forecastBand).toFixed(2)}–${(forecastCenter + forecastBand).toFixed(2)}
          </span>
          <span>
            ${depth[depth.length - 1]?.bucketHigh.toFixed(2) ?? ""}
            {forecastCenter + forecastBand > (depth[depth.length - 1]?.bucketHigh ?? Infinity) && (
              <span className="text-accent"> →</span>
            )}
          </span>
        </div>
      </div>

      {/* Stake */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-foreground font-medium">Stake</span>
          <span className="text-[11.5px] text-muted-strong font-mono-thin tabular-nums">
            ${stakeUsd.toFixed(0)} USDC
          </span>
        </div>
        <div className="mt-2.5">
          <input
            type="range"
            min={1}
            max={stakeMaxSlider}
            step={1}
            value={stakeUsd}
            onChange={(e) => onStakeChange(Number(e.target.value))}
          />
        </div>
        <div className="mt-3">
          <GlassToggle
            options={[
              ...STAKE_PRESETS.map((amt) => ({ value: amt, label: `$${amt}` })),
              { value: maxStake, label: "MAX" },
            ]}
            value={stakeUsd}
            onChange={onStakeChange}
            stretch
            optionClassName="text-[12px] py-1.5 px-1"
          />
        </div>
      </div>

      {/* Confidence band */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-foreground font-medium">
            Confidence Band <span className="text-muted">(±)</span>
          </span>
          <span className="text-[11.5px] text-muted-strong font-mono-thin tabular-nums">
            ± ${forecastBand.toFixed(2)}
          </span>
        </div>
        <div className="mt-2.5">
          <input
            type="range"
            min={0.01}
            max={Math.max(0.5, spotPrice * 0.3)}
            step={0.005}
            value={forecastBand}
            onChange={(e) => onBandChange(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="h-px divider" />

      {/* Payout */}
      <div
        title={
          poolCapped
            ? `Capped by pool size — ${formatUsd(poolUsd ?? 0, 2)} staked so far + your stake, −1% fee. Winners split what's actually in the pool.`
            : undefined
        }
      >
        <div className="text-[11.5px] text-foreground font-medium">If Correct, You Win</div>
        <div className="font-display text-[34px] leading-none mt-1.5 tabular-nums text-accent glow-text">
          {formatUsd(payout, 2)}
        </div>
        <div className="text-[10.5px] text-muted mt-1.5">
          {impliedOddsLabel(effectiveOddsBps)} odds
          {poolUsd !== null && <span> · {formatUsd(poolUsd, 2)} pool</span>}
        </div>
      </div>

      {/* Your locked forecasts (pari-mutuel pool positions) */}
      {myForecasts.length > 0 && (
        <div className="panel-flat p-2.5">
          <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted mb-1.5">
            Your forecasts in this pool
          </div>
          <div className="flex flex-col gap-1">
            {myForecasts.map((f, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-[11px] font-mono-thin tabular-nums"
              >
                <span className="text-foreground">
                  ${f.center.toFixed(2)} ± ${f.band.toFixed(2)}
                </span>
                <span className="text-muted-strong">{formatUsd(f.stake, 2)} staked</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <button
        type="button"
        disabled={lockedOut}
        onClick={handleLock}
        className="btn-accent w-full py-3 text-[14px]"
      >
        {!address
          ? "Connect wallet to forecast"
          : tradingClosed
            ? "Trading closed"
            : stakeUsd > usdcAvailable
              ? "Insufficient USDC"
              : txPending
                ? "Confirming…"
                : marketId === null
                  ? "Create market & forecast"
                  : isFirstMover
                    ? "Be the first forecaster"
                    : "Place Forecast"}
      </button>

      {/* Self-fund via Circle App Kit when the stake exceeds the balance */}
      {address && stakeUsd > usdcAvailable && !tradingClosed && (
        <button
          type="button"
          disabled={funding}
          onClick={handleFund}
          className="btn-outline w-full py-2 text-[12px] -mt-1"
        >
          {funding ? "Sending…" : "Get $1 test USDC · Circle App Kit"}
        </button>
      )}

      {visibleStatus && (
        <div
          className="text-[10.5px] text-muted-strong font-mono-thin truncate"
          title={visibleStatus}
        >
          {visibleStatus}
        </div>
      )}
    </div>
  );
}
