import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import "./version-2.css";

const display = Instrument_Serif({ variable: "--font-dm-display", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const mono = IBM_Plex_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "O’WOW — Version 2 · Particle morph",
  description: "An interactive GPGPU particle-morphing playground: wordmark, globe, helix, cube, heart and more.",
};

export default function DemoLayout({ children }: LayoutProps<"/version-2">) {
  return <div className={`${display.variable} ${mono.variable}`}>{children}</div>;
}
