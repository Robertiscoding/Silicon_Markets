"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount } from "wagmi";

/**
 * "Deposit from any chain" — bridges USDC into Arc with Circle App Kit's
 * kit.bridge() (CCTP V2 burn-and-mint, https://docs.arc.io/app-kit/bridge).
 * The user's own wallet signs on the source chain; the same address receives
 * native USDC on Arc Testnet. SDK modules are imported lazily so the heavy
 * App Kit bundle never loads unless the modal is used.
 */

const SOURCE_CHAINS = [
  { id: "Base_Sepolia", label: "Base Sepolia" },
  { id: "Ethereum_Sepolia", label: "Ethereum Sepolia" },
  { id: "Arbitrum_Sepolia", label: "Arbitrum Sepolia" },
  { id: "Optimism_Sepolia", label: "OP Sepolia" },
  { id: "Avalanche_Fuji", label: "Avalanche Fuji" },
  { id: "Polygon_Amoy_Testnet", label: "Polygon Amoy" },
  { id: "Unichain_Sepolia", label: "Unichain Sepolia" },
  { id: "Linea_Sepolia", label: "Linea Sepolia" },
] as const;

type SourceChainId = (typeof SOURCE_CHAINS)[number]["id"];

interface BridgeStepView {
  name: string;
  state: string;
  txHash?: string;
}

interface BridgeModalProps {
  open: boolean;
  onClose: () => void;
}

export function BridgeModal({ open, onClose }: BridgeModalProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, connector, isConnected } = useAccount();
  const [sourceChain, setSourceChain] = useState<SourceChainId>("Base_Sepolia");
  const [amount, setAmount] = useState("1.00");
  const [phase, setPhase] = useState<"idle" | "bridging" | "done" | "error">("idle");
  const [statusLine, setStatusLine] = useState("");
  const [steps, setSteps] = useState<BridgeStepView[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  async function runBridge() {
    if (!connector || !address || phase === "bridging") return;
    setPhase("bridging");
    setError("");
    setSteps([]);
    setStatusLine("Preparing — your wallet will prompt to switch to the source network…");
    try {
      const [{ AppKit }, { createViemAdapterFromProvider }] = await Promise.all([
        import("@circle-fin/app-kit"),
        import("@circle-fin/adapter-viem-v2"),
      ]);
      const provider = (await connector.getProvider()) as Parameters<
        typeof createViemAdapterFromProvider
      >[0]["provider"];
      const adapter = await createViemAdapterFromProvider({ provider });
      const kit = new AppKit();

      // Surface SDK progress events when available (approve → burn → mint).
      const emitter = kit as unknown as {
        on?: (event: string, cb: (payload: unknown) => void) => void;
      };
      if (typeof emitter.on === "function") {
        for (const ev of ["approve", "burn", "fetchAttestation", "mint"]) {
          try {
            emitter.on(ev, () => setStatusLine(`${ev} complete — continuing…`));
          } catch {
            // event name not supported by this SDK version; ignore
          }
        }
      }

      setStatusLine("Bridging — sign the approve and burn transactions in your wallet…");
      const result = await kit.bridge({
        from: { adapter, chain: sourceChain },
        to: { adapter, chain: "Arc_Testnet" },
        amount,
        config: { transferSpeed: "FAST" },
      });

      const stepViews: BridgeStepView[] = (
        (result as { steps?: { name?: string; state?: string; txHash?: string }[] }).steps ?? []
      ).map((s) => ({
        name: s.name ?? "step",
        state: s.state ?? "unknown",
        txHash: s.txHash,
      }));
      setSteps(stepViews);

      const state = (result as { state?: string }).state ?? "unknown";
      if (state === "success" || state === "completed") {
        setPhase("done");
        setStatusLine(`Done — ${amount} USDC minted to ${short(address)} on Arc.`);
      } else {
        setPhase("error");
        setError(`Bridge ended in state "${state}" — see steps below.`);
      }
    } catch (err: unknown) {
      setPhase("error");
      setError(err instanceof Error ? err.message.slice(0, 240) : String(err));
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative panel w-full max-w-[420px] p-6 flex flex-col gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted">
            Deposit USDC · Circle CCTP V2
          </div>
          <h2 className="font-display text-[22px] text-foreground leading-tight mt-1">
            Bridge into Arc.
          </h2>
          <p className="text-[11px] text-muted-strong mt-1 leading-snug">
            Burn USDC on a source testnet, mint native USDC on Arc — via Circle App Kit.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted">From chain</span>
            <select
              value={sourceChain}
              onChange={(e) => setSourceChain(e.target.value as SourceChainId)}
              disabled={phase === "bridging"}
              className="panel-flat px-3 py-2 text-[13px] text-foreground bg-transparent outline-none"
            >
              {SOURCE_CHAINS.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#18181b]">
                  {c.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted">Amount (USDC)</span>
            <input
              type="number"
              min="0.10"
              step="0.10"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={phase === "bridging"}
              className="panel-flat px-3 py-2 text-[13px] text-foreground bg-transparent outline-none font-mono-thin tabular-nums"
            />
          </label>
        </div>

        {statusLine && phase !== "idle" && (
          <div
            className={`text-[11px] font-mono-thin leading-snug ${
              phase === "bridging" ? "text-muted-strong animate-pulse" : "text-foreground"
            }`}
          >
            {statusLine}
          </div>
        )}

        {steps.length > 0 && (
          <div className="panel-flat p-2.5 flex flex-col gap-1 text-[10.5px] font-mono-thin">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <span className={s.state === "success" ? "text-accent" : "text-muted-strong"}>
                  {s.state === "success" ? "✓" : "·"} {s.name}
                </span>
                {s.txHash && <span className="text-muted truncate">{short(s.txHash)}</span>}
              </div>
            ))}
          </div>
        )}

        {error && <div className="text-[11px] text-[var(--danger)] font-mono-thin">{error}</div>}

        <button
          type="button"
          disabled={!isConnected || phase === "bridging" || Number(amount) <= 0}
          onClick={phase === "done" ? onClose : runBridge}
          className="btn-accent w-full py-2.5 text-[13px]"
        >
          {!isConnected
            ? "Connect wallet first"
            : phase === "bridging"
              ? "Bridging…"
              : phase === "done"
                ? "Done"
                : `Bridge ${amount} USDC to Arc`}
        </button>
      </div>
    </div>,
    document.body,
  );
}

function short(s: string) {
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}
