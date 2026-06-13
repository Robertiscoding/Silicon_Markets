"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PricePoint } from "@/lib/seed-history";
import { formatHr } from "@/lib/markets";

interface SpotChartProps {
  history: PricePoint[];
}

const PAD = { top: 16, right: 16, bottom: 28, left: 56 };

export function SpotChart({ history }: SpotChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 280 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 50) {
        setSize({ w: Math.round(rect.width), h: 280 });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const plot = useMemo(() => {
    const innerW = size.w - PAD.left - PAD.right;
    const innerH = size.h - PAD.top - PAD.bottom;
    if (history.length < 2 || innerW <= 0 || innerH <= 0) {
      return null;
    }

    const prices = history.map((p) => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const padY = (maxPrice - minPrice || minPrice * 0.05) * 0.12;
    const yMin = minPrice - padY;
    const yMax = maxPrice + padY;
    const xMin = history[0].ts;
    const xMax = history.at(-1)!.ts;

    const x = (ts: number) => PAD.left + ((ts - xMin) / (xMax - xMin || 1)) * innerW;
    const y = (price: number) => PAD.top + (1 - (price - yMin) / (yMax - yMin || 1)) * innerH;

    const line = history.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.ts).toFixed(1)} ${y(p.price).toFixed(1)}`).join(" ");
    const last = history.at(-1)!;

    return { line, last, x, y, yMin, yMax, innerH };
  }, [history, size]);

  return (
    <div
      ref={wrapRef}
      style={{
        marginTop: 16,
        border: "1px solid black",
        background: "white",
        minHeight: 280,
      }}
    >
      {!plot || history.length < 2 ? (
        <p style={{ padding: 16, margin: 0 }}>not enough data</p>
      ) : (
        <svg width={size.w} height={size.h} role="img" aria-label="Spot price chart">
          {[0, 0.5, 1].map((t) => {
            const price = plot.yMin + (plot.yMax - plot.yMin) * (1 - t);
            const y = plot.y(price);
            return (
              <g key={t}>
                <line x1={PAD.left} x2={size.w - PAD.right} y1={y} y2={y} stroke="#ccc" strokeWidth={1} />
                <text x={8} y={y + 4} fontSize={11} fill="black">
                  {formatHr(price)}
                </text>
              </g>
            );
          })}
          <path d={plot.line} fill="none" stroke="black" strokeWidth={2} />
          <circle cx={plot.x(plot.last.ts)} cy={plot.y(plot.last.price)} r={4} fill="black" />
        </svg>
      )}
    </div>
  );
}
