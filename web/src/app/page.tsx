import { MarketsView } from "@/components/markets-view";
import { configuredSettlementTs } from "@/lib/markets";
import { loadMarketSeries } from "@/lib/load-series";

export default async function Home() {
  const series = await loadMarketSeries();

  return (
    <main className="flex-1 px-5 lg:px-8 pb-8 pt-1">
      <MarketsView initialSeries={series} settlementTs={configuredSettlementTs()} />
    </main>
  );
}
