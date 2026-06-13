"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useReadContract, useWatchContractEvent } from "wagmi";
import type { PricePoint } from "@/lib/seed-history";
import { SILICON_MARKET_ABI, SILICON_MARKET_ADDRESS } from "@/lib/contracts";
import { GPU_SYMBOLS, rawToUsdc, type GpuSymbol } from "@/lib/markets";
import { DemoResultModal } from "./demo-result-modal";
import { DemoSettle, type DemoResult } from "./demo-settle";
import { ForecastChart } from "./forecast-chart";
import { ForecastPanel } from "./forecast-panel";
import { MarketFeedsPanel } from "./market-feeds-panel";

interface MarketsViewProps {
  initialSeries: Record<string, PricePoint[]>;
  settlementTs: number;
}

const DEFAULT_BAND_PCT = 0.04;
const DEFAULT_STAKE_USD = 50;

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

  const [demoResult, setDemoResult] = useState<DemoResult | null>(null);
  const [demoPopupOpen, setDemoPopupOpen] = useState(false);

  const series = initialSeries[selected] ?? [];
  const spotPrice = series.at(-1)?.price ?? 0;
  const prev = series.at(-2)?.price ?? spotPrice;
  const changeAbs = spotPrice - prev;
  const changePct = prev ? (changeAbs / prev) * 100 : 0;
  const forecastCenter = centerBySym[selected] ?? spotPrice;
  const forecastBand = bandBySym[selected] ?? 0.03;

  const { data: marketIdLookup } = useReadContract({
    address: SILICON_MARKET_ADDRESS,
    abi: SILICON_MARKET_ABI,
    functionName: "marketIdFor",
    args: [selected, BigInt(settlementTs)],
    query: { refetchInterval: 30_000 },
  });
  const marketId = marketIdLookup?.[1] ? marketIdLookup[0] : null;

  const { data: marketInfo, refetch: refetchMarketInfo } = useReadContract({
    address: SILICON_MARKET_ADDRESS,
    abi: SILICON_MARKET_ABI,
    functionName: "getMarket",
    args: marketId !== null ? [marketId] : undefined,
    query: { enabled: marketId !== null, refetchInterval: 30_000 },
  });

  const { data: numForecasts, refetch: refetchNumForecasts } = useReadContract({
    address: SILICON_MARKET_ADDRESS,
    abi: SILICON_MARKET_ABI,
    functionName: "forecastCount",
    args: marketId !== null ? [marketId] : undefined,
    query: { enabled: marketId !== null, refetchInterval: 30_000 },
  });

  useWatchContractEvent({
    address: SILICON_MARKET_ADDRESS,
    abi: SILICON_MARKET_ABI,
    eventName: "ForecastLocked",
    args: marketId !== null ? { marketId } : undefined,
    enabled: marketId !== null,
    onLogs: () => {
      refetchMarketInfo();
      refetchNumForecasts();
    },
  });

  const volumeUsd = marketInfo ? rawToUsdc(marketInfo.totalStake) : null;
  const forecastCount = numForecasts !== undefined ? Number(numForecasts) : null;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)_340px] gap-4 max-w-[1400px] mx-auto w-full">
        <aside className="min-h-[560px] order-2 lg:order-none">
          <MarketFeedsPanel series={initialSeries} selected={selected} onSelect={setSelected} />
        </aside>

        <section className="min-w-0 min-h-[560px] order-1 lg:order-none">
          <ForecastChart
            symbol={selected}
            history={series}
            forecastCenter={forecastCenter}
            forecastBand={forecastBand}
            settlementTs={settlementTs}
            nowTs={now || (series.at(-1)?.ts ?? settlementTs)}
            windowDays={windowDays}
            spotChangePct={Number.isFinite(changePct) ? changePct : 0}
            spotChangeAbs={Number.isFinite(changeAbs) ? changeAbs : 0}
            volumeUsd={volumeUsd}
            forecastCount={forecastCount}
            demoSettlePrice={demoResult?.settlePrice ?? null}
            onWindowChange={setWindowDays}
            onForecastChange={(center) =>
              setCenterBySym((prev) => ({ ...prev, [selected]: center }))
            }
          />
        </section>

        <aside className="min-h-[560px] order-3">
          <ForecastPanel
            symbol={selected}
            spotPrice={spotPrice}
            forecastCenter={forecastCenter}
            forecastBand={forecastBand}
            stakeUsd={stake}
            settlementTs={settlementTs}
            nowTs={now}
            marketId={marketId}
            onStakeChange={setStake}
            onBandChange={(band) => setBandBySym((prev) => ({ ...prev, [selected]: band }))}
          />
        </aside>
      </div>

      <DemoSettle
        symbol={selected}
        settlementTs={settlementTs}
        onResult={(r) => {
          setDemoResult(r);
          setDemoPopupOpen(true);
        }}
      />
      <DemoResultModal
        result={demoPopupOpen ? demoResult : null}
        onClose={() => setDemoPopupOpen(false)}
      />
    </>
  );
}
