import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter_Tight } from "next/font/google";
import "./version-3.css";

// Inter Tight: a clean, tight grotesk that reads as precise and technical at display sizes.
const display = Inter_Tight({ variable: "--font-d1-display", subsets: ["latin"], weight: ["300", "400", "500"], style: ["normal", "italic"] });
const mono = IBM_Plex_Mono({ variable: "--font-d1-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "O’WOW — Version 3 · Depth field",
  description: "Human demonstrations rendered as scroll-scrubbed depth particles.",
};

export default function Demo1Layout({ children }: LayoutProps<"/version-3">) {
  return <div className={`${display.variable} ${mono.variable}`}>{children}</div>;
}
