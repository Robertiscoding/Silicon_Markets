"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useReadContract } from "wagmi";
import type { PricePoint } from "@/lib/seed-history";
import { SILICON_MARKET_ABI, SILICON_MARKET_ADDRESS } from "@/lib/contracts";
import {
  formatHr,
  formatSettlesIn,
  formatUsd,
  GPU_SYMBOLS,
  rawToUsdc,
  type GpuSymbol,
} from "@/lib/markets";
import { ForecastPanel } from "./forecast-panel";
import { MarketFeedsPanel } from "./market-feeds-panel";
import { SpotChart } from "./spot-chart";

interface MarketsViewProps {
  initialSeries: Record<string, PricePoint[]>;
  settlementTs: number;
}

const DEFAULT_BAND_PCT = 0.04;
const DEFAULT_STAKE_USD = 50;
const WINDOW_OPTIONS = [1, 7, 30, 90] as const;

function subscribe(cb: () => void) {
  const timer = setInterval(cb, 1000);
  return () => clearInterval(timer);
}

function getSnapshot() {
  return Math.floor(Date.now() / 1000);
}

function getServerSnapshot() {
  return 0;
}

function initialForecastState(series: Record<string, PricePoint[]>) {
  const centers: Record<string, number> = {};
  const bands: Record<string, number> = {};
  for (const symbol of GPU_SYMBOLS) {
    const list = series[symbol] ?? [];
    const spot = list.at(-1)?.price ?? 1;
    centers[symbol] = spot;
    bands[symbol] = Math.max(0.01, +(spot * DEFAULT_BAND_PCT).toFixed(3));
  }
  return { centers, bands };
}

export function MarketsView({ initialSeries, settlementTs }: MarketsViewProps) {
  const [selected, setSelected] = useState<GpuSymbol>("RTX 5090");
  const [windowDays, setWindowDays] = useState(30);
  const [stake, setStake] = useState(DEFAULT_STAKE_USD);
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const initialForecast = useMemo(() => initialForecastState(initialSeries), [initialSeries]);
  const [centerBySym, setCenterBySym] = useState(initialForecast.centers);
  const [bandBySym, setBandBySym] = useState(initialForecast.bands);

  const series = initialSeries[selected] ?? [];
  const spot = series.at(-1)?.price ?? 0;
  const prior = series.at(-2)?.price ?? spot;
  const changePct = prior ? ((spot - prior) / prior) * 100 : 0;
  const positive = changePct >= 0;
  const forecastCenter = centerBySym[selected] ?? spot;
  const forecastBand = bandBySym[selected] ?? 0.03;

  const visible = useMemo(() => {
    if (windowDays >= 365) return series;
    const cutoff = (series.at(-1)?.ts ?? 0) - windowDays * 86_400;
    return series.filter((p) => p.ts >= cutoff);
  }, [series, windowDays]);

  const { data: marketIdLookup } = useReadContract({
    address: SILICON_MARKET_ADDRESS,
    abi: SILICON_MARKET_ABI,
    functionName: "marketIdFor",
    args: [selected, BigInt(settlementTs)],
    query: { refetchInterval: 30_000 },
  });
  const marketId = marketIdLookup?.[1] ? marketIdLookup[0] : null;

  const { data: marketInfo } = useReadContract({
    address: SILICON_MARKET_ADDRESS,
    abi: SILICON_MARKET_ABI,
    functionName: "getMarket",
    args: marketId !== null ? [marketId] : undefined,
    query: { enabled: marketId !== null, refetchInterval: 30_000 },
  });

  const { data: numForecasts } = useReadContract({
    address: SILICON_MARKET_ADDRESS,
    abi: SILICON_MARKET_ABI,
    functionName: "forecastCount",
    args: marketId !== null ? [marketId] : undefined,
    query: { enabled: marketId !== null, refetchInterval: 30_000 },
  });

  const poolUsd = marketInfo ? rawToUsdc(marketInfo.totalStake) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_340px] gap-4 max-w-[1400px] mx-auto w-full">
      <aside className="min-h-[560px] order-2 lg:order-none">
        <MarketFeedsPanel series={initialSeries} selected={selected} onSelect={setSelected} />
      </aside>

      <section className="min-w-0 min-h-[560px] order-1 lg:order-none panel flex flex-col overflow-hidden">
        <div className="px-4 lg:px-5 py-4 flex flex-wrap items-start justify-between gap-4 border-b border-[var(--border)]">
          <div className="min-w-0">
            <h2 className="font-display text-[18px] text-foreground leading-tight">{selected} Index</h2>
            <div className="flex items-center gap-1.5 mt-1 text-[10.5px] text-muted">
              <span className="pulse-dot shrink-0" style={{ width: 5, height: 5 }} />
              <span>Ornn 4PM ET print</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="text-[28px] font-semibold text-foreground tabular-nums leading-none">
              ${spot.toFixed(spot < 10 ? 4 : 2)}
              <span className="text-muted text-[13px] font-normal ml-1">/hr</span>
            </div>
            <span
              className="inline-flex items-center gap-1 px-2 py-[5px] rounded-full text-[11px] font-mono-thin tabular-nums leading-none"
              style={{
                color: positive ? "var(--accent)" : "var(--danger)",
                background: positive ? "rgba(60,224,107,0.1)" : "rgba(255,90,107,0.1)",
                border: `1px solid ${positive ? "rgba(60,224,107,0.28)" : "rgba(255,90,107,0.28)"}`,
              }}
            >
              {positive ? "▲" : "▼"} {Math.abs(changePct).toFixed(2)}%
            </span>
          </div>

          <div className="chip px-4 py-2.5 shrink-0 min-w-[160px]">
            <div className="text-[9.5px] text-muted tracking-[0.14em] font-mono-thin">SETTLES IN</div>
            <div className="text-[20px] text-foreground font-mono-thin tabular-nums mt-1 leading-none">
              {formatSettlesIn(now, settlementTs)}
            </div>
            {poolUsd !== null ? (
              <div className="text-[10.5px] text-muted mt-1.5">
                pool {formatUsd(poolUsd)} · {Number(numForecasts ?? 0)} forecasts
              </div>
            ) : (
              <div className="text-[10.5px] text-muted mt-1.5">no on-chain market</div>
            )}
          </div>
        </div>

        <div className="px-4 lg:px-5 py-2.5 flex items-center gap-1 border-b border-[var(--border)]">
          {WINDOW_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setWindowDays(days)}
              className={`px-3 py-1 rounded-full text-[11.5px] transition-colors ${
                windowDays === days
                  ? "text-accent bg-[var(--accent-soft)] border border-[rgba(60,224,107,0.35)]"
                  : "text-muted-strong hover:text-accent border border-transparent"
              }`}
            >
              {days}D
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-[280px]">
          <SpotChart history={visible} forecastCenter={forecastCenter} forecastBand={forecastBand} />
        </div>
      </section>

      <aside className="min-h-[560px] order-3">
        <ForecastPanel
          symbol={selected}
          spotPrice={spot}
          forecastCenter={forecastCenter}
          forecastBand={forecastBand}
          stakeUsd={stake}
          settlementTs={settlementTs}
          nowTs={now}
          marketId={marketId}
          onStakeChange={setStake}
          onBandChange={(band) => setBandBySym((prev) => ({ ...prev, [selected]: band }))}
          onCenterChange={(center) => setCenterBySym((prev) => ({ ...prev, [selected]: center }))}
        />
      </aside>
    </div>
  );
}
