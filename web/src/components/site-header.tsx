"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { WalletButton } from "./wallet-button";

const NAV = [
  { id: "markets" as const, label: "Markets", href: "/", match: ["/", "/markets"] },
  { id: "forecasts" as const, label: "Forecasts", href: "/forecasts", match: ["/forecasts"] },
  { id: "payouts" as const, label: "Payouts", href: "/payouts", match: ["/payouts"] },
];

function activeNav(pathname: string): "markets" | "forecasts" | "payouts" {
  if (pathname.startsWith("/forecasts")) return "forecasts";
  if (pathname.startsWith("/payouts")) return "payouts";
  return "markets";
}

export function SiteHeader() {
  const pathname = usePathname();
  const active = activeNav(pathname);

  return (
    <header className="px-5 lg:px-8 py-3.5 flex items-center justify-between gap-6 relative">
      <Link href="/" className="flex items-center gap-2.5">
        <Logo size={28} />
        <span className="font-display text-[14px] tracking-[0.22em] text-foreground">
          SILICON MARKETS
        </span>
      </Link>
      <nav
        className="glass-panel hidden md:flex items-center gap-1 text-[13px] absolute left-1/2 -translate-x-1/2 px-1.5 py-1.5 z-10"
        style={{ borderRadius: 999 }}
      >
        {NAV.map((n) => {
          const isActive = n.id === active;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`px-4 py-1.5 rounded-full transition-colors ${
                isActive
                  ? "text-accent bg-[var(--accent-soft)] border border-[rgba(60,224,107,0.35)] shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
                  : "border border-transparent text-muted-strong hover:text-accent"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-3">
        <WalletButton />
      </div>
    </header>
  );
}
