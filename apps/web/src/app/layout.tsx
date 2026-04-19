import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chicago Transit Tracker",
  description: "Real-time CTA bus and train arrivals",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
