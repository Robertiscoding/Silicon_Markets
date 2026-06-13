"use client";

import { useMemo, useState } from "react";
import { maxUint256 } from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import {
  ERC20_ABI,
  SILICON_MARKET_ABI,
  SILICON_MARKET_ADDRESS,
  USDC_ADDRESS,
} from "@/lib/contracts";
import {
  expectedPayout,
  formatHr,
  formatUsd,
  gaussianBandProbability,
  impliedOddsLabel,
  priceToScaled,
  rawToUsdc,
  usdcToRaw,
  type GpuSymbol,
} from "@/lib/markets";

interface ForecastPanelProps {
  symbol: GpuSymbol;
  spotPrice: number;
  forecastCenter: number;
  forecastBand: number;
  stakeUsd: number;
  settlementTs: number;
  nowTs: number;
  marketId: bigint | null;
  onStakeChange: (value: number) => void;
  onBandChange: (value: number) => void;
  onCenterChange: (value: number) => void;
}

const STAKE_PRESETS = [10, 50, 100];

export function ForecastPanel({
  symbol,
  spotPrice,
  forecastCenter,
  forecastBand,
  stakeUsd,
  settlementTs,
  nowTs,
  marketId,
  onStakeChange,
  onBandChange,
  onCenterChange,
}: ForecastPanelProps) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const [status, setStatus] = useState("");

  const stakeRaw = useMemo(() => usdcToRaw(stakeUsd), [stakeUsd]);

  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const { data: allowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, SILICON_MARKET_ADDRESS] : undefined,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const { data: onchainOddsBps } = useReadContract({
    address: SILICON_MARKET_ADDRESS,
    abi: SILICON_MARKET_ABI,
    functionName: "impliedOddsBps",
    args:
      marketId !== null ? [marketId, priceToScaled(forecastCenter)] : undefined,
    query: { enabled: marketId !== null, refetchInterval: 18_000 },
  });

  const fallbackOddsBps = Math.max(
    1,
    Math.round(gaussianBandProbability(spotPrice, forecastCenter, forecastBand) * 10_000),
  );
  const oddsBps = onchainOddsBps && onchainOddsBps > 0 ? Number(onchainOddsBps) : fallbackOddsBps;
  const payout = expectedPayout(stakeUsd, oddsBps);

  const { writeContractAsync, data: txHash } = useWriteContract();
  const { isLoading: txPending } = useWaitForTransactionReceipt({ hash: txHash });

  const usdcAvailable = usdcBalance ? rawToUsdc(usdcBalance) : 0;
  const tradingClosed = nowTs > 0 && nowTs >= settlementTs - 300;
  const lockedOut =
    !address || stakeUsd <= 0 || stakeUsd > usdcAvailable || txPending || tradingClosed;

  async function handleLock() {
    if (!address || !publicClient) return;
    try {
      let id = marketId;
      if (id === null) {
        setStatus("Creating market…");
        const createHash = await writeContractAsync({
          address: SILICON_MARKET_ADDRESS,
          abi: SILICON_MARKET_ABI,
          functionName: "createMarket",
          args: [symbol, BigInt(settlementTs)],
        });
        await publicClient.waitForTransactionReceipt({ hash: createHash });
        const lookup = await publicClient.readContract({
          address: SILICON_MARKET_ADDRESS,
          abi: SILICON_MARKET_ABI,
          functionName: "marketIdFor",
          args: [symbol, BigInt(settlementTs)],
        });
        if (!lookup[1]) throw new Error("Market not found after create");
        id = lookup[0];
      }

      if (!allowance || allowance < stakeRaw) {
        setStatus("Approving USDC…");
        const approveHash = await writeContractAsync({
          address: USDC_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [SILICON_MARKET_ADDRESS, maxUint256],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setStatus("Locking forecast…");
      const hash = await writeContractAsync({
        address: SILICON_MARKET_ADDRESS,
        abi: SILICON_MARKET_ABI,
        functionName: "lockForecast",
        args: [id, priceToScaled(forecastCenter), priceToScaled(forecastBand), stakeRaw],
      });
      setStatus(`Locked · ${hash.slice(0, 10)}…`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(`Error: ${msg.slice(0, 120)}`);
    }
  }

  return (
    <section style={{ border: "1px solid black", padding: 16 }}>
      <h2 style={{ margin: "0 0 12px", fontSize: 16 }}>Forecast · {symbol}</h2>

      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Center ({formatHr(forecastCenter)})</span>
          <input
            type="range"
            min={Math.max(0.01, spotPrice * 0.5)}
            max={spotPrice * 1.5}
            step={0.01}
            value={forecastCenter}
            onChange={(e) => onCenterChange(Number(e.target.value))}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Band ±{formatHr(forecastBand)}</span>
          <input
            type="range"
            min={0.01}
            max={Math.max(0.05, spotPrice * 0.15)}
            step={0.005}
            value={forecastBand}
            onChange={(e) => onBandChange(Number(e.target.value))}
          />
        </label>

        <div>
          <p style={{ margin: "0 0 8px" }}>Stake</p>
          <div style={{ display: "flex", gap: 8 }}>
            {STAKE_PRESETS.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => onStakeChange(amount)}
                style={{
                  border: "1px solid black",
                  background: stakeUsd === amount ? "black" : "white",
                  color: stakeUsd === amount ? "white" : "black",
                  padding: "6px 12px",
                  cursor: "pointer",
                }}
              >
                ${amount}
              </button>
            ))}
          </div>
          {isConnected ? (
            <p style={{ margin: "8px 0 0", fontSize: 12 }}>Balance: {formatUsd(usdcAvailable)}</p>
          ) : null}
        </div>

        <div style={{ borderTop: "1px solid black", paddingTop: 12, display: "grid", gap: 4 }}>
          <span>Implied odds: {impliedOddsLabel(oddsBps)}</span>
          <span>Est. payout: {formatUsd(payout)}</span>
          <span>
            Range: {formatHr(forecastCenter - forecastBand)} – {formatHr(forecastCenter + forecastBand)}
          </span>
        </div>

        <button
          type="button"
          disabled={!isConnected || lockedOut}
          onClick={handleLock}
          style={{
            border: "1px solid black",
            background: !isConnected || lockedOut ? "#eee" : "white",
            color: !isConnected || lockedOut ? "#666" : "black",
            padding: "10px 12px",
            cursor: !isConnected || lockedOut ? "not-allowed" : "pointer",
          }}
        >
          {!isConnected
            ? "Connect wallet to lock"
            : tradingClosed
              ? "Trading closed"
              : txPending
                ? "Confirming…"
                : "Lock forecast"}
        </button>

        {status ? <p style={{ margin: 0, fontSize: 12 }}>{status}</p> : null}
      </div>
    </section>
  );
}
