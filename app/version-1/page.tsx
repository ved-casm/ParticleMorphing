"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, ArrowDown, ArrowRight, Plus, Minus, Menu, X, Check } from "lucide-react";
import VideoPortal from "@/components/owow/video-portal";
import IntelligenceDemo from "@/components/owow/intelligence-demo";
import { useReducedMotion, useSceneVisibility } from "@/components/owow/use-scene";

const World = dynamic(() => import("@/components/ui/globe").then(m => m.World), { ssr: false, loading: () => <div className="globe-loading"><span/> Connecting the dots</div> });
const ShardField = dynamic(() => import("@/components/owow/shard-field"), {ssr:false});
const config = { particleSize: 2.2, particleColor: "#adbaac", hoverColor: "#d3e6bd", cursorRadius: 24, repelStrength: 13, globeColor: "#080d0b", showAtmosphere: true, atmosphereColor: "#72896a", atmosphereAltitude:.08, emissive: "#080d0b", emissiveIntensity: .4, shininess: .15, ambientLight: "#a7bfa9", autoRotateSpeed: .25 };
const arcs = [
  { order: 1, startLat: 28.61, startLng: 77.2, endLat: 51.5, endLng: -.12, arcAlt: .14, color: "#adc897" },
  { order: 2, startLat: 51.5, startLng: -.12, endLat: 40.71, endLng: -74, arcAlt: .18, color: "#7b9786" },
  { order: 3, startLat: 1.35, startLng: 103.8, endLat: 28.61, endLng: 77.2, arcAlt: .12, color: "#9aac80" },
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
  return <main>
    <a className="skip-link" href="#world">Skip to content</a>
    <header className="navigation"><a className="wordmark" href="#" aria-label="OWOW home">owow<span>®</span></a><nav className={menu ? "nav-links open" : "nav-links"} id="main-nav" aria-label="Main navigation"><a href="#world" onClick={() => setMenu(false)}>The world we see</a><a href="#intelligence" onClick={() => setMenu(false)}>Our intelligence</a><a href="#approach" onClick={() => setMenu(false)}>Our approach</a></nav><a className="nav-cta" href="#contact"><span>Let’s build together</span><ArrowUpRight size={15}/></a><button className="menu-toggle" aria-label="Toggle navigation" aria-controls="main-nav" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button></header>
    <section className="globe-story" ref={story} data-chapter="first" aria-label="Human experience to robot intelligence">
      <div className="story-sticky">
        <div className="hero-copy"><div className="eyebrow"><span className="status-dot"/> THE HUMAN SIDE OF PHYSICAL AI</div><h1>A world of<br/>experience.<br/><em>A new intelligence.</em></h1><p>Extraordinary robots start with ordinary human moments. We turn real-world actions into the data that teaches AI.</p><a href="#contact" className="button primary">Build with our data <ArrowUpRight size={17}/></a></div>
        <div className="globe-object"><World globeConfig={{...config,autoRotate:!reduced}} data={arcs} zoom={zoom} progress={progress} active={visible}/><span className="globe-coordinate">28.6139° N / 77.2090° E</span><div className="globe-orbit-label"><i/> HUMAN EXPERIENCE, CONNECTED</div></div>
        <div className="globe-tools"><span>DRAG TO EXPLORE</span><button aria-label="Zoom globe out" disabled={zoom <= 0} onClick={() => setZoom(Math.max(0,zoom - 1))}><Minus size={14}/></button><button aria-label="Zoom globe in" disabled={zoom >= 2} onClick={() => setZoom(Math.min(2,zoom + 1))}><Plus size={14}/></button></div>
        <div className="chapter-copy"><div className="eyebrow">01 / THE WORLD IS THE DATASET</div><h2>Made of people.<br/>Full of <em>possibility.</em></h2><p>A hand reaching. A shirt folding. A box finding its place. The smallest human actions hold the greatest lessons for machines.</p><a className="text-link" href="#world">Look a little closer <ArrowRight size={17}/></a></div>
        <div className="hero-bottom"><a href="#world"><ArrowDown size={13}/> SCROLL TO DISCOVER</a><span>HUMAN → DATA → POSSIBILITY</span><span>01 — 04</span></div>
        <div className="story-progress"><span/></div>
      </div>
    </section>
    <VideoPortal/>
    <IntelligenceDemo/>
    <section className="shards-section" id="approach" ref={shards}>
      <div className="shards-background" aria-hidden="true">{shardsLoaded && <ShardField active={shardsVisible} reduced={reduced}/>}</div>
      <div className="shards-content"><span className="eyebrow">04 / INDIVIDUAL MOMENTS. COLLECTIVE INTELLIGENCE.</span><h2>Many perspectives.<br/><em>One more capable future.</em></h2><p>Real people. Real environments. A considered path<br/>from human experience to your next breakthrough.</p><div className="capabilities">{[{n:"01",title:"Capture the real.",text:"Human video shoots, designed around the tasks and environments your robots need to understand."},{n:"02",title:"Preserve the context.",text:"Reviewed demonstrations that retain the objects, actions, and variations behind every movement."},{n:"03",title:"Build what comes next.",text:"Curated datasets aligned to your model’s needs. Ready for your team to explore, evaluate, and train."}].map(item=><article key={item.n}><span>{item.n}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></div>
    </section>
    <section className="closing" id="contact"><div className="eyebrow"><span className="status-dot"/> THE NEXT CHAPTER STARTS WITH YOU</div><h2>Let’s teach the future<br/><em>something human.</em></h2><a className="button primary" href="#project-brief" onClick={() => { const el=document.getElementById("project-brief") as HTMLDetailsElement; el.open=true; }}>Start a conversation <ArrowUpRight size={17}/></a><details id="project-brief"><summary>Put together your project brief <Plus size={14}/></summary><p>Target tasks · Capture environments · Data format · Scale · Timeline</p><button className="text-link" onClick={async () => { try { await navigator.clipboard.writeText('OWOW project brief\nTarget tasks:\nCapture environments:\nRequired data format:\nEstimated scale:\nTimeline:\nContact details:');setCopied(true);setCopyError(false); } catch {setCopyError(true);} }}>{copied ? <>Brief copied <Check size={15}/></> : <>Copy project brief <ArrowUpRight size={15}/></>}</button>{copyError && <p role="status">Copy these fields manually: target tasks, environments, data format, scale, timeline, and contact details.</p>}</details><footer><a className="wordmark" href="#">owow<span>®</span></a><p>Human experience. Robot intelligence.</p><span>© {new Date().getFullYear()} OWOW</span><a href="#">Back to top <ArrowUpRight size={12}/></a></footer></section>
  </main>;
}
