import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import "./demo.css";

const display = Instrument_Serif({ variable: "--font-dm-display", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });
const mono = IBM_Plex_Mono({ variable: "--font-dm-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "OWOW — Particle demo",
  description: "An interactive GPGPU particle-morphing playground: wordmark, globe, helix, cube, heart and more.",
};

export default function DemoLayout({ children }: LayoutProps<"/demo">) {
  return <div className={`${display.variable} ${mono.variable}`}>{children}</div>;
}
