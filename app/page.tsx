import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter_Tight, Silkscreen } from "next/font/google";
import VersionsHub from "@/components/versions/versions-hub";
import "./versions.css";

const display = Inter_Tight({ variable: "--font-vh-display", subsets: ["latin"], weight: ["300", "400", "500"] });
const mono = IBM_Plex_Mono({ variable: "--font-vh-mono", subsets: ["latin"], weight: ["400", "500"] });
const pixel = Silkscreen({ variable: "--font-vh-pixel", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "OWOW — Three versions",
  description: "Three directions for the OWOW website: The World, Particle Morph and Depth Field.",
};

export default function Home() {
  return <div className={`${display.variable} ${mono.variable} ${pixel.variable}`}><VersionsHub /></div>;
}
