"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import PixelPreview, { type Variant } from "./pixel-preview";

const VERSIONS: { n: string; href: string; variant: Variant; title: string; text: string; tags: string[] }[] = [
  { n: "01", href: "/version-1", variant: "morph", title: "Particle Morph", text: "Thousands of particles morph between shapes above a night lake, with grass, rocks and a glowing tree.", tags: ["GPGPU", "3D world", "Playground"] },
  { n: "02", href: "/version-2", variant: "depth", title: "Depth Field", text: "Real human demonstrations rendered as depth particles. Scroll scrubs the footage frame by frame.", tags: ["Depth video", "Stippling", "Story"] },
];

function Card({ v }: { v: (typeof VERSIONS)[number] }) {
  const [active, setActive] = useState(false);
  const ref = useRef<HTMLAnchorElement>(null);
  // Touch screens have no hover: resolve whichever card sits in the middle of the screen.
  useEffect(() => {
    const el = ref.current;
    if (!el || !matchMedia("(hover: none)").matches) return;
    const io = new IntersectionObserver(([e]) => setActive(e.isIntersecting), { rootMargin: "-35% 0px -35% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <Link ref={ref} href={v.href} className="vh-card" data-active={active}
    onPointerEnter={() => setActive(true)} onPointerLeave={() => setActive(false)} onFocus={() => setActive(true)} onBlur={() => setActive(false)}>
    <div className="vh-screen">
      <PixelPreview variant={v.variant} active={active} />
      <span className="vh-corner tl" /><span className="vh-corner tr" /><span className="vh-corner bl" /><span className="vh-corner br" />
      <span className="vh-badge">V{v.n.slice(1)}</span>
    </div>
    <div className="vh-meta"><span>Version {v.n}</span><ArrowUpRight size={16} /></div>
    <h2>{v.title}</h2>
    <p>{v.text}</p>
    <ul>{v.tags.map(t => <li key={t}>{t}</li>)}</ul>
  </Link>;
}

export default function VersionsHub() {
  return <main className="vh-root">
    <header className="vh-head">
      <span className="vh-mark">O’WOW<i /></span>
      <span className="vh-mono">Two directions · {new Date().getFullYear()}</span>
    </header>
    <section className="vh-intro">
      <span className="vh-mono">Human experience · Robot intelligence</span>
      <h1>One story.<br /><span>Two directions.</span></h1>
      <p>Pick a version to explore. Each one tells the O’WOW story in its own visual language.</p>
    </section>
    <section className="vh-grid" aria-label="Website versions">
      {VERSIONS.map(v => <Card key={v.n} v={v} />)}
    </section>
    <footer className="vh-foot vh-mono"><span>© {new Date().getFullYear()} OWOW</span><span>Hover a card to resolve it</span></footer>
  </main>;
}
