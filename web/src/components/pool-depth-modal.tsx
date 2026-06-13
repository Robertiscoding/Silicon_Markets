"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatUsd, type GpuSymbol } from "@/lib/markets";

export interface DepthBucket {
  bucketIdx: number;
  bucketLow: number;
  bucketHigh: number;
  poolUsd: number;
  mineUsd: number;
  isCovered: boolean;
}

export interface PoolForecast {
  user: string;
  center: number;
  band: number;
  stake: number;
}

interface PoolDepthModalProps {
  open: boolean;
  onClose: () => void;
  symbol: GpuSymbol;
  /** Same rows the Oracle panel's Pool depth chart renders. */
  depth: DepthBucket[];
  forecasts: PoolForecast[];
  myAddress?: string;
  poolUsd: number | null;
  forecastCenter: number;
  forecastBand: number;
}

function shortAddr(addr: string): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Expanded view of the Oracle panel's Pool depth chart: the identical buckets
 * and on-chain stakes, drawn larger, with per-bucket dollar labels and the
 * full list of forecasts behind them.
 */
export function PoolDepthModal({
  open,
  onClose,
  symbol,
  depth,
  forecasts,
  myAddress,
  poolUsd,
  forecastCenter,
  forecastBand,
}: PoolDepthModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const maxPool = Math.max(0.01, ...depth.map((d) => d.poolUsd));
  const me = myAddress?.toLowerCase();

  const rows = useMemo(
    () =>
      [...forecasts]
        .map((f, i) => ({ ...f, id: i }))
        .sort((a, b) => b.stake - a.stake),
    [forecasts],
  );
  const myTotal = useMemo(
    () => (me ? forecasts.filter((f) => f.user === me).reduce((s, f) => s + f.stake, 0) : 0),
    [forecasts, me],
  );

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8 overflow-y-auto">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative panel w-full max-w-[940px] my-auto p-5 md:p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.22em] text-muted">Pool depth</div>
            <h2 className="font-display text-[22px] md:text-[26px] text-foreground leading-tight mt-1">
              {symbol} settlement pool.
            </h2>
            <p className="text-[11.5px] text-muted-strong mt-1 max-w-[560px] leading-snug">
              Every locked forecast, bucket by bucket. Winners whose band contains the Ornn print
              split the pool pro-rata by stake (−1% fee).
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="icon-pill shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Big chart — same data as the panel strip */}
        <div className="panel-flat p-3">
          <div className="flex items-center justify-between mb-2 text-[10.5px]">
            <span className="text-muted uppercase tracking-[0.18em]">
              {depth.length} buckets · staked USDC per bucket
            </span>
            <span className="text-muted-strong inline-flex items-center gap-1.5">
              <span className="pulse-dot" /> live on-chain · Arc WSS
            </span>
          </div>
          <div className="grid grid-flow-col auto-cols-fr gap-[2px] items-end h-[180px]">
            {depth.map((d) => {
              const isEmpty = d.poolUsd <= 0;
              const heightPct = Math.max(6, (d.poolUsd / maxPool) * 100);
              return (
                <div key={d.bucketIdx} className="flex flex-col items-stretch h-full">
                  <div className="flex-1 flex items-end">
                    {isEmpty ? (
                      <div className="w-full h-full rounded-sm border border-dashed border-[var(--border)]" />
                    ) : (
                      <div
                        className={`w-full rounded-t-sm transition-[height,background] duration-150 ${
                          d.isCovered
                            ? "bg-[var(--accent)] shadow-[0_0_18px_rgba(60,224,107,0.45)]"
                            : "bg-[rgba(80,200,120,0.22)]"
                        }`}
                        style={{ height: `${heightPct}%` }}
                        title={`$${d.bucketLow.toFixed(2)}–$${d.bucketHigh.toFixed(2)} · staked $${d.poolUsd.toFixed(2)}${d.mineUsd > 0 ? ` (yours $${d.mineUsd.toFixed(2)})` : ""}`}
                      />
                    )}
                  </div>
                  <div
                    className={`text-center text-[8.5px] font-mono-thin mt-1 ${
                      isEmpty ? "text-muted/50" : d.isCovered ? "text-accent" : "text-muted"
                    }`}
                  >
                    {isEmpty ? "—" : `$${d.poolUsd.toFixed(d.poolUsd >= 10 ? 0 : 2)}`}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted font-mono-thin mt-1.5">
            <span>${depth[0]?.bucketLow.toFixed(2) ?? ""}</span>
            <span className="text-accent">
              your band: ${(forecastCenter - forecastBand).toFixed(2)}–$
              {(forecastCenter + forecastBand).toFixed(2)}
            </span>
            <span>${depth[depth.length - 1]?.bucketHigh.toFixed(2) ?? ""}</span>
          </div>
        </div>

        {/* Forecast list + stats */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_240px] gap-4">
          <div className="flex flex-col">
            <div className="text-[10.5px] uppercase tracking-[0.22em] text-muted mb-2">
              All forecasts in this pool ({forecasts.length})
            </div>
            <div className="overflow-x-auto">
              <table className="text-[11px] w-full font-mono-thin">
                <thead>
                  <tr className="text-muted">
                    <th className="text-left font-normal py-1 pr-2">band</th>
                    <th className="text-right font-normal py-1 pr-2">stake</th>
                    <th className="text-right font-normal py-1 pr-2">share of pool</th>
                    <th className="text-left font-normal py-1 pl-3">forecaster</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-muted py-2">
                        No forecasts yet — be the first to seed the pool.
                      </td>
                    </tr>
                  )}
                  {rows.map((f) => {
                    const isMine = me && f.user === me;
                    return (
                      <tr key={f.id} className="text-foreground/90 border-t border-[var(--border)]">
                        <td className="py-1.5 pr-2 text-muted-strong">
                          ${(f.center - f.band).toFixed(2)}–${(f.center + f.band).toFixed(2)}
                          <span className="text-muted"> (${f.center.toFixed(2)} ± ${f.band.toFixed(2)})</span>
                        </td>
                        <td className="text-right py-1.5 pr-2">{formatUsd(f.stake, 2)}</td>
                        <td className="text-right py-1.5 pr-2 text-muted-strong">
                          {poolUsd && poolUsd > 0 ? `${((f.stake / poolUsd) * 100).toFixed(1)}%` : "—"}
                        </td>
                        <td className="py-1.5 pl-3">
                          {isMine ? <span className="text-accent">you</span> : shortAddr(f.user)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 text-[12px] panel-flat p-3 h-fit">
            <div>
              <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted">Total pool</div>
              <div className="font-mono-thin text-[16px] text-accent mt-0.5">
                {poolUsd !== null ? formatUsd(poolUsd, 2) : "—"}
              </div>
            </div>
            <div>
              <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted">Forecasts</div>
              <div className="font-mono-thin text-[14px] text-foreground mt-0.5">{forecasts.length}</div>
            </div>
            <div>
              <div className="text-[9.5px] uppercase tracking-[0.18em] text-muted">Your stake</div>
              <div className="font-mono-thin text-[14px] text-foreground mt-0.5">
                {myTotal > 0 ? formatUsd(myTotal, 2) : "—"}
              </div>
            </div>
            <div className="text-[10px] text-muted leading-snug border-t border-[var(--border)] pt-2">
              Payouts are pari-mutuel: if the print lands in your band, you split the pool with every
              other winning band, pro-rata by stake.
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
