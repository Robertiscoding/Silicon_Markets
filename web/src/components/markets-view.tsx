"use client";

import { useMemo, useState } from "react";
import type { PricePoint } from "@/lib/seed-history";
import { formatHr, GPU_SYMBOLS, type GpuSymbol } from "@/lib/markets";
import { SpotChart } from "./spot-chart";

interface MarketsViewProps {
  initialSeries: Record<string, PricePoint[]>;
}

export function MarketsView({ initialSeries }: MarketsViewProps) {
  const [selected, setSelected] = useState<GpuSymbol>("RTX 5090");
  const [windowDays, setWindowDays] = useState(30);

  const series = initialSeries[selected] ?? [];
  const spot = series.at(-1)?.price ?? 0;

  const visible = useMemo(() => {
    if (windowDays >= 365) return series;
    const cutoff = (series.at(-1)?.ts ?? 0) - windowDays * 86_400;
    return series.filter((p) => p.ts >= cutoff);
  }, [series, windowDays]);

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <h1 style={{ margin: "0 0 4px" }}>{selected}</h1>
            <p style={{ margin: 0 }}>{formatHr(spot)}</p>
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
        <SpotChart history={visible} />
      </section>

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
