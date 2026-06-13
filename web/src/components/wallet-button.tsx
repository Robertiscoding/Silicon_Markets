"use client";

import { useAccount, useBalance, useConnect, useDisconnect } from "wagmi";
import { USDC_ADDRESS } from "@/lib/contracts";
import { rawToUsdc } from "@/lib/markets";
import { BellIcon } from "./icons";

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
    ? `$${balance.toLocaleString(undefined, { maximumFractionDigits: 0 })} USDC`
    : "Connect Wallet";

  function onClick() {
    if (isConnected) {
      disconnect();
    } else {
      const injected = connectors.find((c) => c.id === "injected") ?? connectors[0];
      if (injected) connect({ connector: injected });
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        title={address ?? "Connect a wallet"}
        className="btn-outline text-[12.5px]"
      >
        {status === "pending" ? "Connecting…" : label}
      </button>
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center"
        style={{
          background: "var(--accent)",
          boxShadow: "0 0 14px rgba(60,224,107,0.55)",
        }}
        aria-hidden
      >
        <span className="block w-2 h-2 rounded-full bg-[var(--background)]" />
      </div>
      <button type="button" className="icon-pill" aria-label="Notifications">
        <BellIcon size={15} />
      </button>
    </div>
  );
}
