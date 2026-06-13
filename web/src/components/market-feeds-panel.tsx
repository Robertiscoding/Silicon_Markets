"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight } from "./icons";
import { Logo } from "./logo";
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

function MiniSpark({ values, positive }: { values: number[]; positive: boolean }) {
  const w = 64;
  const h = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => 2 + (1 - (v - min) / range) * (h - 4);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const stroke = positive ? "#3ce06b" : "#ff5a6b";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <path d={d} stroke={stroke} strokeWidth="1.4" fill="none" strokeLinejoin="round" strokeLinecap="round" />
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
    <div className="panel p-4 flex flex-col">
      <div className="text-[13px] font-medium text-foreground mb-3">Market Feeds</div>
      <div className="flex flex-col gap-1.5 -mx-1">
        {rows.map((row) => {
          const positive = row.changePct >= 0;
          const active = row.symbol === selected;
          return (
            <button
              key={row.symbol}
              type="button"
              onClick={() => onSelect(row.symbol)}
              className={`flex items-center gap-2.5 px-1 py-2 rounded-md transition-colors w-full text-left ${
                active ? "bg-[var(--accent-soft)]/60" : "hover:bg-[var(--accent-soft)]/40"
              }`}
            >
              <Logo size={18} glow={false} />
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-foreground leading-tight truncate">{row.name}</div>
                <div className="text-[9.5px] text-muted truncate">{row.sublabel}</div>
              </div>
              <div className="flex flex-col items-end shrink-0 gap-0.5">
                <div className="text-[11px] font-mono-thin text-foreground tabular-nums">
                  {formatHr(row.value)}
                </div>
                <MiniSpark values={row.points} positive={positive} />
                <div
                  className={`text-[10px] font-mono-thin tabular-nums ${positive ? "text-accent" : "text-[var(--danger)]"}`}
                >
                  {positive ? "+" : ""}
                  {row.changePct.toFixed(2)}%
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <Link
        href="/forecasts"
        className="mt-3 w-full panel-flat flex items-center justify-between px-3 py-2.5 text-[11.5px] text-muted-strong hover:text-accent hover:border-[var(--border-strong)] transition-colors"
      >
        <span>View consensus forecasts</span>
        <ChevronRight size={14} />
      </Link>
    </div>
  );
}
