"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatHr, GPU_SYMBOLS, SHORT_SYMBOL, type GpuSymbol } from "@/lib/markets";

type Pt = { ts: number; price: number };

interface MarketFeedsPanelProps {
  series: Record<string, Pt[]>;
  selected: GpuSymbol;
  onSelect: (symbol: GpuSymbol) => void;
}

const SUBLABEL: Record<GpuSymbol, string> = {
  "RTX 5090": "Ornn index · /hr",
  "H100 SXM": "SXM5 rental · /hr",
  H200: "SXM rental · /hr",
  B200: "Blackwell · /hr",
  "A100 SXM4": "SXM4 rental · /hr",
  "RTX PRO 6000 WS": "Workstation · /hr",
};

function MiniSpark({ values }: { values: number[] }) {
  const w = 64;
  const h = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => 2 + (1 - (v - min) / range) * (h - 4);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={d} stroke="black" strokeWidth="1.4" fill="none" />
    </svg>
  );
}

export function MarketFeedsPanel({ series, selected, onSelect }: MarketFeedsPanelProps) {
  const rows = useMemo(() => {
    return GPU_SYMBOLS.flatMap((sym) => {
      const prints = series[sym] ?? [];
      if (prints.length < 2) return [];
      const last = prints.at(-1)!;
      const prev = prints.at(-2)!;
      const changePct = prev.price ? ((last.price - prev.price) / prev.price) * 100 : 0;
      return [
        {
          symbol: sym,
          name: SHORT_SYMBOL[sym],
          sublabel: SUBLABEL[sym],
          value: last.price,
          changePct,
          points: prints.slice(-24).map((p) => p.price),
        },
      ];
    });
  }, [series]);

  return (
    <section style={{ border: "1px solid black", padding: 16 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Market feeds</h2>
      <div style={{ display: "grid", gap: 4 }}>
        {rows.map((row) => {
          const active = row.symbol === selected;
          return (
            <button
              key={row.symbol}
              type="button"
              onClick={() => onSelect(row.symbol)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                padding: "8px 4px",
                border: "none",
                borderBottom: "1px solid #ccc",
                background: active ? "#eee" : "white",
                cursor: "pointer",
                textAlign: "left",
                color: "black",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13 }}>{row.name}</div>
                <div style={{ fontSize: 11, color: "#444" }}>{row.sublabel}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12 }}>{formatHr(row.value)}</div>
                <MiniSpark values={row.points} />
                <div style={{ fontSize: 11 }}>
                  {row.changePct >= 0 ? "+" : ""}
                  {row.changePct.toFixed(2)}%
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <Link href="/forecasts" style={{ display: "block", marginTop: 12, fontSize: 13, color: "black" }}>
        View consensus forecasts →
      </Link>
    </section>
  );
}
