"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, Pause, Play } from "lucide-react";
import { useSceneVisibility, useReducedMotion } from "./use-scene";

export default function VideoPortal() {
  const { ref, visible, loaded } = useSceneVisibility("200px");
  const reduced = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);
  const mask = useRef<SVGGElement>(null);
  const [paused, setPaused] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (visible && !paused && !reduced) el.play().catch(() => setBlocked(true));
    else el.pause();
  }, [visible, paused, reduced, loaded]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el || !mask.current) return;
      const p = Math.max(0, Math.min(1, -el.getBoundingClientRect().top / Math.max(1, el.offsetHeight - innerHeight)));
      const zoom = reduced ? 0 : Math.max(0, Math.min(1, (p - .12) / .65));
      const scale = Math.pow(95, zoom * zoom);
      // Zoom into the right stem of the final W, then move the revealed film upward.
      mask.current.setAttribute("transform", `translate(${865 + (500 - 865) * zoom} ${330 + (300 - 330) * zoom}) scale(${scale}) translate(-865 -330)`);
      el.style.setProperty("--mask-opacity", String(1 - Math.max(0, (p - .73) / .12)));
      el.style.setProperty("--film-reveal", String(Math.min(1, Math.max(0, (p - .68) / .15))));
      el.style.setProperty("--film-exit", String(reduced ? 0 : Math.max(0, (p - .84) / .16)));
      el.style.setProperty("--film-label", String(Math.max(0, 1 - p * 5)));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update(); addEventListener("scroll", schedule, {passive:true}); addEventListener("resize", schedule);
    return () => { cancelAnimationFrame(frame); removeEventListener("scroll", schedule); removeEventListener("resize", schedule); };
  }, [ref, reduced]);
  return <section className="video-portal" ref={ref} id="world" aria-label="OWOW robotics film">
    <div className="video-sticky">
      <div className="film-surface">
        <video ref={video} src={loaded ? "https://videos.pexels.com/video-files/9029324/9029324-hd_1280_720_30fps.mp4" : undefined} muted loop playsInline preload="none" aria-label="A human hand interacting with a robot" />
        <div className="film-shade" />
      </div>
      <svg className="video-mask" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><mask id="owow-video-mask"><rect x="-100000" y="-100000" width="200000" height="200000" fill="white"/><g ref={mask}><text x="50" y="390" fontFamily="Arial, Helvetica, sans-serif" fontSize="280" fontWeight="900" letterSpacing="-18" textLength="900" lengthAdjust="spacingAndGlyphs" fill="black">OWOW</text></g></mask></defs><rect width="1000" height="600" fill="#080a09" mask="url(#owow-video-mask)"/></svg>
      <div className="portal-heading"><span className="eyebrow">02 / LOOK CLOSER</span><p>The future isn’t artificial.<br/>It starts with <em>us.</em></p></div>
      <div className="portal-scroll"><span>HUMAN EXPERIENCE, IN MOTION</span><span>SCROLL INTO OUR WORLD <ArrowDown size={13}/></span></div>
      <div className="film-caption"><span className="eyebrow">FROM OBSERVATION TO UNDERSTANDING</span><h2>Every movement.<br/>A new <em>possibility.</em></h2></div>
      <button className="video-toggle" aria-label={paused || blocked || reduced ? "Play robotics film" : "Pause robotics film"} onClick={() => { if (blocked || reduced) { video.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true)); } else setPaused(!paused); }}>{paused || blocked || reduced ? <Play size={14}/> : <Pause size={14}/>}</button>
      {blocked && <button className="film-play-fallback" onClick={() => video.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true))}>Play robotics film <Play size={14}/></button>}
      <a className="film-credit" href="https://www.pexels.com/video/close-up-shot-of-a-robot-9029324/" target="_blank" rel="noreferrer">Film: Kindel Media / Pexels ↗</a>
    </div>
  </section>;
}
