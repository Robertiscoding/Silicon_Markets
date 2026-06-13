import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Silicon Markets",
  description: "GPU compute prediction markets",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
