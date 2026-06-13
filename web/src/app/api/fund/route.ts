import { NextResponse } from "next/server";
import { isAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { AppKit, type SendParams } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tops up a trader wallet with test USDC on Arc via Circle's App Kit Send
 * (https://docs.arc.io/app-kit) — the same official path as oracle/src/fund.ts,
 * surfaced in the product so a connected wallet can self-fund during the demo.
 */

const FUND_AMOUNT = "1.00";
// One drip per wallet per cooldown window — this is real faucet money shared
// with the gas balance, so don't let a stuck button drain it.
const COOLDOWN_MS = 10 * 60 * 1000;
const lastDrip = new Map<string, number>();

export async function POST(req: Request) {
  try {
    const { address } = (await req.json().catch(() => ({}))) as { address?: string };
    if (!address || !isAddress(address)) {
      return NextResponse.json({ error: "invalid address" }, { status: 400 });
    }

    const key = (process.env.FUNDER_PRIVATE_KEY ?? process.env.DEMO_PRIVATE_KEY) as
      | Hex
      | undefined;
    if (!key) {
      return NextResponse.json({ error: "FUNDER_PRIVATE_KEY not configured" }, { status: 500 });
    }

    // App Kit (correctly) refuses self-sends — give a clear message instead
    // of its cryptic "Invalid address" when the connected wallet IS the funder.
    const funder = privateKeyToAccount(key).address;
    if (funder.toLowerCase() === address.toLowerCase()) {
      return NextResponse.json(
        { error: "this wallet is the funder account — connect a different wallet to top up" },
        { status: 400 },
      );
    }

    const wallet = address.toLowerCase();
    const last = lastDrip.get(wallet) ?? 0;
    if (Date.now() - last < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 60_000);
      return NextResponse.json(
        { error: `already funded — try again in ~${wait}m` },
        { status: 429 },
      );
    }

    const kit = new AppKit();
    const adapter = createViemAdapterFromPrivateKey({ privateKey: key });
    const params: SendParams = {
      from: { adapter, chain: "Arc_Testnet" },
      to: address,
      amount: FUND_AMOUNT,
      token: "USDC",
    };

    const result = await kit.send(params);
    lastDrip.set(wallet, Date.now());

    return NextResponse.json({
      amount: FUND_AMOUNT,
      state: result.state,
      txHash: (result as { txHash?: string }).txHash ?? null,
      explorerUrl: (result as { explorerUrl?: string }).explorerUrl ?? null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg.slice(0, 200) }, { status: 500 });
  }
}
