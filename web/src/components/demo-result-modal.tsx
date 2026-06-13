"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { formatUsd } from "@/lib/markets";
import type { DemoResult } from "./demo-settle";

interface DemoResultModalProps {
  result: DemoResult | null;
  onClose: () => void;
}

/** "Market settled — you won $X" popup shown after a demo settlement. */
export function DemoResultModal({ result, onClose }: DemoResultModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!result) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result, onClose]);

  if (!mounted || !result) return null;

  const won = result.totalWon > 0;
  const totalStaked = result.results.reduce((s, r) => s + r.stake, 0);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative panel w-full max-w-[440px] p-6 flex flex-col gap-4 text-center">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted">
            Demo settlement · on-chain
          </div>
          <div className="font-display text-[26px] text-foreground leading-tight mt-2">
            Settled at ${result.settlePrice.toFixed(2)}
            <span
              className={`text-[16px] ml-2 ${result.movePct >= 0 ? "text-accent" : "text-[var(--danger)]"}`}
            >
              {result.movePct >= 0 ? "+" : ""}
              {result.movePct.toFixed(2)}%
            </span>
          </div>
        </div>

        <div
          className={`font-display text-[44px] leading-none tabular-nums ${
            won ? "text-accent glow-text" : "text-[var(--danger)]"
          }`}
        >
          {won ? `You won ${formatUsd(result.totalWon, 2)}` : "You lost"}
        </div>
        {!won && !result.refunded && (
          <div className="text-[11.5px] text-muted -mt-2">
            {formatUsd(totalStaked, 2)} staked · no band caught the print
          </div>
        )}
        {result.refunded && (
          <div className="text-[11.5px] text-muted -mt-2">
            No winners — every stake refunded in full.
          </div>
        )}

        {/* per-forecast breakdown */}
        <div className="panel-flat p-3 flex flex-col gap-1.5 text-[12px] font-mono-thin tabular-nums">
          {result.results.map((r, i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-muted-strong">
                ${(r.center - r.band).toFixed(2)}–${(r.center + r.band).toFixed(2)} ·{" "}
                {formatUsd(r.stake, 2)}
              </span>
              <span className={r.win || result.refunded ? "text-accent" : "text-[var(--danger)]"}>
                {r.win || result.refunded ? `✓ ${formatUsd(r.payout, 2)}` : "✗ lost"}
              </span>
            </div>
          ))}
        </div>

        <div className="text-[10.5px] text-muted leading-snug">
          {result.mirrored
            ? "Your live forecasts were mirrored into a demo market and settled for real on Arc."
            : "A demo market was seeded and settled for real on Arc."}{" "}
          Winnings are real USDC, waiting to be claimed.
        </div>

        <div className="flex gap-2.5">
          {(won || result.refunded) && (
            <Link href="/payouts" className="btn-accent flex-1 py-2.5 text-[13px]" onClick={onClose}>
              Claim winnings →
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`py-2.5 text-[13px] rounded-md border border-[var(--border-strong)] text-muted-strong hover:text-foreground transition-colors ${
              won || result.refunded ? "px-5" : "flex-1"
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
