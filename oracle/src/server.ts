import "dotenv/config";
import { createServer } from "node:http";
import { GPU_SYMBOLS, type GpuSymbol } from "./config.js";
import { loadPrints } from "./store.js";

/**
 * Tiny HTTP server that surfaces the locally-archived Ornn history to the
 * Next.js frontend. The frontend hits /api/history?symbol=RTX%205090 to
 * render the price chart in the mockup.
 */

const PORT = Number(process.env.HISTORY_PORT ?? 4321);

const server = createServer(async (req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("content-type", "application/json");
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    if (url.pathname === "/api/health") {
      res.end(JSON.stringify({ ok: true, symbols: GPU_SYMBOLS }));
      return;
    }
    if (url.pathname === "/api/history") {
      const store = await loadPrints();
      const symbolParam = url.searchParams.get("symbol");
      if (symbolParam) {
        if (!GPU_SYMBOLS.includes(symbolParam as GpuSymbol)) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: "Unknown symbol" }));
          return;
        }
        const list = store.symbols[symbolParam as GpuSymbol] ?? [];
        res.end(JSON.stringify({ symbol: symbolParam, prints: list, updatedAt: store.updatedAt }));
        return;
      }
      res.end(JSON.stringify(store));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, () => {
  console.log(`[history] serving on http://localhost:${PORT}`);
});
