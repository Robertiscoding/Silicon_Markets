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
import { SpotChart } from "./spot-chart";

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

  const series = initialSeries[selected] ?? [];
  const spot = series.at(-1)?.price ?? 0;
  const prior = series.at(-2)?.price ?? spot;
  const changePct = prior ? ((spot - prior) / prior) * 100 : 0;
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
    <div style={{ display: "grid", gap: 24 }}>
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
          <div>
            <h1 style={{ margin: "0 0 4px" }}>{selected}</h1>
            <p style={{ margin: 0, display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
              <span>{formatHr(spot)}</span>
              <span style={{ fontSize: 13 }}>
                {changePct >= 0 ? "+" : ""}
                {changePct.toFixed(2)}% 24h
              </span>
              <span
                style={{
                  fontSize: 12,
                  border: "1px solid black",
                  padding: "2px 8px",
                }}
              >
                settles in {formatSettlesIn(now, settlementTs)}
              </span>
              {poolUsd !== null ? (
                <span style={{ fontSize: 12 }}>
                  pool {formatUsd(poolUsd)} · {Number(numForecasts ?? 0)} forecasts
                </span>
              ) : (
                <span style={{ fontSize: 12 }}>no on-chain market</span>
              )}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[1, 7, 30, 90].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setWindowDays(days)}
                style={{
                  border: "1px solid black",
                  background: windowDays === days ? "black" : "white",
                  color: windowDays === days ? "white" : "black",
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
              >
                {days}D
              </button>
            ))}
          </div>
        </div>
        <SpotChart history={visible} forecastCenter={forecastCenter} forecastBand={forecastBand} />
      </section>

      <ForecastPanel
        symbol={selected}
        spotPrice={spot}
        forecastCenter={forecastCenter}
        forecastBand={forecastBand}
        stakeUsd={stake}
        onStakeChange={setStake}
        onBandChange={(band) => setBandBySym((prev) => ({ ...prev, [selected]: band }))}
        onCenterChange={(center) => setCenterBySym((prev) => ({ ...prev, [selected]: center }))}
      />

      <section>
        <h2 style={{ marginTop: 0 }}>All markets</h2>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {GPU_SYMBOLS.map((symbol) => {
            const price = initialSeries[symbol]?.at(-1)?.price ?? 0;
            const active = symbol === selected;
            return (
              <li key={symbol}>
                <button
                  type="button"
                  onClick={() => setSelected(symbol)}
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    border: "none",
                    borderBottom: "1px solid black",
                    background: active ? "#eee" : "white",
                    color: "black",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span>{symbol}</span>
                  <span>{formatHr(price)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
