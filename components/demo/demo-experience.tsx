"use client";

import Link from "next/link";
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, ArrowLeft, CornerDownRight, Pause, Play, Sparkles } from "lucide-react";
import { useReducedMotion } from "@/components/owow/use-scene";
import { SHAPES, type ShapeKey } from "./shapes";
import type { Layout, ParticleMorph } from "./particle-morph";

type Key = Exclude<ShapeKey, "text">;
type Section = { id: string; label: string; shape: Key | "play"; orbit: number; desk: Layout; mob: Layout };

const SECTIONS: Section[] = [
  { id: "top", label: "Intro", shape: "logo", orbit: 0, desk: { x: 0, y: 1.05, scale: 1 }, mob: { x: 0, y: 1.9, scale: 0.72 } },
  { id: "world", label: "World", shape: "globe", orbit: 0.35, desk: { x: 3.2, y: 0.2, scale: 1 }, mob: { x: 0, y: 2.3, scale: 0.72 } },
  { id: "data", label: "Data", shape: "helix", orbit: 0.7, desk: { x: 0, y: 1.5, scale: 0.85 }, mob: { x: 0, y: 2.2, scale: 0.62 } },
  { id: "precision", label: "Precision", shape: "cube", orbit: 1.0, desk: { x: -3.3, y: 0.1, scale: 0.95 }, mob: { x: 0, y: 2.3, scale: 0.68 } },
  { id: "people", label: "People", shape: "heart", orbit: 1.35, desk: { x: 0, y: 1.2, scale: 0.9 }, mob: { x: 0, y: 2.1, scale: 0.7 } },
  { id: "playground", label: "Playground", shape: "play", orbit: 1.35, desk: { x: 0, y: 0.75, scale: 0.68 }, mob: { x: 0, y: 1.9, scale: 0.62 } },
  { id: "services", label: "Services", shape: "knot", orbit: 1.8, desk: { x: 3.4, y: 0, scale: 0.85 }, mob: { x: 0, y: 4.4, scale: 0.42 } },
  { id: "contact", label: "Contact", shape: "galaxy", orbit: 2.3, desk: { x: 0, y: 2.3, scale: 0.82 }, mob: { x: 0, y: 3, scale: 0.7 } },
];

const SERVICES = ["Human video capture", "Task & environment design", "Action annotation", "Egocentric datasets", "Teleoperation demos", "Quality review", "Dataset curation", "Model-ready delivery"];

function Lines({ children, className }: { children: string[]; className?: string }) {
  return <span className={`dm-lines ${className ?? ""}`}>{children.map((l, i) => <span key={i} className="dm-line" style={{ ["--i" as string]: i }}><span>{l}</span></span>)}</span>;
}

export default function DemoExperience() {
  const canvasHost = useRef<HTMLDivElement>(null);
  const engine = useRef<ParticleMorph | null>(null);
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(0);
  const [active, setActive] = useState(0);
  const [play, setPlay] = useState<Key>("sphere");
  const [custom, setCustom] = useState<string | null>(null);
  const [auto, setAuto] = useState(false);
  const [word, setWord] = useState("");
  const [menu, setMenu] = useState(false);
  const state = useRef({ active: 0, play: "sphere" as Key, custom: null as string | null });

  // Boot the WebGL engine (client only; three.js never touches the server bundle).
  useEffect(() => {
    let cancelled = false;
    const host = canvasHost.current;
    if (!host) return;
    import("./particle-morph").then(({ ParticleMorph }) => {
      if (cancelled) return;
      try {
        engine.current = new ParticleMorph(host, { reduced, mobile: matchMedia("(max-width: 760px)").matches, onReady: () => !cancelled && setReady(true) });
      } catch {
        setFailed(true); setReady(true);
      }
    });
    return () => { cancelled = true; engine.current?.dispose(); engine.current = null; };
  }, [reduced]);

  // Fake-but-honest loader: counts up while the engine boots, completes when it's ready.
  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => setLoading(p => Math.min(92, p + Math.max(1, (92 - p) * 0.08))), 60);
    return () => clearInterval(id);
  }, [ready]);

  // Push the current section's shape + layout into the engine.
  const sync = () => {
    const e = engine.current, s = SECTIONS[state.current.active];
    if (!e) return;
    // Phones and portrait tablets both use the stacked layout.
    const mobile = innerWidth < 760 || innerWidth / innerHeight < 0.9;
    // Narrow phones: shrink so wide shapes (the wordmark, typed words) stay inside the screen.
    const fit = Math.min(1, Math.max(0.55, innerWidth / innerHeight / 0.8));
    e.setLayout(mobile ? { ...s.mob, scale: s.mob.scale * fit } : s.desk);
    e.setOrbit(s.orbit);
    if (s.shape !== "play") e.setShape(s.shape);
    else if (state.current.custom) e.setText(state.current.custom);
    else e.setShape(state.current.play);
  };

  // Scroll → active section, progress and reveal.
  useEffect(() => {
    let frame = 0;
    const els = SECTIONS.map(s => document.getElementById(s.id));
    const update = () => {
      frame = 0;
      const mid = innerHeight * 0.5;
      let idx = 0;
      els.forEach((el, i) => { if (el && el.getBoundingClientRect().top <= mid) idx = i; });
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      const p = scrollY / max;
      document.documentElement.style.setProperty("--dm-progress", String(p));
      if (idx !== state.current.active) { state.current.active = idx; setActive(idx); sync(); }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onResize = () => { schedule(); sync(); };
    update(); sync();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", onResize);
    const io = new IntersectionObserver(entries => entries.forEach(en => en.isIntersecting && en.target.classList.add("is-in")), { threshold: 0.18 });
    document.querySelectorAll(".dm-reveal").forEach(el => io.observe(el));
    return () => { cancelAnimationFrame(frame); removeEventListener("scroll", schedule); removeEventListener("resize", onResize); io.disconnect(); document.documentElement.style.removeProperty("--dm-progress"); };
  }, [ready]);

  // Playground choices.
  const choose = (k: Key) => { state.current.play = k; state.current.custom = null; setPlay(k); setCustom(null); sync(); };
  const submitWord = (e: FormEvent) => {
    e.preventDefault();
    const v = word.trim();
    if (!v) return;
    setAuto(false);
    state.current.custom = v; setCustom(v); sync();
  };
  const nextShape = useEffectEvent(() => {
    const i = SHAPES.findIndex(s => s.key === state.current.play);
    choose(SHAPES[(i + 1) % SHAPES.length].key);
  });
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === "Escape") setMenu(false);
    if (state.current.active !== 5 || (e.target as HTMLElement)?.tagName === "INPUT") return;
    const n = Number(e.key);
    if (n >= 1 && n <= SHAPES.length) choose(SHAPES[n - 1].key);
  });
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(nextShape, 3200);
    return () => clearInterval(id);
  }, [auto]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => onKey(e);
    addEventListener("keydown", handler);
    return () => removeEventListener("keydown", handler);
  }, []);

  const burst = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("a,button,input,label,form")) return;
    engine.current?.explode();
  };

  return <div className="dm-root" data-ready={ready} onPointerDown={burst}>
    <div className="dm-canvas" ref={canvasHost} aria-hidden="true" />
    {failed && <div className="dm-fallback" aria-hidden="true" />}

    <div className={`dm-loader ${ready ? "is-done" : ""}`} aria-hidden={ready}>
      <div className="dm-loader-mark">owow<span>demo</span></div>
      <p>HUMAN DEMONSTRATIONS FOR<br />THE ROBOTS OF TOMORROW</p>
      <div className="dm-loader-bar"><span style={{ transform: `scaleX(${ready ? 1 : loading / 100})` }} /></div>
      <div className="dm-loader-meta"><span>WAKING THE PARTICLES..</span><b>{String(Math.round(ready ? 100 : loading)).padStart(3, "0")}%</b><span>100%</span></div>
    </div>

    <header className="dm-nav">
      <Link href="/" className="dm-back"><ArrowLeft size={14} /> <span>All versions</span></Link>
      <a href="#top" className="dm-mark" aria-label="Back to top">owow<i /></a>
      <nav className={`dm-links ${menu ? "open" : ""}`} aria-label="Demo sections">
        {SECTIONS.filter(s => ["world", "precision", "playground", "contact"].includes(s.id)).map(s =>
          <a key={s.id} href={`#${s.id}`} onClick={() => setMenu(false)} className={SECTIONS[active].id === s.id ? "is-active" : ""}>{s.label}</a>)}
        <Link href="/" className="dm-links-home">All versions</Link>
      </nav>
      <a href="#contact" className="dm-cta"><span>Let&apos;s build</span><ArrowUpRight size={14} /></a>
      <button className="dm-menu" aria-expanded={menu} aria-label="Toggle sections" onClick={() => setMenu(!menu)}><span /><span /></button>
    </header>

    <aside className="dm-rail" aria-hidden="true">
      <span className="dm-rail-num">{String(active + 1).padStart(2, "0")}</span>
      <span className="dm-rail-track"><i /></span>
      <span className="dm-rail-num dim">{String(SECTIONS.length).padStart(2, "0")}</span>
      <span className="dm-rail-label">{SECTIONS[active].label}</span>
    </aside>

    <main className="dm-main">
      <section id="top" className="dm-sec is-pinned dm-hero">
        <div className="dm-pin">
        <p className="dm-mono dm-hero-kicker dm-reveal">HUMAN DEMONSTRATIONS FOR<br />THE ROBOTS OF TOMORROW</p>
        <h1 className="dm-display dm-reveal">
          <em className="dm-hero-where">Where</em>
          <Lines className="dm-hero-lines">{["HUMAN EXPERIENCE", "BECOMES MACHINE", "INTELLIGENCE"]}</Lines>
        </h1>
        <a href="#world" className="dm-scroll dm-mono"><span />SCROLL TO MORPH</a>
        </div>
      </section>

      <section id="world" className="dm-sec is-pinned dm-left">
        <div className="dm-pin">
        <div className="dm-block dm-reveal">
          <span className="dm-tag">Approach</span>
          <h2 className="dm-display"><Lines>{["WE CAPTURE"]}</Lines><span className="dm-indent"><CornerDownRight size={28} /> <Lines>{["MORE THAN"]}</Lines></span><Lines>{["MOVEMENT"]}</Lines></h2>
          <p className="dm-mono">A HAND REACHING. A SHIRT FOLDING. A BOX FINDING ITS PLACE. WE RECORD THE WORLD THE WAY ROBOTS NEED TO SEE IT.</p>
        </div>
        </div>
      </section>

      <section id="data" className="dm-sec is-pinned dm-bottom">
        <div className="dm-pin">
        <div className="dm-block dm-split dm-reveal">
          <div>
            <span className="dm-tag">Data</span>
            <h2 className="dm-display"><Lines>{["EXPERIENCE"]}</Lines><span className="dm-indent"><CornerDownRight size={28} /> <Lines>{["AS DATA"]}</Lines></span></h2>
          </div>
          <p className="dm-mono">EVERY DEMONSTRATION IS A STRAND OF CONTEXT: OBJECTS, INTENT AND VARIATION, WOVEN INTO SOMETHING A MODEL CAN LEARN FROM.</p>
        </div>
        </div>
      </section>

      <section id="precision" className="dm-sec is-pinned dm-right">
        <div className="dm-pin">
        <div className="dm-block dm-reveal">
          <span className="dm-tag">Precision</span>
          <h2 className="dm-display"><Lines>{["PRECISION"]}</Lines><em className="dm-script">With</em><Lines>{["A PURPOSE"]}</Lines></h2>
          <p className="dm-mono">EVERY FRAME HAS A REASON. REVIEWED, LABELLED AND SHAPED AROUND THE TASKS YOUR ROBOTS WILL ACTUALLY FACE.</p>
        </div>
        </div>
      </section>

      <section id="people" className="dm-sec is-pinned dm-bottom">
        <div className="dm-pin">
        <div className="dm-block dm-people dm-reveal">
          <div><span className="dm-tag">Our people</span><p className="dm-mono">OUR BEST DATA ALWAYS COMES<br />BACK TO ONE THING</p></div>
          <h2 className="dm-display"><em className="dm-script">We</em><Lines>{["BUILD WITH", "PEOPLE WHO CARE", "HOW MACHINES LEARN"]}</Lines></h2>
        </div>
        </div>
      </section>

      <section id="playground" className="dm-sec is-pinned dm-play">
        <div className="dm-pin">
        <div className="dm-play-head dm-reveal">
          <span className="dm-tag"><Sparkles size={11} /> Playground</span>
          <h2 className="dm-display"><Lines>{["PLAY WITH THE"]}</Lines><em className="dm-script">particles</em></h2>
        </div>
        <div className="dm-play-panel dm-reveal">
          <div className="dm-chips" role="group" aria-label="Choose a shape">
            {SHAPES.map((s, i) => <button key={s.key} className={!custom && play === s.key ? "is-on" : ""} aria-pressed={!custom && play === s.key} onClick={() => { setAuto(false); choose(s.key); }}><small>{String(i + 1).padStart(2, "0")}</small>{s.label}</button>)}
          </div>
          <form className="dm-word" onSubmit={submitWord}>
            <label htmlFor="dm-word" className="dm-mono">TYPE A WORD</label>
            <input id="dm-word" value={word} maxLength={12} placeholder="robots" onChange={e => setWord(e.target.value)} autoComplete="off" />
            <button type="submit" disabled={!word.trim()}>Morph <ArrowUpRight size={13} /></button>
          </form>
          <div className="dm-play-foot dm-mono">
            <button onClick={() => setAuto(!auto)} aria-pressed={auto}>{auto ? <Pause size={12} /> : <Play size={12} />} {auto ? "STOP AUTO MORPH" : "AUTO MORPH"}</button>
            <span>{custom ? `NOW: “${custom.toUpperCase()}”` : "MOVE THROUGH IT · CLICK TO BURST · KEYS 1–9"}</span>
          </div>
        </div>
        </div>
      </section>

      <section id="services" className="dm-sec dm-left dm-tall">
        <div className="dm-block dm-reveal">
          <span className="dm-tag">What we do</span>
          <h2 className="dm-display dm-small"><CornerDownRight size={26} /> <Lines>{["FROM A SINGLE MOTION", "TO A MODEL-READY", "DATASET"]}</Lines></h2>
          <ol className="dm-services">{SERVICES.map((s, i) => <li key={s}><span className="dm-mono">({String(i + 1).padStart(3, "0")})</span>{s}</li>)}</ol>
        </div>
      </section>

      <section id="contact" className="dm-sec dm-contact">
        <div className="dm-block dm-reveal">
          <span className="dm-tag">Stay in touch</span>
          <h2 className="dm-display dm-center"><Lines>{["LET’S BUILD"]}</Lines><span className="dm-indent"><CornerDownRight size={28} /> <Lines>{["SOMETHING"]}</Lines></span><Lines>{["HUMAN"]}</Lines></h2>
          <p className="dm-mono">HAVE A TASK, A ROBOT OR A VISION? LET’S GIVE IT THE EXPERIENCE IT NEEDS.</p>
          <Link href="/version-1#contact" className="dm-button">Start a project <ArrowUpRight size={15} /></Link>
        </div>
        <footer className="dm-footer dm-mono">
          <span>© {new Date().getFullYear()} OWOW — PARTICLE DEMO</span>
          <span>THREE.JS · GPGPU · {SHAPES.length} SHAPES</span>
          <a href="#top">BACK TO TOP ↑</a>
        </footer>
      </section>
    </main>
    <div className="dm-progress" aria-hidden="true" />
  </div>;
}
