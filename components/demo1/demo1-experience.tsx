"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ArrowLeft } from "lucide-react";
import { useReducedMotion } from "@/components/owow/use-scene";
import { TRANSITION, type DepthField, type DepthScene, type SceneState } from "./depth-field";

// The story: a human does it, we capture it, a machine learns it, and meets us halfway.
const SCENES: (DepthScene & { line: string; label: string })[] = [
  { key: "tie", src: "/demo1/depth/tie.mp4", duration: 8, wide: true, label: "Imitation", line: "Every skill a robot will ever have, a human did first." },
  { key: "folding", src: "/demo1/depth/folding.mp4", duration: 6, label: "Everyday", line: "A shirt folding. A thousand small decisions, made without a thought." },
  { key: "place", src: "/demo1/depth/place.mp4", duration: 6, label: "Context", line: "A box finding its place. The physical world is full of lessons." },
  { key: "capture", src: "/demo1/depth/capture.mp4", duration: 6, label: "Capture", line: "We record every reach, grip and hesitation, exactly as it happens." },
  { key: "watch", src: "/demo1/depth/watch.mp4", duration: 6, wide: true, label: "Learning", line: "Then a machine watches, and begins to understand." },
  { key: "touch", src: "/demo1/depth/touch.mp4", duration: 6, wide: true, label: "Contact", line: "Until it can meet us halfway." },
  { key: "android", src: "/demo1/depth/android.mp4", duration: 5, label: "Intelligence", line: "Intelligence, built from human experience." },
];
const UNIT_VH = 175;
const TOTAL_UNITS = SCENES.length + (SCENES.length - 1) * TRANSITION;

/** Letters fade in with `--reveal` (0..1), a soft 4% band sweeping across the line. */
function RevealLine({ text }: { text: string }) {
  const chars = Array.from(text), n = chars.length, band = Math.max(5, Math.round(n * 0.04)) / n;
  return <>{chars.map((c, i) => <span key={i} style={{ opacity: `calc(0.14 + 0.86 * clamp(0, (var(--reveal, 0) - ${(i / n) * (1 - band)}) / ${band}, 1))` }}>{c}</span>)}</>;
}

export default function Demo1Experience() {
  const section = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const caption = useRef<HTMLDivElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const engine = useRef<DepthField | null>(null);
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [scene, setScene] = useState(0);
  const sceneRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const el = host.current;
    if (!el) return;
    const onState = (s: SceneState) => {
      const cap = caption.current;
      if (!cap) return;
      // Text is fully revealed by 70% of a scene, then fades out through the transition.
      if (s.phase === "play") {
        if (s.index !== sceneRef.current) { sceneRef.current = s.index; setScene(s.index); }
        cap.style.setProperty("--reveal", String(Math.min(1, s.local / 0.7)));
        cap.style.opacity = String(Math.min(1, s.local / 0.08));
      } else {
        cap.style.opacity = String(Math.max(0, 1 - s.local / 0.4));
      }
    };
    import("./depth-field").then(({ DepthField }) => {
      if (cancelled) return;
      try {
        engine.current = new DepthField(el, SCENES, { mobile: matchMedia("(max-width: 760px)").matches, reduced, onState, onReady: () => !cancelled && setReady(true) });
      } catch { setFailed(true); }
    });
    return () => { cancelled = true; engine.current?.dispose(); engine.current = null; };
  }, [reduced]);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = section.current;
      if (!el) return;
      const r = el.getBoundingClientRect(), total = Math.max(1, el.offsetHeight - innerHeight);
      const p = Math.min(1, Math.max(0, -r.top / total));
      // The first 4% of the scroll belongs to the hero title.
      const heroT = Math.min(1, p / 0.04);
      if (hero.current) { hero.current.style.opacity = String(1 - heroT); hero.current.style.transform = `translateY(${-heroT * 30}px)`; }
      engine.current?.setProgress(Math.max(0, (p - 0.02) / 0.98));
      document.documentElement.style.setProperty("--d1-progress", String(p));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); removeEventListener("scroll", schedule); removeEventListener("resize", schedule); document.documentElement.style.removeProperty("--d1-progress"); };
  }, []);

  const current = SCENES[scene];

  return <div className="d1-root" data-ready={ready}>
    <header className="d1-nav">
      <Link href="/" className="d1-mark">O’WOW<i /></Link>
      <nav>
        <Link href="/"><ArrowLeft size={12} /> All versions</Link>
        <a href="#d1-close">Contact</a>
      </nav>
    </header>

    <section ref={section} className="d1-story" style={{ height: `${Math.round(TOTAL_UNITS * UNIT_VH)}vh` }} aria-label="Human demonstrations, rendered as depth particles">
      <div className="d1-sticky">
        <div className="d1-canvas" ref={host} aria-hidden="true" />
        {failed && <div className="d1-fallback" style={{ backgroundImage: "url(/demo1/poster/tie.avif)" }} aria-hidden="true" />}
        {!ready && !failed && <div className="d1-loading" role="status" aria-label="Loading visualisation"><span /><span /><span /></div>}

        <div className="d1-hero" ref={hero}>
          <span className="d1-tag">Physical AI · Human demonstrations</span>
          <h1>Robots don&apos;t learn from code.<br /><em>They learn from us.</em></h1>
          <p>OWOW records real people doing real work, then turns every movement into data that teaches machines to act in the physical world.</p>
          <span className="d1-hint">Scroll to scrub through the data</span>
        </div>

        <div className="d1-caption" ref={caption} style={{ opacity: 0 }}>
          <span className="d1-count">{String(scene + 1).padStart(2, "0")} / {String(SCENES.length).padStart(2, "0")} · {current.label}</span>
          <p key={current.key}><RevealLine text={current.line} /></p>
        </div>

        <ol className="d1-steps" aria-hidden="true">
          {SCENES.map((s, i) => <li key={s.key} className={i === scene ? "on" : i < scene ? "done" : ""}><span>{s.label}</span></li>)}
        </ol>
        <div className="d1-bar" aria-hidden="true" />
      </div>
    </section>

    <section className="d1-close" id="d1-close">
      <span className="d1-tag">The data layer for physical AI</span>
      <h2>Human experience, <em>captured for machines.</em></h2>
      <p>Egocentric and third-person video, depth, motion and task annotations, collected with the care your models deserve. Every frame you just scrolled through started as a person doing something real.</p>
      <a href="https://calendly.com/useowow/ds?back=1" target="_blank" rel="noreferrer" className="d1-button">Talk to a founder <ArrowUpRight size={15} /></a>
      <footer>
        <span>© {new Date().getFullYear()} OWOW Talents Inc · Palo Alto, CA</span>
        <span>Footage: OWOW &amp; Pexels contributors · Depth: Depth Anything V2</span>
      </footer>
    </section>
  </div>;
}
