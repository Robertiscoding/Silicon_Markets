"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { label: "Markets", href: "/markets", match: ["/", "/markets"] },
  { label: "Forecasts", href: "/forecasts", match: ["/forecasts"] },
  { label: "Payouts", href: "/payouts", match: ["/payouts"] },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

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
        {NAV.map((item) => {
          const active = item.match.some((path) => path === pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                color: "black",
                fontWeight: active ? 700 : 400,
                textDecoration: active ? "underline" : "none",
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
