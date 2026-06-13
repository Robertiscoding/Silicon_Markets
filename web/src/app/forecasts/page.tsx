import { ForecastsConsensus } from "@/components/forecasts-consensus";
import { configuredSettlementTs, GPU_SYMBOLS, type GpuSymbol } from "@/lib/markets";
import { loadMarketSeries } from "@/lib/load-series";

export const metadata = {
  title: "Forecasts · Consensus",
  description:
    "Where the market thinks each GPU's 4 PM ET print will settle — consensus views seeded from the live Ornn index on Silicon Markets.",
};

export default async function ForecastsPage() {
  const allSeries = await loadMarketSeries();
  const settlementTs = configuredSettlementTs();
  const series = Object.fromEntries(
    GPU_SYMBOLS.map((s) => [s, (allSeries[s] ?? []).slice(-60)]),
  ) as Record<GpuSymbol, { ts: number; price: number }[]>;

  return (
    <main className="flex-1 px-5 lg:px-8 pb-8 pt-2">
      <ForecastsConsensus series={series} settlementTs={settlementTs} />
    </main>
  );
}
