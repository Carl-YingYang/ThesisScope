import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ThesisScope — suriin ang thesis idea mo",
  description:
    "Ilagay ang thesis idea mo, kunin agad ang pros, cons, feasibility score, risks, at mga posibleng tanong ng panel. Libre, walang account, walang sine-save.",
  icons: {
    icon:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect x='4' y='4' width='56' height='56' fill='%233B4BFF' stroke='%23111111' stroke-width='6'/%3E%3Ctext x='32' y='45' font-family='Arial,sans-serif' font-size='34' font-weight='bold' fill='%23ffffff' text-anchor='middle'%3ET%3C/text%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} antialiased`}>{children}</body>
    </html>
  );
}
