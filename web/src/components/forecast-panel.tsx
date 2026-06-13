"use client";

import { useAccount } from "wagmi";
import {
  expectedPayout,
  formatHr,
  formatUsd,
  gaussianBandProbability,
  impliedOddsLabel,
  type GpuSymbol,
} from "@/lib/markets";

interface ForecastPanelProps {
  symbol: GpuSymbol;
  spotPrice: number;
  forecastCenter: number;
  forecastBand: number;
  stakeUsd: number;
  onStakeChange: (value: number) => void;
  onBandChange: (value: number) => void;
  onCenterChange: (value: number) => void;
}

const STAKE_PRESETS = [10, 50, 100];

export function ForecastPanel({
  symbol,
  spotPrice,
  forecastCenter,
  forecastBand,
  stakeUsd,
  onStakeChange,
  onBandChange,
  onCenterChange,
}: ForecastPanelProps) {
  const { isConnected } = useAccount();
  const probability = gaussianBandProbability(spotPrice, forecastCenter, forecastBand);
  const oddsBps = Math.max(1, Math.round(probability * 10_000));
  const payout = expectedPayout(stakeUsd, oddsBps);

  return (
    <section style={{ border: "1px solid black", padding: 16 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Forecast · {symbol}</h2>

      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Center ({formatHr(forecastCenter)})</span>
          <input
            type="range"
            min={Math.max(0.01, spotPrice * 0.5)}
            max={spotPrice * 1.5}
            step={0.01}
            value={forecastCenter}
            onChange={(e) => onCenterChange(Number(e.target.value))}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Band ±{formatHr(forecastBand)}</span>
          <input
            type="range"
            min={0.01}
            max={Math.max(0.05, spotPrice * 0.15)}
            step={0.005}
            value={forecastBand}
            onChange={(e) => onBandChange(Number(e.target.value))}
          />
        </label>

        <div>
          <p style={{ margin: "0 0 8px" }}>Stake</p>
          <div style={{ display: "flex", gap: 8 }}>
            {STAKE_PRESETS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => onStakeChange(amount)}
                style={{
                  border: "1px solid black",
                  background: stakeUsd === amount ? "black" : "white",
                  color: stakeUsd === amount ? "white" : "black",
                  padding: "6px 12px",
                  cursor: "pointer",
                }}
              >
                ${amount}
              </button>
            ))}
          </div>
        </div>

        <div style={{ borderTop: "1px solid black", paddingTop: 12, display: "grid", gap: 4 }}>
          <span>Implied odds: {impliedOddsLabel(oddsBps)}</span>
          <span>Est. payout: {formatUsd(payout)}</span>
          <span>
            Range: {formatHr(forecastCenter - forecastBand)} – {formatHr(forecastCenter + forecastBand)}
          </span>
        </div>

        <button
          type="button"
          disabled={!isConnected}
          style={{
            border: "1px solid black",
            background: isConnected ? "white" : "#eee",
            color: isConnected ? "black" : "#666",
            padding: "10px 12px",
            cursor: isConnected ? "pointer" : "not-allowed",
          }}
        >
          {isConnected ? "Lock forecast" : "Connect wallet to lock"}
        </button>
      </div>
    </section>
  );
}
