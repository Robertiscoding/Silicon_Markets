import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import localFont from "next/font/local";
import { SiteHeader } from "@/components/site-header";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetMono = JetBrains_Mono({
  variable: "--font-jet-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

const ttOctosquares = localFont({
  src: [
    {
      path: "../../TT-Octosquares-Trial-1-000/TT Octosquares Trial Black Italic.ttf",
      weight: "900",
      style: "italic",
    },
  ],
  variable: "--font-tt-octosquares",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Silicon Markets — forecast GPU prices on Arc",
  description:
    "Stake USDC on tomorrow's Ornn Compute Price Index print. Built on Arc, settled in USDC, powered by Ornn.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetMono.variable} ${ttOctosquares.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <SiteHeader />
          {children}
        </Providers>
      </body>
    </html>
  );
}
