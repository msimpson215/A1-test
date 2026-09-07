import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AXON AI Shopper — Dierbergs private concept",
  description: "Private proof of concept. Dierbergs remains Dierbergs."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
