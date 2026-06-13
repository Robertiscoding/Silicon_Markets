import Link from "next/link";

const NAV = [
  { label: "Markets", href: "/markets" },
  { label: "Forecasts", href: "/forecasts" },
  { label: "Payouts", href: "/payouts" },
] as const;

export function SiteHeader() {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 24px",
        borderBottom: "1px solid black",
      }}
    >
      <Link href="/" style={{ color: "black", textDecoration: "none", fontWeight: 700 }}>
        SILICON MARKETS
      </Link>
      <nav style={{ display: "flex", gap: 16 }}>
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} style={{ color: "black" }}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
