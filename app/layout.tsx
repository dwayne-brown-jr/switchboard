import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// One family for everything. Headlines used to run Bricolage Grotesque, which
// read expressive-editorial rather than technical, and cost a second font file
// on every page load for a buyer who is often on a phone with poor signal.
//
// Geist is variable, so .font-display gets weight 800 from the same file the
// body already loads. Hierarchy comes from weight and size — plus the gradient
// treatment and accent colour the headlines already carry — rather than from
// mixing typefaces, which is how most modern product sites handle it.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Switchboard — Never miss another call",
  description:
    "A friendly AI receptionist for your shop. It answers every call, books jobs on your calendar, and texts you the emergencies — set up in minutes.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
