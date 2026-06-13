import puppeteer from "puppeteer";
import { GPU_SYMBOLS, type GpuSymbol } from "./config.js";
import { normalize, type IndexHistoryResponse, type NormalizedPrint } from "./ornn.js";
import { loadPrints, mergePrints, savePrints } from "./store.js";

/**
 * Browser-driven Ornn scraper.
 *
 * Instead of hitting the API straight from Node, this launches a real headless
 * Chromium via Puppeteer, loads the live Ornn dashboard so every request carries
 * a genuine browser origin/referer, and then pulls each GPU's index-history from
 * inside the page context. The dashboard is the same thin client the public site
 * ships, so the values we read here are exactly what Ornn renders to humans.
 */

const ORNN_API_BASE = process.env.ORNN_API_BASE ?? "https://api.ornnai.com";
const ORNN_DASHBOARD = process.env.ORNN_DASHBOARD ?? "https://dashboard.ornnai.com/";
const NAV_TIMEOUT_MS = Number(process.env.ORNN_NAV_TIMEOUT_MS ?? 60_000);

interface InPageFetchResult {
  ok: boolean;
  status: number;
  body: IndexHistoryResponse | null;
  error?: string;
}

export interface BrowserScrapeResult {
  added: number;
  total: number;
  perSymbol: Record<string, { fetched: number; latest: number | null }>;
}

export async function scrapeWithBrowser(): Promise<BrowserScrapeResult> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    );

    console.log(`[puppeteer] opening dashboard ${ORNN_DASHBOARD} ...`);
    await page.goto(ORNN_DASHBOARD, { waitUntil: "networkidle2", timeout: NAV_TIMEOUT_MS });

    const fresh: Record<GpuSymbol, NormalizedPrint[]> = {} as Record<GpuSymbol, NormalizedPrint[]>;
    const perSymbol: BrowserScrapeResult["perSymbol"] = {};

    for (const symbol of GPU_SYMBOLS) {
      const result = await page.evaluate(
        async (base: string, sym: string): Promise<InPageFetchResult> => {
          const url = `${base}/api/gpu/${encodeURIComponent(sym)}/index-history`;
          try {
            const res = await fetch(url, { headers: { Accept: "application/json" } });
            if (!res.ok) {
              return { ok: false, status: res.status, body: null, error: await res.text() };
            }
            return { ok: true, status: res.status, body: await res.json() };
          } catch (err) {
            return { ok: false, status: 0, body: null, error: String(err) };
          }
        },
        ORNN_API_BASE,
        symbol,
      );

      if (!result.ok || !result.body?.success || !Array.isArray(result.body.data)) {
        throw new Error(
          `[puppeteer] ${symbol} -> status=${result.status} ${result.error ?? "malformed response"}`,
        );
      }

      const normalized = result.body.data.map((p) => normalize(symbol, p));
      fresh[symbol] = normalized;
      const latest = normalized.at(-1) ?? null;
      perSymbol[symbol] = { fetched: normalized.length, latest: latest?.price ?? null };
      console.log(
        `[puppeteer] ${symbol.padEnd(16)} fetched=${normalized.length} latest=$${
          latest?.price ?? "n/a"
        }/hr @ ${latest?.timestamp ?? "n/a"}`,
      );
    }

    const store = await loadPrints();
    const added = mergePrints(store, fresh);
    await savePrints(store);
    const total = Object.values(store.symbols).reduce((acc, list) => acc + (list?.length ?? 0), 0);

    return { added: added.length, total, perSymbol };
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeWithBrowser()
    .then((r) => {
      console.log(`[puppeteer] done. added=${r.added} total=${r.total}`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
