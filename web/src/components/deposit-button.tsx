"use client";

import { useState } from "react";
import { BridgeModal } from "./bridge-modal";

/** Header entry point for the CCTP bridge-in flow. */
export function DepositButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Bridge USDC into Arc from another chain (Circle CCTP V2)"
        className="btn-outline text-[12.5px]"
      >
        Deposit
      </button>
      <BridgeModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
