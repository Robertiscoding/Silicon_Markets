import "dotenv/config";
import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromPrivateKey } from "@circle-fin/adapter-viem-v2";
import type { SendParams } from "@circle-fin/app-kit";

/**
 * Fund any wallet with USDC on Arc Testnet using Circle's App Kit SDK.
 *
 * This is the official Circle developer path for moving stablecoins on Arc:
 * the App Kit abstracts the transfer flow (estimate -> send -> receipt) behind
 * one type-safe call, and the viem adapter signs with a local private key.
 * Docs: https://docs.arc.io/app-kit/quickstarts/send-tokens-same-chain
 *
 * Usage:
 *   FUNDER_PRIVATE_KEY=0x... npm run fund -- <recipient> [amount=1.00] [token=USDC]
 */

async function main() {
  const [recipient, amount = "1.00", token = "USDC"] = process.argv.slice(2);
  if (!recipient || !recipient.startsWith("0x")) {
    console.error("usage: npm run fund -- <recipient 0x...> [amount] [token]");
    process.exit(1);
  }
  const pk = process.env.FUNDER_PRIVATE_KEY ?? process.env.DEPLOYER_PRIVATE_KEY;
  if (!pk) {
    console.error("set FUNDER_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) in the environment");
    process.exit(1);
  }

  const kit = new AppKit();
  const adapter = createViemAdapterFromPrivateKey({ privateKey: pk });

  const params: SendParams = {
    from: { adapter, chain: "Arc_Testnet" },
    to: recipient,
    amount,
    token,
  };

  const json = (v: unknown) =>
    JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x), 2);

  console.log(`[fund] estimating ${amount} ${token} -> ${recipient} on Arc Testnet ...`);
  const estimate = await kit.estimateSend(params);
  console.log(`[fund] estimate:`, json(estimate));

  const result = await kit.send(params);
  console.log(`[fund] sent. result:`, json(result));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
