import { MarketsView } from "@/components/markets-view";
import { configuredSettlementTs } from "@/lib/markets";
import { seedAllSeries } from "@/lib/seed-history";

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <MarketsView initialSeries={seedAllSeries()} settlementTs={configuredSettlementTs()} />
    </main>
  );
}
