"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Logo } from "./logo";
import { GlassToggle } from "./glass";
import { type GpuSymbol } from "@/lib/markets";

export interface PricePoint {
  ts: number; // unix seconds
  price: number;
}

interface ForecastChartProps {
  symbol: GpuSymbol;
  history: PricePoint[];
  forecastCenter: number;
  forecastBand: number;
  marketMedian?: number;
  settlementTs: number;
  nowTs: number;
  windowDays?: number;
  spotChangePct?: number;
  spotChangeAbs?: number;
  /** Total USDC staked in the on-chain market; null while loading / no market. */
  volumeUsd?: number | null;
  /** Number of forecasts locked on-chain; null while loading / no market. */
  forecastCount?: number | null;
  /** Demo settlement print — draws the "price went here" line on the chart. */
  demoSettlePrice?: number | null;
  onForecastChange?: (center: number, band: number) => void;
  onWindowChange?: (days: number) => void;
}

const PAD = { top: 20, right: 76, bottom: 30, left: 52 };
/** Fraction of horizontal chart space allocated to the forecast wedge. */
const FORECAST_FRACTION = 0.22;

const PRIMARY = "#3ce06b";
const PRIMARY_DIM = "#1ea84a";
const TEXT = "#e7f5ec";
const TEXT_MUTED = "#6c8a78";
const GRID = "rgba(80, 200, 120, 0.07)";
const GRID_STRONG = "rgba(80, 200, 120, 0.22)";

const WINDOW_OPTIONS = [
  { d: 1, label: "1D" },
  { d: 7, label: "7D" },
  { d: 30, label: "30D" },
  { d: 90, label: "90D" },
  { d: 9999, label: "ALL" },
] as const;

export function ForecastChart({
  symbol,
  history,
  forecastCenter,
  forecastBand,
  settlementTs,
  nowTs,
  windowDays = 30,
  spotChangePct = 0,
  spotChangeAbs = 0,
  volumeUsd = null,
  forecastCount = null,
  demoSettlePrice = null,
  onForecastChange,
  onWindowChange,
}: ForecastChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [handleHover, setHandleHover] = useState(false);
  const [zoneHover, setZoneHover] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; ts: number; price: number } | null>(
    null,
  );

  // While dragging, force the grabbing cursor globally so it never flickers
  // back to default when the pointer outruns the handle.
  useEffect(() => {
    if (!dragging) return;
    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  // ---------- pixel-perfect sizing ----------
  // Render the SVG at the container's real pixel size (no stretching), so
  // strokes, text and dots stay crisp at every viewport.
  const [dims, setDims] = useState({ w: 1080, h: 380 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 50 && r.height > 50) {
        setDims({ w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ---------- visible window ----------
  const visibleHistory = useMemo(() => {
    if (windowDays >= 365) return history;
    const cutoff = (history.at(-1)?.ts ?? nowTs) - windowDays * 86_400;
    return history.filter((p) => p.ts >= cutoff);
  }, [history, windowDays, nowTs]);

  const last = visibleHistory.at(-1) ?? history.at(-1);
  const spotPrice = last?.price ?? forecastCenter;
  const xMinHist = visibleHistory[0]?.ts ?? nowTs - windowDays * 86_400;
  const xMaxHist = last?.ts ?? nowTs;

  // ---------- y domain ----------
  const ySeries = useMemo(() => {
    const out: number[] = visibleHistory.map((p) => p.price);
    out.push(forecastCenter - forecastBand, forecastCenter + forecastBand);
    if (demoSettlePrice !== null) out.push(demoSettlePrice);
    return out;
  }, [visibleHistory, forecastCenter, forecastBand, demoSettlePrice]);

  const minP = ySeries.length ? Math.min(...ySeries) : 0;
  const maxP = ySeries.length ? Math.max(...ySeries) : 1;
  const pad = Math.max((maxP - minP) * 0.12, 0.02);
  const minPad = minP - pad;
  const maxPad = maxP + pad;

  const chartWidth = Math.max(50, dims.w - PAD.left - PAD.right);
  const chartHeight = Math.max(50, dims.h - PAD.top - PAD.bottom);

  const xNow = PAD.left + chartWidth * (1 - FORECAST_FRACTION);
  const xSettle = PAD.left + chartWidth - 6;
  const xHist = useCallback(
    (ts: number) => PAD.left + ((ts - xMinHist) / (xMaxHist - xMinHist || 1)) * (xNow - PAD.left),
    [xMinHist, xMaxHist, xNow],
  );
  const y = useCallback(
    (v: number) => PAD.top + (1 - (v - minPad) / (maxPad - minPad)) * chartHeight,
    [minPad, maxPad, chartHeight],
  );
  const yToPrice = useCallback(
    (yPx: number) => maxPad - ((yPx - PAD.top) / chartHeight) * (maxPad - minPad),
    [minPad, maxPad, chartHeight],
  );

  // ---------- paths ----------
  // Catmull-Rom → cubic Bézier smoothing so the daily prints render as a
  // continuous curve instead of jagged segments.
  const pts = useMemo(
    () => visibleHistory.map((p) => ({ x: xHist(p.ts), y: y(p.price) })),
    [visibleHistory, xHist, y],
  );

  const linePath = useMemo(() => smoothPath(pts), [pts]);

  const areaPath = useMemo(() => {
    if (pts.length < 2) return "";
    const baseline = dims.h - PAD.bottom;
    return `${smoothPath(pts)} L${pts[pts.length - 1].x.toFixed(2)},${baseline} L${pts[0].x.toFixed(2)},${baseline} Z`;
  }, [pts, dims.h]);

  const forecastDashPath = useMemo(() => {
    if (!last) return "";
    return `M${xNow.toFixed(2)},${y(last.price).toFixed(2)} L${xSettle.toFixed(2)},${y(forecastCenter).toFixed(2)}`;
  }, [last, forecastCenter, xNow, xSettle, y]);

  const wedgePolygon = useMemo(() => {
    if (!last) return "";
    return `${xNow},${y(last.price)} ${xSettle},${y(forecastCenter + forecastBand)} ${xSettle},${y(forecastCenter - forecastBand)}`;
  }, [last, forecastCenter, forecastBand, xNow, xSettle, y]);

  // ---------- ticks ----------
  const yTicks = useMemo(() => {
    const range = maxPad - minPad;
    const step = niceStep(range / 6);
    const start = Math.ceil(minPad / step) * step;
    const out: { y: number; label: string }[] = [];
    for (let v = start; v <= maxPad; v += step) {
      out.push({ y: y(v), label: `$${v.toFixed(step < 0.1 ? 3 : 2)}` });
    }
    return out;
  }, [minPad, maxPad, y]);

  const histTicks = useMemo(() => {
    if (!last) return [];
    const span = xMaxHist - xMinHist;
    let stepDays = 7;
    if (span <= 2 * 86_400) stepDays = 0.25;
    else if (span <= 14 * 86_400) stepDays = 2;
    else if (span <= 30 * 86_400) stepDays = 5;
    else if (span <= 90 * 86_400) stepDays = 14;
    else stepDays = 28;
    const stepSec = stepDays * 86_400;
    const out: { x: number; label: string }[] = [];
    let t = Math.ceil(xMinHist / stepSec) * stepSec;
    for (let i = 0; i < 60 && t < xMaxHist - stepSec / 2; i++, t += stepSec) {
      out.push({
        x: xHist(t),
        label: new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      });
    }
    return out;
  }, [xMinHist, xMaxHist, last, xHist]);

  // ---------- pointer: drag forecast ----------
  // Snap to a "nice" increment sized off the visible range so the handle has
  // a subtle detent feel instead of jittering across raw float values.
  const snapStep = useMemo(() => niceStep((maxPad - minPad) / 160), [minPad, maxPad]);
  const priceDecimals = snapStep >= 0.01 ? 2 : 3;

  const updateFromPointer = useCallback(
    (e: PointerEvent | React.PointerEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const yPx = e.clientY - rect.top;
      const range = maxPad - minPad;
      const raw = Math.max(minPad + range * 0.01, Math.min(maxPad - range * 0.01, yToPrice(yPx)));
      const snapped = Math.round(raw / snapStep) * snapStep;
      onForecastChange?.(Number(snapped.toFixed(6)), forecastBand);
    },
    [yToPrice, minPad, maxPad, snapStep, onForecastChange, forecastBand],
  );

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onForecastChange || !svgRef.current) return;
    // Only the forecast zone is draggable; the history side keeps its
    // crosshair behavior so a stray click doesn't yank the forecast around.
    const rect = svgRef.current.getBoundingClientRect();
    if (e.clientX - rect.left < xNow - 12) return;
    e.preventDefault();
    setDragging(true);
    setHover(null);
    updateFromPointer(e);
    const move = (ev: PointerEvent) => updateFromPointer(ev);
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // ---------- pointer: hover crosshair ----------
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragging || !svgRef.current || visibleHistory.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    if (xPx > xNow + 4) {
      setHover(null);
      setZoneHover(true);
      return;
    }
    setZoneHover(false);
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - xPx);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    const p = visibleHistory[best];
    if (p) setHover({ x: pts[best].x, y: pts[best].y, ts: p.ts, price: p.price });
  };

  // ---------- countdown ----------
  const timeUntil = settlementTs - (nowTs || 0);
  const countdownParts = useMemo(() => {
    const t = Math.max(0, timeUntil);
    return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: Math.floor(t % 60) };
  }, [timeUntil]);
  // Progress through the 24h settlement cycle, for the chip's progress bar.
  const cycleProgress = Math.min(100, Math.max(0, ((86_400 - Math.max(0, timeUntil)) / 86_400) * 100));
  const settleDay = useMemo(() => relativeDay(settlementTs, nowTs), [settlementTs, nowTs]);
  const settleLabel = useMemo(() => {
    const d = new Date(settlementTs * 1000);
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
    const day = settleDay.charAt(0).toUpperCase() + settleDay.slice(1);
    return `${day} · ${time}`;
  }, [settlementTs, settleDay]);

  const priceChangePositive = spotChangePct >= 0;

  // Forecast pill floats clear of the wedge: above the upper band bracket by
  // default, flipping below the lower bracket when it would clip the top.
  const PILL_H = 50;
  const pillAbove = y(forecastCenter + forecastBand) - PILL_H - 12;
  const pillTop = pillAbove >= 6 ? pillAbove : y(forecastCenter - forecastBand) + 12;
  const pillRight = dims.w - xSettle - 18;
  const forecastDeltaPct = spotPrice ? ((forecastCenter - spotPrice) / spotPrice) * 100 : 0;

  return (
    <div className="flex flex-col h-full panel-paper">
      {/* HEADER STRIP — identity, spot price, settlement countdown. Kept deliberately sparse. */}
      <div className="flex items-center gap-4 lg:gap-5 p-3.5 lg:p-4 border-b border-[var(--border)]">
        {/* Identity */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center"
            style={{
              background: "linear-gradient(145deg, rgba(60,224,107,0.16), rgba(60,224,107,0.03) 70%)",
              border: "1px solid rgba(60,224,107,0.28)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), 0 0 18px rgba(60,224,107,0.1)",
            }}
          >
            <Logo size={22} glow={false} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold text-foreground leading-tight truncate">
              {symbol} Index
            </h2>
            <div
              className="flex items-center gap-1.5 mt-1 text-[10.5px] text-muted cursor-help w-fit"
              title="Settles against the Ornn Compute Price Index daily 4 PM ET print, pushed on-chain by the oracle."
            >
              <span className="pulse-dot shrink-0" style={{ width: 5, height: 5 }} />
              <span className="truncate">Ornn 4PM ET print</span>
            </div>
          </div>
        </div>

        {/* Spot price + change */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="text-[28px] font-semibold text-foreground tabular-nums leading-none">
            ${spotPrice.toFixed(4)}
            <span className="text-muted text-[13px] font-normal ml-1">/hr</span>
          </div>
          <span
            className="inline-flex items-center gap-1 px-2 py-[5px] rounded-full text-[11px] font-mono-thin tabular-nums leading-none"
            style={{
              color: priceChangePositive ? "var(--accent)" : "var(--danger)",
              background: priceChangePositive ? "rgba(60,224,107,0.1)" : "rgba(255,90,107,0.1)",
              border: `1px solid ${priceChangePositive ? "rgba(60,224,107,0.28)" : "rgba(255,90,107,0.28)"}`,
            }}
            title="Change vs previous print"
          >
            {priceChangePositive ? "▲" : "▼"} {Math.abs(spotChangePct).toFixed(2)}%
          </span>
        </div>

        {/* Settles-in chip */}
        <div className="glass-panel relative px-4 py-3 shrink-0 min-w-[190px]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-[9.5px] text-muted tracking-[0.14em] font-mono-thin">
              <ClockIcon size={11} />
              <span>SETTLES IN</span>
            </div>
            <span className="pulse-dot" style={{ width: 6, height: 6 }} />
          </div>
          <div className="flex items-baseline mt-2 font-mono-thin tabular-nums leading-none">
            <span className="text-[22px] text-foreground">{countdownParts.h}</span>
            <span className="text-[10.5px] text-muted ml-0.5 mr-1.5">h</span>
            <span className="text-[22px] text-foreground">{String(countdownParts.m).padStart(2, "0")}</span>
            <span className="text-[10.5px] text-muted ml-0.5 mr-1.5">m</span>
            <span className="text-[22px] text-foreground">{String(countdownParts.s).padStart(2, "0")}</span>
            <span className="text-[10.5px] text-muted ml-0.5">s</span>
          </div>
          <div className="mt-2.5 h-[3px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${cycleProgress}%`,
                background: "linear-gradient(90deg, var(--accent-dim), var(--accent))",
                boxShadow: "0 0 8px rgba(60,224,107,0.45)",
                transition: "width 1s linear",
              }}
            />
          </div>
          <div className="mt-1.5 text-[10.5px] text-muted">{settleLabel}</div>
        </div>
      </div>

      {/* WINDOW TABS — glass lens glides over the active window */}
      <div className="px-4 lg:px-5 py-2.5 flex items-center border-b border-[var(--border)]">
        <GlassToggle
          options={WINDOW_OPTIONS.map(({ d, label }) => ({ value: d, label }))}
          value={windowDays}
          onChange={(d) => onWindowChange?.(d)}
        />
      </div>

      {/* CHART AREA — svg is absolutely positioned so its pixel size can never
          feed back into the flex layout (which caused runaway growth). */}
      <div ref={wrapRef} className="flex-1 min-h-0 relative select-none overflow-hidden">
        <svg
          ref={svgRef}
          width={dims.w}
          height={dims.h}
          viewBox={`0 0 ${dims.w} ${dims.h}`}
          className={`absolute inset-0 ${dragging ? "cursor-grabbing" : zoneHover ? "cursor-ns-resize" : "cursor-crosshair"}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerLeave={() => {
            setHover(null);
            setZoneHover(false);
          }}
          style={{ touchAction: "none" }}
        >
          <defs>
            <linearGradient id="wedgeGrad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={PRIMARY} stopOpacity="0.04" />
              <stop offset="100%" stopColor={PRIMARY} stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id="lineGrad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor={PRIMARY_DIM} />
              <stop offset="100%" stopColor={PRIMARY} />
            </linearGradient>
            <linearGradient id="areaGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={PRIMARY} stopOpacity="0.16" />
              <stop offset="55%" stopColor={PRIMARY} stopOpacity="0.05" />
              <stop offset="100%" stopColor={PRIMARY} stopOpacity="0" />
            </linearGradient>
            <filter id="lineGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* horizontal gridlines */}
          {yTicks.map((t, i) => (
            <line key={`yg-${i}`} x1={PAD.left} x2={dims.w - PAD.right} y1={t.y} y2={t.y} stroke={GRID} />
          ))}

          {/* y-axis labels */}
          {yTicks.map((t, i) => (
            <text key={`yl-${i}`} x={PAD.left - 8} y={t.y + 3} fontSize="10" fill={TEXT_MUTED} textAnchor="end" className="font-mono-thin">
              {t.label}
            </text>
          ))}

          {/* area fill under price line */}
          {areaPath && <path d={areaPath} fill="url(#areaGrad)" />}

          {/* confidence wedge */}
          {last && (
            <g style={{ transition: "opacity 160ms ease" }} opacity={dragging ? 1 : 0.88}>
              <polygon
                points={wedgePolygon}
                fill="url(#wedgeGrad)"
                stroke={PRIMARY}
                strokeOpacity="0.3"
                strokeWidth="1"
              />
              {/* right-edge bracket marking the settlement band */}
              <line
                x1={xSettle}
                x2={xSettle}
                y1={y(forecastCenter + forecastBand)}
                y2={y(forecastCenter - forecastBand)}
                stroke={PRIMARY}
                strokeOpacity={dragging || handleHover ? 0.8 : 0.45}
                strokeWidth="1.5"
                style={{ transition: "stroke-opacity 160ms ease" }}
              />
              <line x1={xSettle - 4} x2={xSettle + 4} y1={y(forecastCenter + forecastBand)} y2={y(forecastCenter + forecastBand)} stroke={PRIMARY} strokeOpacity="0.55" strokeWidth="1.5" />
              <line x1={xSettle - 4} x2={xSettle + 4} y1={y(forecastCenter - forecastBand)} y2={y(forecastCenter - forecastBand)} stroke={PRIMARY} strokeOpacity="0.55" strokeWidth="1.5" />
            </g>
          )}

          {/* historical price curve */}
          <path d={linePath} stroke="url(#lineGrad)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#lineGlow)" />

          {/* forecast connector */}
          {last && (
            <path d={forecastDashPath} stroke={PRIMARY} strokeWidth="1.3" strokeDasharray="3 4" fill="none" opacity="0.9" />
          )}

          {/* NOW vertical line */}
          {last && (
            <line x1={xNow} x2={xNow} y1={PAD.top - 2} y2={dims.h - PAD.bottom + 4} stroke={GRID_STRONG} strokeWidth="1" strokeDasharray="2 3" />
          )}

          {/* FORECAST label above wedge */}
          {last && (
            <text x={xNow + (xSettle - xNow) * 0.5} y={PAD.top + 8} fontSize="9.5" fill={TEXT_MUTED} textAnchor="middle" className="font-mono-thin" letterSpacing="0.18em">
              FORECAST
            </text>
          )}

          {/* x-axis history ticks */}
          {histTicks.map((t, i) => (
            <text key={`h-${i}`} x={t.x} y={dims.h - 9} fontSize="9.5" fill={TEXT_MUTED} textAnchor="middle" className="font-mono-thin">
              {t.label}
            </text>
          ))}

          {/* "Now" tick */}
          {last && (
            <text x={xNow} y={dims.h - 9} fontSize="9.5" fill={TEXT} textAnchor="middle" className="font-mono-thin">
              Now
            </text>
          )}

          {/* hover crosshair */}
          {hover && !dragging && (
            <g style={{ pointerEvents: "none" }}>
              <line
                x1={hover.x}
                x2={hover.x}
                y1={PAD.top}
                y2={dims.h - PAD.bottom}
                stroke="rgba(231,245,236,0.18)"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              <circle cx={hover.x} cy={hover.y} r="4.5" fill="#06100a" stroke={PRIMARY} strokeWidth="1.6" />
            </g>
          )}

          {/* spot dot at NOW */}
          {last && (
            <g>
              <circle cx={xNow} cy={y(last.price)} r="7" fill={PRIMARY} fillOpacity="0.18" />
              <circle cx={xNow} cy={y(last.price)} r="3.5" fill={PRIMARY} />
            </g>
          )}

          {/* drag guide — full-width price line + y-axis tag while dragging */}
          {last && dragging && (
            <g style={{ pointerEvents: "none" }}>
              <line
                x1={PAD.left}
                x2={xSettle}
                y1={y(forecastCenter)}
                y2={y(forecastCenter)}
                stroke={PRIMARY}
                strokeOpacity="0.28"
                strokeWidth="1"
                strokeDasharray="2 4"
              />
              <rect x={2} y={y(forecastCenter) - 9} width={PAD.left - 6} height={18} rx={4} fill="#06100a" stroke={PRIMARY} strokeOpacity="0.6" />
              <text
                x={2 + (PAD.left - 6) / 2}
                y={y(forecastCenter) + 3.5}
                fontSize="9.5"
                fill={PRIMARY}
                textAnchor="middle"
                className="font-mono-thin"
              >
                ${forecastCenter.toFixed(priceDecimals)}
              </text>
            </g>
          )}

          {/* band bound values — fade in when the handle is active */}
          {last && (
            <g
              className="font-mono-thin"
              style={{
                pointerEvents: "none",
                opacity: dragging || handleHover ? 1 : 0,
                transition: "opacity 160ms ease",
              }}
            >
              <text x={xSettle + 10} y={y(forecastCenter + forecastBand) + 3} fontSize="9" fill={PRIMARY} fillOpacity="0.9" textAnchor="start">
                ${(forecastCenter + forecastBand).toFixed(priceDecimals)}
              </text>
              <text x={xSettle + 10} y={y(forecastCenter - forecastBand) + 3} fontSize="9" fill={PRIMARY} fillOpacity="0.9" textAnchor="start">
                ${(forecastCenter - forecastBand).toFixed(priceDecimals)}
              </text>
            </g>
          )}

          {/* forecast handle */}
          {last && (
            <g
              style={{
                transform: `translate(${xSettle}px, ${y(forecastCenter)}px)`,
                pointerEvents: "none",
              }}
            >
              {/* idle pulse ring inviting the grab */}
              {!dragging && !handleHover && (
                <circle r="9" className="handle-pulse" fill="none" stroke={PRIMARY} strokeWidth="1.2" />
              )}
              {/* halo */}
              <circle
                r={dragging ? 17 : handleHover ? 14 : 11}
                fill={PRIMARY}
                fillOpacity={dragging ? 0.22 : 0.14}
                style={{ transition: "r 180ms cubic-bezier(0.34, 1.56, 0.64, 1), fill-opacity 160ms ease" }}
              />
              {/* core */}
              <circle
                r={dragging ? 7.5 : 6.5}
                fill={PRIMARY}
                stroke="#06100a"
                strokeWidth="2"
                style={{
                  transition: "r 180ms cubic-bezier(0.34, 1.56, 0.64, 1), filter 160ms ease",
                  filter:
                    dragging || handleHover
                      ? "drop-shadow(0 0 9px rgba(60,224,107,0.85))"
                      : "drop-shadow(0 0 5px rgba(60,224,107,0.45))",
                }}
              />
              {/* grip chevrons — hint that the handle moves vertically */}
              <g
                stroke={PRIMARY}
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                style={{ opacity: dragging || handleHover ? 1 : 0, transition: "opacity 140ms ease" }}
              >
                <path
                  d="M-4,-13 L0,-17 L4,-13"
                  style={{ transform: dragging ? "translateY(-4px)" : "none", transition: "transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
                />
                <path
                  d="M-4,13 L0,17 L4,13"
                  style={{ transform: dragging ? "translateY(4px)" : "none", transition: "transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
                />
              </g>
              {/* generous invisible hit target with grab cursor */}
              <circle
                r="26"
                fill="transparent"
                style={{ pointerEvents: "all", cursor: dragging ? "grabbing" : "grab" }}
                onPointerEnter={() => setHandleHover(true)}
                onPointerLeave={() => setHandleHover(false)}
              />
            </g>
          )}

          {/* demo settlement: the print the market settled at */}
          {last && demoSettlePrice !== null && (
            <g style={{ pointerEvents: "none" }}>
              <path
                d={`M${xNow.toFixed(2)},${y(last.price).toFixed(2)} L${xSettle.toFixed(2)},${y(demoSettlePrice).toFixed(2)}`}
                stroke="#e7f5ec"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                filter="url(#lineGlow)"
              />
              <circle cx={xSettle} cy={y(demoSettlePrice)} r="10" fill="#e7f5ec" fillOpacity="0.15" />
              <circle cx={xSettle} cy={y(demoSettlePrice)} r="5" fill="#e7f5ec" stroke="#06100a" strokeWidth="1.5" />
              <text
                x={xSettle - 12}
                y={y(demoSettlePrice) + (demoSettlePrice >= forecastCenter ? -12 : 20)}
                fontSize="10.5"
                fill="#e7f5ec"
                textAnchor="end"
                className="font-mono-thin"
              >
                settled ${demoSettlePrice.toFixed(2)}
              </text>
            </g>
          )}
        </svg>

        {/* Hover tooltip */}
        {hover && !dragging && (
          <div
            className="glass-panel absolute pointer-events-none px-2.5 py-1.5 text-[11px] font-mono-thin tabular-nums whitespace-nowrap z-10"
            style={{
              left: Math.min(hover.x + 12, dims.w - 130),
              top: Math.max(hover.y - 44, 6),
              borderRadius: 10,
              color: TEXT,
            }}
          >
            <div className="text-accent">${hover.price.toFixed(4)}/hr</div>
            <div className="text-[9.5px] opacity-60">
              {new Date(hover.ts * 1000).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>
        )}

        {/* Forecast value pill — hovers above/below the band so the wedge stays visible */}
        {last && (
          <div
            className="glass-panel glass-panel-accent absolute pointer-events-none px-2.5 py-1.5 font-mono-thin tabular-nums whitespace-nowrap"
            style={{
              right: pillRight,
              top: pillTop,
              borderRadius: 12,
              color: PRIMARY,
              ...(dragging
                ? {
                    borderColor: PRIMARY,
                    boxShadow:
                      "inset 0 1px 0 rgba(255,255,255,0.22), 0 0 30px rgba(60,224,107,0.35), 0 14px 36px rgba(0,0,0,0.5)",
                  }
                : {}),
              transform: dragging ? "scale(1.06)" : "scale(1)",
              transformOrigin: pillAbove >= 6 ? "right bottom" : "right top",
              transition: "transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 150ms ease, border-color 150ms ease",
            }}
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-[13px] font-semibold">${forecastCenter.toFixed(priceDecimals)}</span>
              <span
                className="text-[9.5px]"
                style={{ color: forecastDeltaPct >= 0 ? PRIMARY : "var(--danger)", opacity: 0.95 }}
              >
                {forecastDeltaPct >= 0 ? "↑" : "↓"} {Math.abs(forecastDeltaPct).toFixed(1)}%
              </span>
            </div>
            <div className="text-[9.5px] opacity-60 mt-0.5">± ${forecastBand.toFixed(2)} band</div>
          </div>
        )}
      </div>

    </div>
  );
}

// ---------- helpers ----------

/** Catmull-Rom spline rendered as cubic Béziers — smooth but passes through every point. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length < 3) {
    return pts
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");
  }
  let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`;
  }
  return d;
}

function ClockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** "today" / "tomorrow" / weekday name for the settlement timestamp. */
function relativeDay(ts: number, nowTs: number): string {
  const now = nowTs > 0 ? new Date(nowTs * 1000) : new Date();
  const target = new Date(ts * 1000);
  if (target.toDateString() === now.toDateString()) return "today";
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (target.toDateString() === tomorrow.toDateString()) return "tomorrow";
  return target.toLocaleDateString(undefined, { weekday: "long" });
}

function niceStep(rough: number): number {
  const exp = Math.floor(Math.log10(Math.max(rough, 1e-9)));
  const base = Math.pow(10, exp);
  const norm = rough / base;
  let step = 1;
  if (norm > 5) step = 10;
  else if (norm > 2) step = 5;
  else if (norm > 1) step = 2;
  return step * base;
}
