import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist_Mono, Instrument_Sans } from "next/font/google";
import { HeaderShell, SiteHeader } from "@/components/site-header";
import "./globals.css";

// The demo deck's typeface, used across the site.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Twin Date",
  description: "AI twins that screen first dates for you",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* The header reads the session, so it streams in behind a static shell. */}
        <Suspense fallback={<HeaderShell />}>
          <SiteHeader />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
