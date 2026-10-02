"use client";

import { useEffect, useRef } from "react";
import { ArrowUpRight, Hand, Building2, AudioLines, Layers, Search, Video, ShieldCheck, PackageCheck } from "lucide-react";

/** Fades each `.v1-reveal` in once it scrolls into view. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && e.target.classList.add("is-in")), { threshold: 0.15 });
    root.querySelectorAll(".v1-reveal").forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

export const CALENDLY = "https://calendly.com/useowow/ds?back=1";

/** 03 — the problem, in the manifesto's words. */
export function ProblemSection() {
  const ref = useReveal<HTMLElement>();
  return <section className="v1-sec v1-problem" id="problem" ref={ref}>
    <div className="eyebrow v1-reveal">03 / THE DATA PROBLEM</div>
    <h2 className="v1-reveal">Physical AI doesn’t have a data problem the way language models did. <em>It has a bigger one.</em></h2>
    <div className="v1-versus v1-reveal">
      <div><span>Language models</span><p>Text was already sitting on the internet, waiting to be scraped.</p></div>
      <i aria-hidden="true" />
      <div><span>Physical AI</span><p>The real world isn’t. Every hour of usable robot data has to be captured, checked and labeled by someone, somewhere, doing something real.</p></div>
    </div>
    <p className="v1-lede v1-reveal">There’s no shortcut for that. So we didn’t build a scraper. We built the infrastructure to go get it: people, cameras, pipelines, and the QA to make sure what comes out the other end is good enough to train on.</p>
  </section>;
}

const CAPTURE = [
  { icon: Hand, title: "Teleoperation & manipulation", text: "Demonstrations of hands, tools and grippers at work, recorded the way robots need to learn them." },
  { icon: Building2, title: "Real environments & interaction", text: "Homes, kitchens, warehouses and streets, with the people and objects that actually live there." },
  { icon: AudioLines, title: "In-the-wild speech", text: "Natural conversation and voice, captured beyond what scraping can reach." },
  { icon: Layers, title: "Bespoke human data", text: "Any modality, designed around the tasks and failure cases your model needs to see." },
];

/** 04 — what O'WOW captures. */
export function CaptureSection() {
  const ref = useReveal<HTMLElement>();
  return <section className="v1-sec" id="capture" ref={ref}>
    <div className="v1-head">
      <div className="eyebrow v1-reveal">04 / WHAT WE CAPTURE</div>
      <h2 className="v1-reveal">Real environments. Real tasks.<br /><em>Real motion.</em></h2>
      <p className="v1-reveal">Robots learn from what they’re shown. We know what’s worth showing, then capture, structure and verify it at global scale.</p>
    </div>
    <div className="v1-cards">
      {CAPTURE.map(({ icon: Icon, title, text }, i) => <article key={title} className="v1-card v1-reveal" style={{ ["--d" as string]: `${i * 80}ms` }}>
        <Icon size={20} strokeWidth={1.4} /><span>{String(i + 1).padStart(2, "0")}</span>
        <h3>{title}</h3><p>{text}</p>
      </article>)}
    </div>
  </section>;
}

const STEPS = [
  { icon: Search, title: "Sourcing", text: "The right people, places and tasks, chosen around what your model has never seen." },
  { icon: Video, title: "Capture", text: "Cameras, rigs and teleoperation in real environments, not staged sets." },
  { icon: ShieldCheck, title: "Quality control", text: "Every clip reviewed, labeled and verified before it gets near your training run." },
  { icon: PackageCheck, title: "Delivery", text: "Structured, documented datasets in the format your pipeline already speaks." },
];

/** 06 — how the work gets done. */
export function ProcessSection() {
  const ref = useReveal<HTMLElement>();
  return <section className="v1-sec v1-process" id="process" ref={ref}>
    <div className="v1-head">
      <div className="eyebrow v1-reveal">06 / HOW WE WORK</div>
      <h2 className="v1-reveal">We handle the parts that<br /><em>don’t scale on their own.</em></h2>
    </div>
    <ol className="v1-steps">
      {STEPS.map(({ icon: Icon, title, text }, i) => <li key={title} className="v1-reveal" style={{ ["--d" as string]: `${i * 90}ms` }}>
        <div className="v1-step-top"><span>{String(i + 1).padStart(2, "0")}</span><Icon size={18} strokeWidth={1.4} /></div>
        <h3>{title}</h3><p>{text}</p>
      </li>)}
    </ol>
    <p className="v1-note v1-reveal">So research teams can spend their time on the model, not the pipeline.</p>
  </section>;
}

const PLACES = [
  ["Golden Gate Bridge", "USA"], ["Eiffel Tower", "France"], ["Taj Mahal", "India"], ["Christ the Redeemer", "Brazil"], ["Zuma Rock", "Nigeria"],
  ["Sydney Opera House", "Australia"], ["Niagara Falls", "Canada"], ["Colosseum", "Italy"], ["Great Wall", "China"], ["Table Mountain", "South Africa"],
  ["Guatapé", "Colombia"], ["Burj Khalifa", "UAE"], ["Big Ben", "United Kingdom"], ["Marina Bay", "Singapore"], ["Arenal Volcano", "Costa Rica"],
];

/** 08 — where the data comes from, as a slow two-row marquee. */
export function PlacesSection() {
  const ref = useReveal<HTMLElement>();
  const row = (items: string[][], reverse = false) => <div className={`v1-marquee ${reverse ? "rev" : ""}`} aria-hidden="true">
    <div>{[...items, ...items].map(([p, c], i) => <span key={i}>{p}<small>{c}</small></span>)}</div>
  </div>;
  return <section className="v1-sec v1-places" id="places" ref={ref}>
    <div className="v1-head">
      <div className="eyebrow v1-reveal">08 / WHERE WE CAPTURE</div>
      <h2 className="v1-reveal">Teaching machines to see the world,<br /><em>one place at a time.</em></h2>
    </div>
    {row(PLACES.slice(0, 8))}
    {row(PLACES.slice(7), true)}
    <p className="v1-sr">Places we capture data in: {PLACES.map(([p, c]) => `${p}, ${c}`).join("; ")}.</p>
  </section>;
}

/** 09 — the manifesto, distilled. */
export function ManifestoSection() {
  const ref = useReveal<HTMLElement>();
  return <section className="v1-sec v1-manifesto" ref={ref}>
    <div className="eyebrow v1-reveal">09 / MANIFESTO</div>
    <blockquote className="v1-reveal">
      “The next generation of AI won’t be won by whoever has the biggest model. <em>It’ll be won by whoever has the best data.</em>”
    </blockquote>
    <p className="v1-reveal">And the best data comes from doing the unglamorous work of collecting it right, at a scale nobody else is willing to do. That’s what O’WOW is for.</p>
    <a className="text-link v1-reveal" href={CALENDLY} target="_blank" rel="noreferrer">Talk to a founder <ArrowUpRight size={16} /></a>
  </section>;
}
