import { GPU_SYMBOLS } from "@/lib/markets";

export default function MarketsPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Markets</h1>
      <ul style={{ listStyle: "none", padding: 0, margin: "16px 0" }}>
        {GPU_SYMBOLS.map((symbol) => (
          <li
            key={symbol}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 0",
              borderBottom: "1px solid black",
            }}
          >
            <span>{symbol}</span>
            <span>$0.00/hr</span>
          </li>
        ))}
      </ul>
      <p>chart goes here</p>
    </main>
  );
}
