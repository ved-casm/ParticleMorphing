"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ArrowDown, ArrowRight, Plus, Minus, Menu, X, Check, Bot, Globe2, Sparkles, Mic } from "lucide-react";
import VideoPortal from "@/components/owow/video-portal";
import IntelligenceDemo from "@/components/owow/intelligence-demo";
import { CALENDLY, CaptureSection, ManifestoSection, PlacesSection, ProblemSection, ProcessSection } from "@/components/owow/story-sections";
import { useReducedMotion, useSceneVisibility } from "@/components/owow/use-scene";
import "./version-1.css";

const World = dynamic(() => import("@/components/ui/globe").then(m => m.World), { ssr: false, loading: () => <div className="globe-loading"><span/> Connecting the dots</div> });
const ShardField = dynamic(() => import("@/components/owow/shard-field"), {ssr:false});
const config = { particleSize: 2.2, particleColor: "#adbaac", hoverColor: "#d3e6bd", cursorRadius: 24, repelStrength: 13, globeColor: "#080d0b", showAtmosphere: true, atmosphereColor: "#72896a", atmosphereAltitude:.08, emissive: "#080d0b", emissiveIntensity: .4, shininess: .15, ambientLight: "#a7bfa9", autoRotateSpeed: .25 };
const arcs = [
  { order: 1, startLat: 37.81, startLng: -122.48, endLat: 48.86, endLng: 2.29, arcAlt: .18, color: "#adc897" },
  { order: 2, startLat: 48.86, startLng: 2.29, endLat: 27.17, endLng: 78.04, arcAlt: .14, color: "#7b9786" },
  { order: 3, startLat: 27.17, startLng: 78.04, endLat: 1.28, endLng: 103.86, arcAlt: .12, color: "#9aac80" },
  { order: 4, startLat: -33.96, startLng: 18.4, endLat: -22.95, endLng: -43.21, arcAlt: .2, color: "#adc897" },
];
const FOCUS = [
  { icon: Bot, title: "Humanoid robotics.", text: "Teleoperation and manipulation data for robots that have to work in human spaces." },
  { icon: Globe2, title: "World models.", text: "Real environments and interaction data, so models learn how the physical world actually behaves." },
  { icon: Sparkles, title: "Frontier AI models.", text: "Bespoke human data in any modality, for the capabilities scraping will never reach." },
  { icon: Mic, title: "Voice & conversational AI.", text: "In-the-wild speech from real people and real rooms, beyond what is already online." },
];

export default function Home() {
  const {ref:story,visible} = useSceneVisibility();
  const {ref:shards,visible:shardsVisible,loaded:shardsLoaded} = useSceneVisibility("120px");
  const progress = useRef(0);
  const [zoom, setZoom] = useState(0);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const reduced = useReducedMotion();
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = story.current;
      if (!el) return;
      const p = Math.max(0, Math.min(1, -el.getBoundingClientRect().top / Math.max(1, el.offsetHeight - innerHeight)));
      progress.current = reduced ? 0 : p;
      el.style.setProperty("--travel", String(p));
      el.style.setProperty("--intro", String(Math.max(0, 1 - p * 2.8)));
      el.style.setProperty("--chapter", String(Math.min(1, Math.max(0, (p - .35) * 3))));
      el.dataset.chapter = p > .42 ? "second" : "first";
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update(); addEventListener("scroll", schedule, {passive:true}); addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); removeEventListener("scroll", schedule); removeEventListener("resize", schedule); };
  }, [story,reduced]);
  useEffect(() => {
    const close = (e:KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    addEventListener("keydown",close); return () => removeEventListener("keydown",close);
  }, []);
  const navLink = (href: string, label: string) => <a href={href} onClick={() => setMenu(false)}>{label}</a>;

  return <main>
    <a className="skip-link" href="#world">Skip to content</a>
    <header className="navigation">
      <a className="wordmark v1-wordmark" href="#" aria-label="O’WOW home">O’WOW</a>
      <nav className={menu ? "nav-links open" : "nav-links"} id="main-nav" aria-label="Main navigation">
        {navLink("#problem", "The problem")}{navLink("#capture", "What we capture")}{navLink("#process", "How we work")}{navLink("#places", "Where")}
        <Link href="/" className="v1-nav-home">All versions</Link>
      </nav>
      <a className="nav-cta" href={CALENDLY} target="_blank" rel="noreferrer"><span>Talk to a founder</span><ArrowUpRight size={15}/></a>
      <button className="menu-toggle" aria-label="Toggle navigation" aria-controls="main-nav" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button>
    </header>

    <section className="globe-story" ref={story} data-chapter="first" aria-label="Data intelligence for physical AI">
      <div className="story-sticky">
        <div className="hero-copy">
          <div className="eyebrow"><span className="status-dot"/> WE TEACH ROBOTS TO TIE THE KNOT</div>
          <h1>Data intelligence<br/>for <em>physical AI.</em></h1>
          <p>Robots learn from what they’re shown. We know what’s worth showing, then capture, structure, and verify it at global scale.</p>
          <a href={CALENDLY} target="_blank" rel="noreferrer" className="button primary">Talk to a founder <ArrowUpRight size={17}/></a>
        </div>
        <div className="globe-object"><World globeConfig={{...config,autoRotate:!reduced}} data={arcs} zoom={zoom} progress={progress} active={visible}/><span className="globe-coordinate">37.8199° N / 122.4783° W</span><div className="globe-orbit-label"><i/> REAL PLACES, CAPTURED</div></div>
        <div className="globe-tools"><span>DRAG TO EXPLORE</span><button aria-label="Zoom globe out" disabled={zoom <= 0} onClick={() => setZoom(Math.max(0,zoom - 1))}><Minus size={14}/></button><button aria-label="Zoom globe in" disabled={zoom >= 2} onClick={() => setZoom(Math.min(2,zoom + 1))}><Plus size={14}/></button></div>
        <div className="chapter-copy">
          <div className="eyebrow">01 / THE WORLD IS THE DATASET</div>
          <h2>One place<br/>at a <em>time.</em></h2>
          <p>From the Golden Gate to the Taj Mahal, from Table Mountain to Marina Bay: we go where the data actually lives, and record people doing real things there.</p>
          <a className="text-link" href="#problem">Why it matters <ArrowRight size={17}/></a>
        </div>
        <div className="hero-bottom"><a href="#world"><ArrowDown size={13}/> SCROLL TO DISCOVER</a><span>SOURCE → CAPTURE → VERIFY → DELIVER</span><span>01 — 10</span></div>
        <div className="story-progress"><span/></div>
      </div>
    </section>

    <VideoPortal/>
    <ProblemSection/>
    <CaptureSection/>
    <IntelligenceDemo/>
    <ProcessSection/>

    <section className="shards-section" id="approach" ref={shards}>
      <div className="shards-background" aria-hidden="true">{shardsLoaded && <ShardField active={shardsVisible} reduced={reduced}/>}</div>
      <div className="shards-content">
        <span className="eyebrow">07 / WHO WE WORK WITH</span>
        <h2>The human data behind<br/><em>frontier AI.</em></h2>
        <p>Real-world, captured, and verified. Today we work with<br/>leading teams across every category below.</p>
        <div className="capabilities v1-focus">{FOCUS.map(({ icon: Icon, title, text }, i) => <article key={title}><span><Icon size={16} strokeWidth={1.5}/> {String(i + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{text}</p></article>)}</div>
      </div>
    </section>

    <PlacesSection/>
    <ManifestoSection/>

    <section className="closing" id="contact">
      <div className="eyebrow"><span className="status-dot"/> 10 / THE NEXT CHAPTER STARTS WITH YOU</div>
      <h2>Let’s teach robots<br/><em>to tie the knot.</em></h2>
      <a className="button primary" href={CALENDLY} target="_blank" rel="noreferrer">Talk to a founder <ArrowUpRight size={17}/></a>
      <details id="project-brief"><summary>Put together your project brief <Plus size={14}/></summary><p>Target tasks · Capture environments · Data format · Scale · Timeline</p><button className="text-link" onClick={async () => { try { await navigator.clipboard.writeText('O’WOW project brief\nTarget tasks:\nCapture environments:\nRequired data format:\nEstimated scale:\nTimeline:\nContact details:');setCopied(true);setCopyError(false); } catch {setCopyError(true);} }}>{copied ? <>Brief copied <Check size={15}/></> : <>Copy project brief <ArrowUpRight size={15}/></>}</button>{copyError && <p role="status">Copy these fields manually: target tasks, environments, data format, scale, timeline, and contact details.</p>}</details>
      <footer className="v1-footer">
        <a className="wordmark v1-wordmark" href="#">O’WOW</a>
        <p>Data intelligence for physical AI.</p>
        <nav aria-label="Footer"><a href="https://dash.owowtalents.com/" target="_blank" rel="noreferrer">Find work</a><a href="https://www.linkedin.com/company/owow-talents/" target="_blank" rel="noreferrer">LinkedIn</a><a href="https://x.com/OwowTalents" target="_blank" rel="noreferrer">X</a></nav>
        <span>© {new Date().getFullYear()} OWOW Talents Inc · Palo Alto, CA</span>
        <a href="#">Back to top <ArrowUpRight size={12}/></a>
      </footer>
    </section>
  </main>;
}
