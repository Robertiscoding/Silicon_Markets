"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight } from "./icons";
import { GlassToggle } from "./glass";
import { GPU_SYMBOLS, SHORT_SYMBOL, type GpuSymbol } from "@/lib/markets";
import {
  buildAllConsensus,
  confidenceLabel,
  type ConsensusForecast,
} from "@/lib/consensus";

type Pt = { ts: number; price: number };

interface ForecastsConsensusProps {
  series: Record<string, Pt[]>;
  settlementTs: number;
}

function subscribe(cb: () => void) {
  const t = setInterval(cb, 1_000);
  return () => clearInterval(t);
}
const getSnapshot = () => Math.floor(Date.now() / 1000);
const getServerSnapshot = () => 0;

const ACCENT = "#3ce06b";

export function ForecastsConsensus({ series, settlementTs }: ForecastsConsensusProps) {
  const spots = useMemo(
    () =>
      Object.fromEntries(
        GPU_SYMBOLS.map((s) => [s, series[s]?.at(-1)?.price ?? 1]),
      ) as Partial<Record<GpuSymbol, number>>,
    [series],
  );
  const all = useMemo(() => buildAllConsensus(spots), [spots]);
  const [selected, setSelected] = useState<GpuSymbol>(all[0]?.symbol ?? "RTX 5090");
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const featured = all.find((c) => c.symbol === selected) ?? all[0];
  const featuredHistory = series[featured.symbol] ?? [];

  const timeUntil = settlementTs - (now || 0);
  const cd = useMemo(() => {
    const t = Math.max(0, timeUntil);
    return { h: Math.floor(t / 3600), m: Math.floor((t % 3600) / 60), s: Math.floor(t % 60) };
  }, [timeUntil]);
  const cycleProgress = Math.min(100, Math.max(0, ((86_400 - Math.max(0, timeUntil)) / 86_400) * 100));

  return (
    <div className="max-w-[1320px] mx-auto w-full flex flex-col gap-4">
      {/* Command bar — title, glass market selector, countdown */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-display text-[20px] md:text-[24px] text-foreground tracking-[0.08em]">
          CONSENSUS
        </h1>

        <GlassToggle
          options={all.map((c) => ({ value: c.symbol, label: SHORT_SYMBOL[c.symbol] }))}
          value={selected}
          onChange={(v) => setSelected(v as GpuSymbol)}
          className="order-3 md:order-none w-full md:w-auto justify-center"
        />

        <div className="glass-panel relative px-4 py-2.5 shrink-0 min-w-[168px]">
          <div className="flex items-center justify-between gap-3 text-[9px] text-muted tracking-[0.14em] font-mono-thin">
            <span>SETTLES IN</span>
            <span className="pulse-dot" style={{ width: 5, height: 5 }} />
          </div>
          <div className="flex items-baseline mt-1.5 font-mono-thin tabular-nums leading-none">
            <span className="text-[18px] text-foreground">{cd.h}</span>
            <span className="text-[9.5px] text-muted ml-0.5 mr-1">h</span>
            <span className="text-[18px] text-foreground">{String(cd.m).padStart(2, "0")}</span>
            <span className="text-[9.5px] text-muted ml-0.5 mr-1">m</span>
            <span className="text-[18px] text-foreground">{String(cd.s).padStart(2, "0")}</span>
            <span className="text-[9.5px] text-muted ml-0.5">s</span>
          </div>
          <div className="mt-2 h-[2.5px] rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${cycleProgress}%`,
                background: "linear-gradient(90deg, var(--accent-dim), var(--accent))",
                transition: "width 1s linear",
              }}
            />
          </div>
        </div>
      </div>

      {/* Featured market */}
      <div className="panel p-5 md:p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)] gap-6">
        {/* Headline */}
        <div className="flex flex-col min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-[14px] text-foreground font-medium">{featured.symbol}</span>
            <span className="text-[10.5px] text-muted">4 PM ET settle</span>
          </div>

          <div className="flex items-baseline gap-2 mt-3">
            <span className="font-display text-[46px] text-accent glow-text leading-none tabular-nums">
              ${featured.consensus.toFixed(2)}
            </span>
            <span className="text-muted text-[12px]">/hr</span>
          </div>

          <div className="mt-3">
            <DeltaPill pct={featured.movePct} />
          </div>

          <div className="text-[11px] text-muted font-mono-thin tabular-nums mt-3">
            spot ${featured.spot.toFixed(2)} · band ${featured.low.toFixed(2)}–$
            {featured.high.toFixed(2)}
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-[9.5px] uppercase tracking-[0.16em] text-muted mb-1.5">
              <span>Confidence</span>
              <span className="text-foreground">{confidenceLabel(featured.confidence)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
              <div
                className="h-full rounded-full bg-accent"
                style={{
                  width: `${Math.round(featured.confidence * 100)}%`,
                  boxShadow: "0 0 10px var(--accent-glow)",
                  transition: "width 300ms ease",
                }}
              />
            </div>
          </div>

          <Link
            href="/"
            className="btn-accent inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[12.5px] mt-auto pt-2.5"
            style={{ marginTop: "auto" }}
          >
            Trade this market <ArrowRight size={14} />
          </Link>
        </div>

        {/* Chart */}
        <ConsensusChart data={featured} history={featuredHistory} />
      </div>

      {/* All markets strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {all.map((c) => (
          <ConsensusCard
            key={c.symbol}
            data={c}
            history={series[c.symbol] ?? []}
            active={c.symbol === selected}
            onSelect={() => setSelected(c.symbol)}
          />
        ))}
      </div>
    </div>
  );
}

function DeltaPill({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-[5px] rounded-full text-[11px] font-mono-thin tabular-nums leading-none"
      style={{
        color: up ? "var(--accent)" : "var(--danger)",
        background: up ? "rgba(60,224,107,0.1)" : "rgba(255,90,107,0.1)",
        border: `1px solid ${up ? "rgba(60,224,107,0.28)" : "rgba(255,90,107,0.28)"}`,
      }}
      title="Consensus vs spot"
    >
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}% vs spot
    </span>
  );
}

const CPAD = { l: 52, r: 84, t: 18, b: 28 };
/** Fraction of the plot width reserved for the forecast cone. */
const FORECAST_FRAC = 0.3;

function ConsensusChart({ data, history }: { data: ConsensusForecast; history: Pt[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dims, setDims] = useState({ w: 760, h: 300 });
  const [hover, setHover] = useState<{ x: number; y: number; ts: number; price: number } | null>(
    null,
  );

  // Pixel-perfect sizing: render at the container's real pixel size so
  // strokes, dots and text never stretch or blur.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r && r.width > 50) setDims({ w: Math.round(r.width), h: 300 });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hist =
    history.length >= 2
      ? history
      : [
          { ts: 0, price: data.spot },
          { ts: 1, price: data.spot },
        ];

  const innerW = Math.max(50, dims.w - CPAD.l - CPAD.r);
  const innerH = Math.max(50, dims.h - CPAD.t - CPAD.b);
  const xNow = CPAD.l + innerW * (1 - FORECAST_FRAC);
  const xSettle = CPAD.l + innerW;

  const tMin = hist[0].ts;
  const tMax = hist[hist.length - 1].ts;
  const xHist = (t: number) => CPAD.l + ((t - tMin) / (tMax - tMin || 1)) * (xNow - CPAD.l);

  const distMin = data.bins[0].center;
  const distMax = data.bins[data.bins.length - 1].center;
  const prices = hist.map((h) => h.price);
  let lo = Math.min(...prices, distMin, data.spot, data.low);
  let hi = Math.max(...prices, distMax, data.spot, data.high);
  const padY = (hi - lo) * 0.12 || 0.02;
  lo -= padY;
  hi += padY;
  const y = (v: number) => CPAD.t + (1 - (v - lo) / (hi - lo || 1)) * innerH;

  const pts = hist.map((h) => ({ x: xHist(h.ts), y: y(h.price) }));
  const linePath = smoothPath(pts);
  const baseline = dims.h - CPAD.b;
  const areaPath =
    pts.length >= 2
      ? `${linePath} L${pts[pts.length - 1].x.toFixed(2)},${baseline} L${pts[0].x.toFixed(2)},${baseline} Z`
      : "";

  // Cones fan out from the last spot to the settlement column.
  const ySpot = y(data.spot);
  const band50 = `${xNow},${ySpot} ${xSettle},${y(data.high)} ${xSettle},${y(data.low)}`;
  const bandFull = `${xNow},${ySpot} ${xSettle},${y(distMax)} ${xSettle},${y(distMin)}`;
  const consensusLine = `M${xNow},${ySpot} L${xSettle},${y(data.consensus)}`;

  // y ticks
  const step = niceStep((hi - lo) / 6);
  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v);

  // x date ticks (history side).
  const dateTicks = [0, 0.25, 0.5, 0.75].map((f) => {
    const t = tMin + f * (tMax - tMin);
    return {
      x: xHist(t),
      label: new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    };
  });

  // Right-edge distribution density (sideways histogram pinned at settlement).
  const maxW = Math.max(...data.bins.map((b) => b.weight), 1e-6);
  const densityLen = 44;
  const binPxH = Math.abs(y(data.bins[0].center) - y(data.bins[1].center)) * 0.82 || 3;

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current || hist.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    if (xPx > xNow + 4) {
      setHover(null);
      return;
    }
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - xPx);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHover({ x: pts[best].x, y: pts[best].y, ts: hist[best].ts, price: hist[best].price });
  };

  return (
    <div ref={wrapRef} className="min-w-0 panel-flat p-3 relative">
      <svg
        ref={svgRef}
        width={dims.w - 24}
        height={dims.h}
        viewBox={`0 0 ${dims.w - 24} ${dims.h}`}
        className="w-full h-[300px]"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="consLine" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#8a8a8a" />
            <stop offset="100%" stopColor="#e8e8e8" />
          </linearGradient>
          <linearGradient id="consArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#e8e8e8" stopOpacity="0.12" />
            <stop offset="60%" stopColor="#e8e8e8" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#e8e8e8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="consCone" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.03" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0.3" />
          </linearGradient>
          <filter id="cline" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* horizontal gridlines */}
        {yTicks.map((v, i) => (
          <line
            key={`g${i}`}
            x1={CPAD.l}
            x2={dims.w - 24 - CPAD.r + 60}
            y1={y(v)}
            y2={y(v)}
            stroke="rgba(80,200,120,0.07)"
          />
        ))}
        {/* y labels */}
        {yTicks.map((v, i) => (
          <text
            key={`yl${i}`}
            x={CPAD.l - 8}
            y={y(v) + 3}
            fontSize="10"
            fill="#666666"
            textAnchor="end"
            className="font-mono-thin"
          >
            ${v.toFixed(2)}
          </text>
        ))}

        {/* area fill under the price curve */}
        {areaPath && <path d={areaPath} fill="url(#consArea)" />}

        {/* full-range cone (faint) */}
        <polygon points={bandFull} fill={`${ACCENT}0d`} />
        {/* central 50% cone */}
        <polygon
          points={band50}
          fill="url(#consCone)"
          stroke={ACCENT}
          strokeOpacity="0.35"
          strokeWidth="1"
        />

        {/* right-edge distribution density */}
        {data.bins.map((b, i) => {
          const len = (b.weight / maxW) * densityLen;
          return (
            <rect
              key={`d${i}`}
              x={xSettle - len}
              y={y(b.center) - binPxH / 2}
              width={len}
              height={binPxH}
              fill={ACCENT}
              fillOpacity="0.26"
            />
          );
        })}

        {/* historical price curve */}
        <path
          d={linePath}
          stroke="url(#consLine)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#cline)"
        />

        {/* consensus projection (dashed) */}
        <path d={consensusLine} stroke={ACCENT} strokeWidth="1.5" strokeDasharray="4 4" fill="none" />

        {/* now divider */}
        <line
          x1={xNow}
          x2={xNow}
          y1={CPAD.t - 2}
          y2={CPAD.t + innerH}
          stroke="rgba(231,245,236,0.16)"
          strokeWidth="1"
          strokeDasharray="2 3"
        />

        {/* hover crosshair */}
        {hover && (
          <g style={{ pointerEvents: "none" }}>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={CPAD.t}
              y2={CPAD.t + innerH}
              stroke="rgba(231,245,236,0.18)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <circle cx={hover.x} cy={hover.y} r="4.5" fill="#06100a" stroke={ACCENT} strokeWidth="1.6" />
          </g>
        )}

        {/* spot dot */}
        <circle cx={xNow} cy={ySpot} r="7" fill={ACCENT} fillOpacity="0.16" />
        <circle cx={xNow} cy={ySpot} r="3.5" fill="#ffffff" />

        {/* consensus dot */}
        <circle cx={xSettle} cy={y(data.consensus)} r="11" fill={ACCENT} fillOpacity="0.16" />
        <circle cx={xSettle} cy={y(data.consensus)} r="5.5" fill={ACCENT} stroke="#06100a" strokeWidth="1.5" />

        {/* x ticks */}
        {dateTicks.map((t, i) => (
          <text
            key={`x${i}`}
            x={t.x}
            y={dims.h - 9}
            fontSize="9.5"
            fill="#666666"
            textAnchor="middle"
            className="font-mono-thin"
          >
            {t.label}
          </text>
        ))}
        <text x={xNow} y={dims.h - 9} fontSize="9.5" fill="#ffffff" textAnchor="middle" className="font-mono-thin">
          Now
        </text>
        <text x={xSettle} y={dims.h - 9} fontSize="9.5" fill={ACCENT} textAnchor="end" className="font-mono-thin">
          4PM ET
        </text>
      </svg>

      {/* hover tooltip */}
      {hover && (
        <div
          className="glass-panel absolute pointer-events-none px-2.5 py-1.5 text-[11px] font-mono-thin tabular-nums whitespace-nowrap z-10"
          style={{
            left: Math.min(hover.x + 14, dims.w - 140),
            top: Math.max(hover.y - 38, 8),
            borderRadius: 10,
            color: "#ffffff",
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
    </div>
  );
}

/** Catmull-Rom spline rendered as cubic Béziers — smooth but passes through every point. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length < 3) {
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
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

function ConsensusCard({
  data,
  history,
  active,
  onSelect,
}: {
  data: ConsensusForecast;
  history: Pt[];
  active: boolean;
  onSelect: () => void;
}) {
  const up = data.movePct >= 0;
  return (
    <button
      type="button"
      onClick={onSelect}
      title={`spot $${data.spot.toFixed(2)} · band $${data.low.toFixed(2)}–$${data.high.toFixed(2)} · ${confidenceLabel(data.confidence)} confidence`}
      className={`text-left panel p-3.5 transition-all duration-150 ${
        active ? "border-accent glow-soft" : "hover:border-[var(--border-strong)] hover:-translate-y-0.5"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-foreground font-medium truncate">
          {SHORT_SYMBOL[data.symbol]}
        </span>
        <span
          className={`text-[10px] font-mono-thin tabular-nums shrink-0 ${
            up ? "text-accent" : "text-[var(--danger)]"
          }`}
        >
          {up ? "▲" : "▼"} {Math.abs(data.movePct).toFixed(1)}%
        </span>
      </div>

      <div className="font-display text-[21px] text-foreground leading-none tabular-nums mt-2">
        ${data.consensus.toFixed(2)}
      </div>

      <MiniForecastSpark history={history} data={data} />
    </button>
  );
}

const MC = { w: 280, h: 56, frac: 0.34 };

function MiniForecastSpark({ history, data }: { history: Pt[]; data: ConsensusForecast }) {
  const hist =
    history.length >= 2
      ? history
      : [
          { ts: 0, price: data.spot },
          { ts: 1, price: data.spot },
        ];
  const xNow = MC.w * (1 - MC.frac);
  const xSettle = MC.w - 3;
  const tMin = hist[0].ts;
  const tMax = hist[hist.length - 1].ts;
  const xHist = (t: number) => 2 + ((t - tMin) / (tMax - tMin || 1)) * (xNow - 2);

  const prices = hist.map((h) => h.price);
  let lo = Math.min(...prices, data.low, data.spot);
  let hi = Math.max(...prices, data.high, data.spot);
  const padY = (hi - lo) * 0.15 || 0.02;
  lo -= padY;
  hi += padY;
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo || 1)) * (MC.h - 8);

  const pts = hist.map((h) => ({ x: xHist(h.ts), y: y(h.price) }));
  const linePath = smoothPath(pts);
  const ySpot = y(data.spot);
  const band = `${xNow},${ySpot} ${xSettle},${y(data.high)} ${xSettle},${y(data.low)}`;

  return (
    <svg viewBox={`0 0 ${MC.w} ${MC.h}`} preserveAspectRatio="none" className="w-full h-[40px] mt-2.5">
      <polygon
        points={band}
        fill={ACCENT}
        fillOpacity="0.14"
        stroke={ACCENT}
        strokeOpacity="0.35"
        strokeWidth="0.8"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={linePath}
        stroke="rgba(232,232,232,0.75)"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d={`M${xNow},${ySpot} L${xSettle},${y(data.consensus)}`}
        stroke={ACCENT}
        strokeWidth="1"
        strokeDasharray="3 3"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={xSettle} cy={y(data.consensus)} r="3" fill={ACCENT} />
    </svg>
  );
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
