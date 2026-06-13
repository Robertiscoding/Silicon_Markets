"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PricePoint } from "@/lib/seed-history";
import { formatHr } from "@/lib/markets";

interface SpotChartProps {
  history: PricePoint[];
  forecastCenter: number;
  forecastBand: number;
}

const PAD = { top: 16, right: 16, bottom: 28, left: 56 };
const FORECAST_FRACTION = 0.22;
const GRID = "rgba(255,255,255,0.08)";
const MUTED = "#82828c";
const ACCENT = "#3ce06b";
const ACCENT_DIM = "#1ea84a";

export function SpotChart({ history, forecastCenter, forecastBand }: SpotChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 280 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 50) {
        setSize({ w: Math.round(rect.width), h: Math.max(280, Math.round(rect.height)) });
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
    const bandLo = forecastCenter - forecastBand;
    const bandHi = forecastCenter + forecastBand;
    const minPrice = Math.min(...prices, bandLo);
    const maxPrice = Math.max(...prices, bandHi);
    const padY = (maxPrice - minPrice || minPrice * 0.05) * 0.12;
    const yMin = minPrice - padY;
    const yMax = maxPrice + padY;
    const xMin = history[0].ts;
    const xMax = history.at(-1)!.ts;
    const histW = innerW * (1 - FORECAST_FRACTION);
    const forecastX = PAD.left + histW;

    const xHist = (ts: number) => PAD.left + ((ts - xMin) / (xMax - xMin || 1)) * histW;
    const y = (price: number) => PAD.top + (1 - (price - yMin) / (yMax - yMin || 1)) * innerH;

    const line = history
      .map((p, i) => `${i === 0 ? "M" : "L"} ${xHist(p.ts).toFixed(1)} ${y(p.price).toFixed(1)}`)
      .join(" ");
    const last = history.at(-1)!;

    return {
      line,
      last,
      xHist,
      y,
      yMin,
      yMax,
      forecastX,
      bandLo,
      bandHi,
      chartRight: size.w - PAD.right,
    };
  }, [history, size, forecastCenter, forecastBand]);

  return (
    <div ref={wrapRef} className="w-full h-full min-h-[280px] relative">
      {!plot || history.length < 2 ? (
        <p className="p-4 text-muted text-[13px]">Not enough data</p>
      ) : (
        <svg width={size.w} height={size.h} role="img" aria-label="Spot price chart" className="block">
          {[0, 0.5, 1].map((t) => {
            const price = plot.yMin + (plot.yMax - plot.yMin) * (1 - t);
            const yPos = plot.y(price);
            return (
              <g key={t}>
                <line x1={PAD.left} x2={plot.chartRight} y1={yPos} y2={yPos} stroke={GRID} strokeWidth={1} />
                <text x={8} y={yPos + 4} fontSize={11} fill={MUTED}>
                  {formatHr(price)}
                </text>
              </g>
            );
          })}

          <rect
            x={plot.forecastX}
            y={plot.y(plot.bandHi)}
            width={plot.chartRight - plot.forecastX}
            height={Math.max(1, plot.y(plot.bandLo) - plot.y(plot.bandHi))}
            fill="rgba(60,224,107,0.12)"
            stroke="rgba(60,224,107,0.35)"
            strokeWidth={1}
          />
          <line
            x1={plot.forecastX}
            x2={plot.forecastX}
            y1={PAD.top}
            y2={size.h - PAD.bottom}
            stroke="rgba(255,255,255,0.2)"
            strokeDasharray="4 3"
          />
          <line
            x1={plot.forecastX}
            x2={plot.chartRight}
            y1={plot.y(forecastCenter)}
            y2={plot.y(forecastCenter)}
            stroke={ACCENT}
            strokeWidth={1.5}
          />

          <path d={plot.line} fill="none" stroke={ACCENT_DIM} strokeWidth={2} />
          <circle cx={plot.xHist(plot.last.ts)} cy={plot.y(plot.last.price)} r={4} fill={ACCENT} />
          <text x={plot.forecastX + 8} y={PAD.top + 14} fontSize={11} fill={MUTED}>
            forecast
          </text>
        </svg>
      )}
    </div>
  );
}
