"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { MousePointer2, RotateCcw, ArrowUpRight, Check } from "lucide-react";
import { useSceneVisibility, useReducedMotion } from "./use-scene";

const PromptBar = dynamic(() => import("../react-bits/PromptBar"), {ssr:false});
const models = [{key:"physical-ai",name:"Physical AI",tag:"Preview"}];
const sources = [{key:"demonstrations",name:"Human demonstrations",description:"Task context and action sequences"},{key:"environments",name:"Real environments",description:"Spaces, objects, and variations"}];
const commands = [{key:"plan",name:"/plan",description:"Describe a robotics data brief"}];
const example = "Teach a robot to fold a shirt, one human demonstration at a time.";

export default function IntelligenceDemo() {
  const { ref, visible, loaded } = useSceneVisibility();
  const reduced = useReducedMotion();
  const [stage, setStage] = useState(0);
  const [run, setRun] = useState(0);
  const [effort, setEffort] = useState("High");
  const [result, setResult] = useState("");
  const [cursor, setCursor] = useState({x:0,y:0});
  const interrupted = useRef(false);
  const [manual, setManual] = useState(false);
  const played = useRef(false);
  useEffect(() => {
    if (!visible || reduced || played.current) return;
    played.current = true;
    interrupted.current = false;
    const timers = [setTimeout(() => { if (!interrupted.current) setStage(1); }, 1200), setTimeout(() => { if (!interrupted.current) setStage(2); }, 2300), setTimeout(() => { if (!interrupted.current) setStage(3); }, 3550), setTimeout(() => setStage(4), 5200)];
    return () => { timers.forEach(clearTimeout); };
  }, [visible, reduced, run]);
  useEffect(() => {
    if (stage !== 1 && stage !== 2) return;
    const timer = setTimeout(() => {
      const root = ref.current;
      const target = root?.querySelector(stage === 1 ? '[aria-label="Choose effort"]' : '[role="slider"]');
      if (!root || !target) return;
      const r = root.getBoundingClientRect(), t = target.getBoundingClientRect();
      setCursor({x: t.left - r.left + (stage === 1 ? t.width * .55 : t.width - 13), y:t.top - r.top + t.height * .5});
    }, 100);
    return () => clearTimeout(timer);
  }, [stage, ref]);
  function takeControl() { if (stage > 0 && stage < 4) { interrupted.current = true; setManual(true); setStage(4); } }
  return <section className="intelligence-section" id="intelligence" ref={ref} onPointerDownCapture={takeControl} onKeyDownCapture={takeControl}>
    <div className="section-intro"><span className="eyebrow"><span className="status-dot"/> 05 / GIVE INTELLIGENCE MORE TO WORK WITH</span><h2>Potential, meet<br/><em>full capacity.</em></h2><p>A model can only learn from what it’s seen.<br/>Give yours the depth, diversity, and human context to go further.</p></div>
    <div className="prompt-stage"><div className="demo-topline"><span><i/> O’WOW / PHYSICAL INTELLIGENCE</span><span>INTERACTIVE DEMO</span></div>
      {loaded && <PromptBar defaultDraft={example} demoStage={manual ? 4 : stage} animationActive={visible} placeholder="What should your robot learn?" models={models} sources={sources} commands={commands} defaultEffort="High" onEffortChange={setEffort} background="#171b19" menuBackground="#222925" color="#eeeee5" sparkColor="#b3cfa1" sparkBoost={.7} width={670} radius={16} onSend={text => setResult(text)} />}
      <div className="demo-bottomline"><span>{effort === "Max" ? <><span className="status-dot"/> Maximum context. Greater possibility.</> : "A little more experience changes everything."}</span><button onClick={() => { played.current = false; interrupted.current = false; setManual(false); setStage(0); setEffort("High"); setRun(run + 1); }}><RotateCcw size={12}/> Replay demo</button></div>
      {result && <div className="demo-result" role="status"><Check size={16}/><div><strong>Your learning brief</strong><p>{result}</p><small>Start with human demonstrations, task variations, and a reviewed action sequence. This is an illustrative interface, not a connected ML model.</small><a href="#contact">Build this dataset with us <ArrowUpRight size={14}/></a></div></div>}
    </div>
    <div className="demo-cursor" aria-hidden="true" style={{transform:`translate3d(${cursor.x}px,${cursor.y}px,0)`,opacity: stage > 0 && stage < 4 && !manual ? 1 : 0}}><MousePointer2 size={24} fill="#e9eee5"/><span>Explore</span></div>
    <div className="intelligence-notes"><div><span>01</span> More human context</div><div><span>02</span> More real-world variation</div><div><span>03</span> More room to learn</div></div>
    <p className="demo-disclaimer">An interactive illustration of possibility. No model is connected and no data leaves this page.</p>
  </section>;
}

