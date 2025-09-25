import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AGI Jobs One-Box",
  description: "Chat-style interface for AGI Jobs"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
