"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import type { GpuSymbol } from "@/lib/markets";

export interface DemoResult {
  marketId: number;
  mirrored: boolean;
  spot: number;
  settlePrice: number;
  movePct: number;
  refunded: boolean;
  pool: number;
  totalWon: number;
  results: { center: number; band: number; stake: number; win: boolean; payout: number }[];
  txs: { resolve?: string };
}

interface DemoSettleProps {
  symbol: GpuSymbol;
  settlementTs: number;
  onResult: (result: DemoResult) => void;
}

/**
 * DEMO-ONLY button: mirrors the connected wallet's live forecasts into a
 * throwaway market on Arc and settles it at a random ±5% print — real
 * transactions end to end. Results surface via onResult (chart line + popup).
 */
export function DemoSettle({ symbol, settlementTs, onResult }: DemoSettleProps) {
  const { address } = useAccount();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function runDemo() {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/demo-settle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, address, settlementTs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onResult(data as DemoResult);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="panel px-5 py-3.5 max-w-[1400px] mx-auto w-full mt-4 flex items-center gap-5 flex-wrap">
      <div
        className="shrink-0"
        title="Mirrors your forecasts into a throwaway market on Arc and settles it at a random print within ±5% of spot — real transactions, real payouts."
      >
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted">
          Demo settlement <span className="text-[var(--danger)]">· demo use only</span>
        </div>
      </div>

      <button
        type="button"
        disabled={running}
        onClick={runDemo}
        className="btn-accent px-4 py-2.5 text-[13px] shrink-0"
      >
        {running ? "Settling on-chain… ~30s" : "Settle demo @ random ±5%"}
      </button>

      {error && <span className="text-[11px] text-[var(--danger)] font-mono-thin">{error}</span>}
    </div>
  );
}
