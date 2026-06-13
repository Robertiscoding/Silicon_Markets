import { MarketsView } from "@/components/markets-view";
import { seedAllSeries } from "@/lib/seed-history";

export default function MarketsPage() {
  const series = seedAllSeries();

  return (
    <main style={{ padding: 24 }}>
      <MarketsView initialSeries={series} />
    </main>
  );
}
