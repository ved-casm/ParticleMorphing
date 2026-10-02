import * as THREE from "three";

/**
 * Depth-video stippling.
 *
 * Every scene is a tiny grayscale depth-map video (white = near). A fixed grid of points
 * samples the current frame in the vertex shader: near pixels keep their dot, far ones
 * drop out, depth pushes dots toward the camera, and a small Sobel pass keeps
 * silhouettes and folds crisp. Scroll scrubs `video.currentTime`, so the scene only moves
 * when the visitor scrolls. Between scenes the dots peel away in a staggered, noisy
 * stream and settle into the next clip.
 */

/** `wide`: the subjects span the whole frame, so on portrait screens fit the full width instead of cropping. */
export interface DepthScene { key: string; src: string; duration: number; gamma?: number; wide?: boolean }
export interface SceneState { index: number; local: number; phase: "play" | "transition" }
export interface FieldOptions { mobile: boolean; reduced: boolean; onReady?: () => void; onState?: (s: SceneState) => void }

/** A transition takes this fraction of one scene's scroll length. */
export const TRANSITION = 0.45;

const NOISE = /* glsl */ `
float h11(float v){ return fract(sin(v*127.1)*43758.5453123); }
float h21(vec2 v){ return fract(sin(dot(v,vec2(127.1,311.7)))*43758.5453123); }
float n2(vec2 v){ vec2 i=floor(v),f=fract(v); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 v){ float a=0.0,w=0.5; mat2 r=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<3;i++){ a+=n2(v)*w; v=r*v+7.3; w*=0.5; } return a; }
`;

const VERT = /* glsl */ `
attribute vec2 aUv;
attribute float aSeed;
uniform sampler2D tA;
uniform sampler2D tB;
uniform vec2 uTexel;
uniform vec2 uPlane;
uniform float uMorph;
uniform float uIntro;
uniform float uTime;
uniform float uDepth;
uniform float uGammaA;
uniform float uGammaB;
uniform float uDir;
uniform float uPointSize;
uniform float uPixelRatio;
uniform float uReduced;
varying float vAlpha;
varying float vNear;
varying float vEdge;
${NOISE}
float depthAt(sampler2D t, vec2 uv, float g){ return pow(texture2D(t, clamp(uv, 0.0, 1.0)).r, g); }
// 5-tap cross Sobel on the depth map: thin, bright lines on silhouettes and folds.
float edgeAt(sampler2D t, vec2 uv, float g){
  float l=depthAt(t,uv-vec2(uTexel.x,0.0),g), r=depthAt(t,uv+vec2(uTexel.x,0.0),g);
  float u=depthAt(t,uv-vec2(0.0,uTexel.y),g), d=depthAt(t,uv+vec2(0.0,uTexel.y),g);
  return smoothstep(0.035, 0.22, pow(length(vec2(r-l, d-u)), 0.8));
}
void main(){
  // Per-particle stagger so a transition peels off in patches, not all at once.
  float order=fbm(aUv*vec2(7.0,5.0)+vec2(uDir*3.0,1.7))*0.75+h11(aSeed*91.7)*0.25;
  float mp=uReduced>0.5?uMorph:smoothstep(order*0.55,order*0.55+0.45,uMorph);

  float vA=depthAt(tA,aUv,uGammaA), vB=depthAt(tB,aUv,uGammaB);
  float eA=mp<0.999?edgeAt(tA,aUv,uGammaA):0.0;
  float eB=mp>0.001?edgeAt(tB,aUv,uGammaB):0.0;
  float v=mix(vA,vB,mp), e=mix(eA,eB,mp);

  // Stippling: brighter (nearer) pixels keep more dots; edges always keep theirs.
  // The depth clips are pre-cut (background = 0, subject >= 0.3), so dots stay on the body:
  // edges only count where there is subject underneath them.
  float body=smoothstep(0.1,0.22,v);
  float density=body*(0.3+0.7*v)+e*0.6*body;
  float a=smoothstep(aSeed-0.035,aSeed+0.035,density);

  vec3 p=vec3((aUv.x-0.5)*uPlane.x,(0.5-aUv.y)*uPlane.y,(pow(v,1.2)-0.4)*uDepth+e*uDepth*0.12);

  // Transition: lift off, sweep sideways through noise, land in the next scene.
  float flight=sin(mp*3.14159265);
  if(flight>0.001&&uReduced<0.5){
    vec2 nz=vec2(fbm(aUv*3.5+uTime*0.06),fbm(aUv*3.5+vec2(5.2,1.3)-uTime*0.05))*2.0-1.0;
    p.xy+=(vec2(uDir,0.15*nz.y)*0.9+nz*0.75)*flight*uPlane.x*0.2;
    p.z+=(h11(aSeed*13.1)-0.5)*flight*uDepth*2.5;
    a=max(a,flight*0.5*step(h11(aSeed*7.31),0.28));
  }

  // Intro: the first scene is born from a single point and fans out.
  if(uIntro<0.999){
    float start=h11(aSeed*3.17)*0.45+length(aUv-0.5)*0.35;
    float b=smoothstep(start,start+0.3,uIntro);
    float eb=b*b*(3.0-2.0*b);
    float ang=h11(aSeed*5.3)*6.2831853+uTime*0.2;
    vec2 arc=vec2(cos(ang),sin(ang))*sin(eb*3.14159265)*uPlane.x*0.06;
    p.xy=mix(vec2(0.0),p.xy,eb)+arc;
    p.z*=eb;
    a*=smoothstep(0.0,0.25,b);
  }

  vec4 mv=modelViewMatrix*vec4(p,1.0);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=a<0.01?0.0:uPointSize*uPixelRatio*(0.85+e*0.5)*(10.0/-mv.z);
  vAlpha=a; vNear=v; vEdge=e;
}`;

const FRAG = /* glsl */ `
uniform vec3 uNear;
uniform vec3 uFar;
varying float vAlpha;
varying float vNear;
varying float vEdge;
void main(){
  float d=length(gl_PointCoord-0.5); if(d>0.5) discard;
  vec3 col=mix(uFar,uNear,clamp(vNear*1.1+vEdge*0.5,0.0,1.0));
  gl_FragColor=vec4(col,vAlpha*(1.0-smoothstep(0.28,0.5,d)));
}`;

interface Clip { video: HTMLVideoElement; texture: THREE.Texture; duration: number; gamma: number; wide: boolean; target: number; lastTime: number; ready: boolean }

export class DepthField {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private material: THREE.ShaderMaterial;
  private points: THREE.Points;
  private clips: Clip[];
  private blank: THREE.DataTexture;
  private progress = 0;
  private smooth = 0;
  private mouse = new THREE.Vector2();
  private mouseSmooth = new THREE.Vector2();
  private intro = 0;
  private time = 0;
  private last = 0;
  private raf = 0;
  private disposed = false;
  private lastState = "";
  private frameFit = { fit: 8, crop: 8, portrait: false, width: 8 };

  constructor(private host: HTMLElement, scenes: DepthScene[], private opts: FieldOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
    const gl = this.renderer.getContext(), info = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    const low = !opts.mobile && /swiftshader|llvmpipe|basic render|intel(?!.*arc)/i.test(gpu);
    const pr = Math.min(devicePixelRatio, opts.mobile ? 1.25 : low ? 1 : 1.5);
    this.renderer.setPixelRatio(pr);
    this.renderer.setClearColor(0x000000, 0);
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 0, 10);

    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.blank.needsUpdate = true;
    this.clips = scenes.map(s => this.makeClip(s));

    // A jittered grid over the 16:9 frame. aSeed is the stipple threshold.
    const count = opts.mobile ? 45000 : low ? 85000 : 130000;
    const cols = Math.round(Math.sqrt(count * 16 / 9)), rows = Math.round(cols * 9 / 16), n = cols * rows;
    const uv = new Float32Array(n * 2), seed = new Float32Array(n);
    for (let y = 0, i = 0; y < rows; y++) for (let x = 0; x < cols; x++, i++) {
      uv[i * 2] = (x + 0.5 + (Math.random() - 0.5) * 0.9) / cols;
      uv[i * 2 + 1] = (y + 0.5 + (Math.random() - 0.5) * 0.9) / rows;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("aUv", new THREE.BufferAttribute(uv, 2));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false,
      uniforms: {
        tA: { value: this.blank }, tB: { value: this.blank }, uTexel: { value: new THREE.Vector2(1 / 640, 1 / 360) },
        uPlane: { value: new THREE.Vector2(8, 4.5) }, uMorph: { value: 0 }, uIntro: { value: opts.reduced ? 1 : 0 },
        uTime: { value: 0 }, uDepth: { value: 1 }, uGammaA: { value: 1 }, uGammaB: { value: 1 }, uDir: { value: 1 },
        uPointSize: { value: opts.mobile ? 2.1 : 1.75 }, uPixelRatio: { value: pr }, uReduced: { value: opts.reduced ? 1 : 0 },
        uNear: { value: new THREE.Color("#ffffff") }, uFar: { value: new THREE.Color("#5c5c5c") },
      },
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    this.resize();
    addEventListener("resize", this.resize);
    addEventListener("pointermove", this.onMove, { passive: true });
    this.clips[0].video.addEventListener("loadeddata", () => {
      if (this.disposed) return;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
      opts.onReady?.();
    }, { once: true });
  }

  private makeClip(s: DepthScene): Clip {
    const video = document.createElement("video");
    video.src = s.src; video.muted = true; video.playsInline = true; video.preload = "auto"; video.crossOrigin = "anonymous";
    video.setAttribute("muted", ""); video.setAttribute("playsinline", "");
    // VideoTexture (not a plain Texture): three sizes plain textures from the element's
    // width/height attributes, which are 0 for a <video>, so nothing would ever upload.
    video.width = 640; video.height = 360;
    const texture = new THREE.VideoTexture(video);
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    // aUv.y runs top→bottom in the shader, so keep the frame un-flipped (otherwise scenes play upside down).
    texture.flipY = false;
    const clip: Clip = { video, texture, duration: s.duration, gamma: s.gamma ?? 1, wide: !!s.wide, target: 0, lastTime: -1, ready: false };
    video.addEventListener("loadeddata", () => {
      clip.ready = true;
      clip.duration = video.duration || s.duration;
      // iOS only paints a paused video after it has played once.
      video.play().then(() => video.pause()).catch(() => {});
      texture.needsUpdate = true;
    });
    video.addEventListener("seeked", () => { texture.needsUpdate = true; });
    video.load();
    return clip;
  }

  /** Scroll progress through the whole pinned section, 0..1. */
  setProgress(p: number) { this.progress = Math.min(1, Math.max(0, p)); }

  private onMove = (e: PointerEvent) => { this.mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); };

  private resize = () => {
    const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const visH = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.position.z, visW = visH * this.camera.aspect;
    // Fit the 16:9 frame; on tall phones let it overflow sideways so the subject stays big.
    // Leave the bottom band free for the caption: the frame takes ~74% of the height, nudged up.
    // On tall phones centred scenes may overflow sideways (bigger subject); wide scenes fit the width.
    const fit = Math.min(visW * 0.9, visH * 0.74 * 16 / 9);
    this.frameFit = { fit: w < h ? visW * 0.98 : fit, crop: w < h ? Math.max(fit, visH * 0.5 * 16 / 9) : fit, portrait: w < h, width: this.frameFit.width };
    if (this.frameFit.width === 8) this.frameFit.width = this.frameFit.crop;
    this.points.position.y = visH * (w < h ? 0.1 : 0.07);
    this.applyPlane();
  };

  private applyPlane() {
    const pw = this.frameFit.width, u = this.material.uniforms;
    u.uPlane.value.set(pw, pw * 9 / 16);
    u.uDepth.value = pw * 0.26;
  }

  /** Map smoothed progress to scene index, local progress and phase. */
  private timeline(p: number): SceneState & { next: number } {
    const n = this.clips.length, total = n + (n - 1) * TRANSITION;
    let t = p * total;
    for (let i = 0; i < n; i++) {
      if (t <= 1 || i === n - 1) return { index: i, next: i, local: Math.min(1, Math.max(0, t)), phase: "play" };
      t -= 1;
      if (t <= TRANSITION) return { index: i, next: i + 1, local: t / TRANSITION, phase: "transition" };
      t -= TRANSITION;
    }
    return { index: n - 1, next: n - 1, local: 1, phase: "play" };
  }

  private seek(c: Clip, time: number) {
    c.target = Math.min(Math.max(0, time), Math.max(0, c.duration - 0.04));
    const v = c.video;
    if (!c.ready || v.seeking) return;
    if (Math.abs(v.currentTime - c.target) > 0.5 / 15) v.currentTime = c.target;
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const ease = (k: number) => 1 - Math.exp(-dt * k);

    this.smooth += (this.progress - this.smooth) * ease(8);
    if (!this.opts.reduced) this.intro = Math.min(1, this.intro + dt / 2.4);
    const s = this.timeline(this.smooth), u = this.material.uniforms;
    const a = this.clips[s.index], b = this.clips[s.next];
    if (s.phase === "play") { this.seek(a, s.local * a.duration); u.uMorph.value = 0; }
    else { this.seek(a, a.duration); this.seek(b, 0); u.uMorph.value = s.local; }
    u.tA.value = a.ready ? a.texture : this.blank;
    u.tB.value = b.ready ? b.texture : this.blank;
    u.uGammaA.value = a.gamma; u.uGammaB.value = b.gamma;
    // Ease the frame size toward what the current (or incoming) scene wants.
    const f = this.frameFit, want = (s.phase === "transition" && s.local > 0.5 ? b : a).wide ? f.fit : f.crop;
    if (Math.abs(f.width - want) > 1e-3) { f.width += (want - f.width) * ease(3); this.applyPlane(); }
    u.uDir.value = s.index % 2 === 0 ? 1 : -1;
    u.uTime.value = this.time;
    u.uIntro.value = this.opts.reduced ? 1 : this.intro;

    // Upload a new frame only when the video actually moved.
    for (const c of [a, b]) if (c.ready && c.video.currentTime !== c.lastTime) { c.lastTime = c.video.currentTime; c.texture.needsUpdate = true; }

    // Gentle pointer orbit reveals the depth.
    this.mouseSmooth.lerp(this.mouse, ease(3));
    const k = this.opts.reduced ? 0 : 1;
    this.camera.position.set(this.mouseSmooth.x * 1.5 * k, this.mouseSmooth.y * 0.7 * k, 10);
    this.camera.lookAt(0, 0, 0);

    const key = `${s.index}|${s.phase}|${s.local.toFixed(3)}`;
    if (key !== this.lastState) { this.lastState = key; this.opts.onState?.(s); }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.resize);
    removeEventListener("pointermove", this.onMove);
    for (const c of this.clips) { c.video.pause(); c.video.removeAttribute("src"); c.video.load(); c.texture.dispose(); }
    this.blank.dispose();
    this.points.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
