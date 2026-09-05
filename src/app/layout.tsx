import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DealFlow360",
    template: "%s — DealFlow360",
  },
  description:
    "A self-governing sales operations platform: discount governance, automated approval routing, multi-warehouse fulfilment and hybrid billing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // Light-only by design; see globals.css for the reasoning.
      data-theme="light"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
