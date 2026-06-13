import { strict as assert } from "node:assert";
import test from "node:test";
import type { GpuSymbol } from "../src/config.js";
import { mergePrints, type PrintsStore } from "../src/store.js";

test("mergePrints adds new entries and ignores duplicates", () => {
  const store: PrintsStore = { updatedAt: new Date(0).toISOString(), symbols: {} };
  const sym: GpuSymbol = "RTX 5090";

  const added1 = mergePrints(store, {
    "H100 SXM": [],
    H200: [],
    B200: [],
    "A100 SXM4": [],
    "RTX 5090": [
      {
        symbol: sym,
        dayKey: 1_700_000_000,
        timestamp: "2026-05-01T20:00:00.000Z",
        price: 0.8,
        priceScaled: "80000000",
      },
    ],
    "RTX PRO 6000 WS": [],
  });
  assert.equal(added1.length, 1);
  assert.equal(store.symbols[sym]?.length, 1);

  const added2 = mergePrints(store, {
    "H100 SXM": [],
    H200: [],
    B200: [],
    "A100 SXM4": [],
    "RTX 5090": [
      {
        symbol: sym,
        dayKey: 1_700_000_000,
        timestamp: "2026-05-01T20:00:00.000Z",
        price: 0.8,
        priceScaled: "80000000",
      },
      {
        symbol: sym,
        dayKey: 1_700_086_400,
        timestamp: "2026-05-02T20:00:00.000Z",
        price: 0.82,
        priceScaled: "82000000",
      },
    ],
    "RTX PRO 6000 WS": [],
  });
  assert.equal(added2.length, 1);
  assert.equal(store.symbols[sym]?.length, 2);
});
