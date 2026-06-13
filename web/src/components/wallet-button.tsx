"use client";

import { useAccount, useBalance, useConnect, useDisconnect } from "wagmi";
import { USDC_ADDRESS } from "@/lib/contracts";
import { rawToUsdc } from "@/lib/markets";

export function WalletButton() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, status } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: usdc } = useBalance({
    address,
    token: USDC_ADDRESS,
    query: { enabled: !!address, refetchInterval: 12_000 },
  });

  const balance = usdc ? rawToUsdc(usdc.value) : 0;
  const label = isConnected
    ? `$${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`
    : "Connect";

  function onClick() {
    if (isConnected) {
      disconnect();
      return;
    }
    const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
    if (injected) connect({ connector: injected });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={address ?? "Connect wallet"}
      style={{
        border: "1px solid black",
        background: isConnected ? "black" : "white",
        color: isConnected ? "white" : "black",
        padding: "6px 12px",
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      {status === "pending" ? "…" : label}
    </button>
  );
}
