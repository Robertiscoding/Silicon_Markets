import { MarketsView } from "@/components/markets-view";
import { seedAllSeries } from "@/lib/seed-history";

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <MarketsView initialSeries={seedAllSeries()} />
    </main>
  );
}
