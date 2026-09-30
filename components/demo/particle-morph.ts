import * as THREE from "three";
import { GPUComputationRenderer, type Variable } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { SHAPES, buildShape, text, type ShapeKey } from "./shapes";
import { Environment, NO_REFLECT_LAYER } from "./environment";

/**
 * GPGPU particle morph floating over a night-time lake.
 *
 * Positions and velocities live in two float textures (one texel per particle) that are
 * ping-ponged every fixed 1/60s step. Each particle is pulled toward its texel in a
 * "target" texture by a spring and gently stirred by divergence-free (bitangent) noise.
 * The cursor pushes particles softly through the same physics. Morphing is just
 * swapping the target texture. When the visitor is idle the shape "breathes": every two
 * seconds it swells, a light wave runs outward through it and sparks fly off its surface.
 *
 * The particles hang off the camera, so the page layout (left / right / centre) stays
 * stable while the camera orbits the lake on scroll. Shaders author sRGB and convert to
 * linear; the composer finishes with an OutputPass.
 */

export interface Layout { x: number; y: number; scale: number }
export interface MorphOptions { reduced: boolean; mobile: boolean; onReady?: () => void }

const TO_LINEAR = /* glsl */ `vec3 toLinear(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }`;

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
// Simplex noise with analytic gradient (after Ashima Arts / Stefan Gustavson, MIT).
float snoise(vec3 v, out vec3 gradient){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  vec4 m2=m*m; vec4 m4=m2*m2;
  vec4 pdotx=vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3));
  vec4 temp=m2*m*pdotx;
  gradient=-8.0*(temp.x*x0+temp.y*x1+temp.z*x2+temp.w*x3);
  gradient+=m4.x*p0+m4.y*p1+m4.z*p2+m4.w*p3;
  gradient*=105.0;
  return 105.0*dot(m4,pdotx);
}
// Cross product of two noise gradients is divergence free: particles swirl without clumping.
vec3 bitangentNoise(vec3 p){
  vec3 g1; vec3 g2;
  snoise(p,g1); snoise(p+vec3(31.416,-47.853,12.793),g2);
  return cross(g1,g2);
}
`;


const VELOCITY = /* glsl */ `
uniform float uTime;
uniform float uMorph;
uniform float uBurst;
uniform float uPulse;
uniform float uSpring;
uniform float uDamping;
uniform float uFlow;
uniform float uFlowScale;
uniform float uHover;
uniform float uAspect;
uniform vec2 uMouse;
uniform vec2 uMouseVel;
uniform mat4 uMVP;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform sampler2D tTarget;
${NOISE}
void main(){
  vec2 uv=gl_FragCoord.xy/resolution.xy;
  vec4 P=texture2D(texturePosition,uv);
  vec4 V=texture2D(textureVelocity,uv);
  vec4 T=texture2D(tTarget,uv);
  vec3 pos=P.xyz; vec3 vel=V.xyz; float scatter=V.w; float h=T.w;

  // Staggered release: each particle joins the new shape at a slightly different moment.
  float act=smoothstep(h*0.55,h*0.55+0.3,uMorph);
  // Heartbeat swell.
  vec3 target=T.xyz*(1.0+uPulse*0.045+sin(uTime*1.2+h*6.2831)*0.002);

  // Cursor (kept deliberately soft): project to screen and push with the pointer's motion.
  float mask=0.0; vec2 away=vec2(0.0);
  vec4 clip=uMVP*vec4(pos,1.0);
  if(clip.w>0.0){
    vec2 d=(clip.xy/clip.w-uMouse)*vec2(uAspect,1.0);
    float len=length(d);
    mask=1.0-smoothstep(0.08,0.24,len);
    away=d/max(len,1e-4);
  }
  vec2 fv=uMouseVel*vec2(uAspect,1.0)*30.0*mask;
  float fl=length(fv); fv*=min(1.0,1.0/max(fl,1e-4)); float fluid=min(fl,1.0);
  vel+=(uCamRight*fv.x+uCamUp*fv.y)*0.018;
  vel+=(uCamRight*away.x+uCamUp*away.y)*mask*uHover*0.0012;

  vec3 toT=target-pos; float dist=length(toT);
  float k=uSpring*mix(1.0+dist*0.5,1.0,scatter)*(1.0-smoothstep(0.0,0.25,scatter)*0.5)*max(0.6,1.0-fluid*0.4);
  vel+=toT*k*mix(0.04,1.0,act)/60.0;

  vel+=bitangentNoise(pos*uFlowScale+vec3(0.0,0.0,uTime*0.3))*uFlow*(1.0+(1.0-act)*2.0);
  vel+=normalize(pos+vec3(1e-3))*(uBurst*(0.03+h*0.05)+uPulse*0.01*(0.5+h));

  vel*=uDamping;
  float vm=length(vel); vel*=min(1.0,0.2/max(vm,1e-4));

  float ts=clamp(fluid*1.2+uBurst,0.0,1.0);
  scatter=ts>scatter?mix(scatter,ts,0.25):scatter-1.0/(60.0*0.4);
  gl_FragColor=vec4(vel,clamp(scatter,0.0,1.0));
}`;

const POSITION = /* glsl */ `
void main(){
  vec2 uv=gl_FragCoord.xy/resolution.xy;
  vec4 P=texture2D(texturePosition,uv);
  vec4 V=texture2D(textureVelocity,uv);
  // Only a faint shimmer while travelling, so morphs don't flare up.
  float g=clamp((length(V.xyz)-0.03)*5.0,0.0,1.0)*0.5+V.w*0.3;
  float glow=g>P.w?mix(P.w,g,0.1):mix(P.w,g,0.06);
  gl_FragColor=vec4(P.xyz+V.xyz,clamp(glow,0.0,1.0));
}`;

const POINT_VERT = /* glsl */ `
uniform sampler2D tPos;
uniform float uSize;
uniform float uPixelRatio;
uniform vec2 uMouse;
uniform float uAspect;
uniform float uHover;
uniform float uPulse;
uniform float uWave;
attribute vec2 aRef;
attribute vec3 aColor;
attribute float aHash;
varying vec3 vColor;
varying float vGlow;
varying float vHash;
varying float vHover;
varying float vWave;
void main(){
  vec4 P=texture2D(tPos,aRef);
  vec4 mv=modelViewMatrix*vec4(P.xyz,1.0);
  gl_Position=projectionMatrix*mv;
  vHover=0.0;
  if(uHover>0.001){
    vec2 d=(gl_Position.xy/gl_Position.w-uMouse)*vec2(uAspect,1.0);
    vHover=(1.0-smoothstep(0.0,0.2,length(d)))*uHover;
  }
  // Light wave running from the centre outward after each heartbeat.
  float r=length(P.xyz)/2.8;
  vWave=exp(-pow((r-uWave*1.5)*3.2,2.0))*exp(-uWave*1.1);
  vColor=aColor; vGlow=P.w; vHash=aHash;
  float s=uSize*uPixelRatio*(0.55+aHash*0.9)*(1.0+P.w*0.12+vWave*0.3+uPulse*0.06)*(14.0/-mv.z);
  gl_PointSize=clamp(s,1.0,72.0);
}`;

const POINT_FRAG = /* glsl */ `
uniform vec3 uLight;
uniform vec3 uHalf;
uniform vec3 uAccent;
uniform vec3 uGlow;
uniform vec3 uRim;
uniform vec3 uHoverColor;
uniform float uPulse;
varying vec3 vColor;
varying float vGlow;
varying float vHash;
varying float vHover;
varying float vWave;
${TO_LINEAR}
void main(){
  vec2 uv=gl_PointCoord-0.5; uv.y=-uv.y;
  float d=length(uv); if(d>0.5) discard;
  // Shade each sprite like a tiny sphere.
  vec3 n=vec3(uv*2.0,sqrt(max(0.0,1.0-4.0*d*d)));
  float diff=max(dot(n,uLight),0.0)*0.5+0.5;
  float rim=pow(1.0-n.z,2.0);
  float spec=pow(max(dot(n,uHalf),0.0),28.0);
  vec3 base=mix(vColor,uAccent,vHash>0.62?0.55:0.12);
  vec3 col=base*diff*1.05+uRim*rim*0.3+vec3(spec)*0.3+uGlow*vGlow*0.18;
  col=mix(col,uHoverColor,clamp(vHover*1.4,0.0,1.0)*0.35);
  col+=uGlow*(vWave*0.8+uPulse*0.22);
  col=mix(col,vec3(1.0),vWave*0.3);
  gl_FragColor=vec4(toLinear(col*1.18),1.0-smoothstep(0.42,0.5,d));
}`;

// Energy sparks thrown off the surface on every heartbeat.
const SPARK_VERT = /* glsl */ `
uniform float uTime; uniform float uSize; uniform float uPixelRatio;
attribute float aSpawn; attribute float aLife; attribute float aPhase; attribute vec3 aVel; attribute vec3 aFrom;
varying float vAlpha; varying float vAge;
void main(){
  float age=uTime-aSpawn; float p=clamp(age/aLife,0.0,1.0);
  if(p>=1.0||aSpawn<0.0){ gl_Position=vec4(0.0,0.0,-2.0,1.0); gl_PointSize=0.0; vAlpha=0.0; vAge=1.0; return; }
  vec3 pos=aFrom+aVel*age*(1.0-p*0.6);
  float sw=age*(2.0+aPhase*3.0);
  vec3 radial=normalize(pos+vec3(0.001));
  vec3 up=abs(radial.y)<0.99?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0);
  vec3 t=normalize(cross(radial,up)); vec3 b=cross(radial,t);
  float sr=(0.45+aPhase*0.25)*(1.0-p);
  pos+=t*sin(sw)*sr+b*cos(sw)*sr;
  pos.x+=sin(age*(3.0+aPhase*4.0)+aPhase*6.28)*0.2*(1.0-p*0.8);
  vAlpha=smoothstep(0.0,0.05,p)*(1.0-smoothstep(0.4,1.0,p)); vAge=p;
  vec4 mv=modelViewMatrix*vec4(pos,1.0); gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(uSize*uPixelRatio*(1.0-p*0.7)*(0.7+aPhase*0.6)*(14.0/-mv.z),1.0,40.0);
}`;
const SPARK_FRAG = /* glsl */ `
uniform vec3 uColor; uniform vec3 uGlowColor;
varying float vAlpha; varying float vAge;
${TO_LINEAR}
void main(){
  float d=length(gl_PointCoord-0.5); if(d>0.5) discard;
  float core=1.0-smoothstep(0.0,0.15,d); float glow=pow(1.0-smoothstep(0.0,0.5,d),2.0);
  vec3 col=mix(uGlowColor,uColor,smoothstep(0.0,0.3,vAge))+uGlowColor*core*0.8;
  gl_FragColor=vec4(toLinear(col)*(1.2+core*1.5)*glow*vAlpha,1.0);
}`;

const PALETTE = ["#3f7bff", "#5ee7ff", "#6d5bff", "#1f46c9", "#e6f3ff"];
const BEAT = { every: 2, lifetime: 2.3, speedMin: 1.2, speedMax: 4.6 };
const ORBIT = { radius: 29, height: 3.2, lookY: 6.2 };

function srgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255);
}

export class ParticleMorph {
  readonly count: number;
  private size: number;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1500);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private env: Environment;
  private gpu: GPUComputationRenderer;
  private posVar: Variable;
  private velVar: Variable;
  private target: THREE.DataTexture;
  private points: THREE.Points;
  private pointMat: THREE.ShaderMaterial;
  private sparks: THREE.Points;
  private sparkMat: THREE.ShaderMaterial;
  private sparkCount: number;
  private sparkNext = 0;
  private shapes = new Map<string, Float32Array>();
  private currentData: Float32Array | null = null;
  private current = "";
  private pending: string | null = null;
  private spin = 0;
  private tilt = 0;
  private tiltTarget = 0;
  private yaw = 0;
  private orbit = 0;
  private orbitTarget = 0;
  private accent = srgb(SHAPES[0].accent);
  private accentTarget = this.accent.clone();
  private layoutTarget: Layout = { x: 0, y: 0.4, scale: 1 };
  private layout: Layout = { x: 0, y: 0.4, scale: 0.6 };
  private mouse = new THREE.Vector2(9, 9);
  private smooth = new THREE.Vector2(9, 9);
  private mouseVel = new THREE.Vector2();
  private lastMove = -10;
  private hover = 0;
  private morph = 1;
  private burst = 0;
  private pulse = 0;
  private beatAt = -100;
  private lastBeatSlot = -1;
  private time = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private disposed = false;
  private tmp = { m: new THREE.Matrix4(), inv: new THREE.Matrix4(), v: new THREE.Vector3() };

  constructor(private container: HTMLElement, private opts: MorphOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    if (!this.renderer.extensions.has("EXT_color_buffer_float")) {
      this.renderer.dispose();
      throw new Error("Float render targets are not supported on this device.");
    }
    // Integrated / software GPUs get a lighter tier (same idea as the reference site).
    const gl = this.renderer.getContext(), info = gl.getExtension("WEBGL_debug_renderer_info");
    const gpuName = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    const low = !opts.mobile && /swiftshader|llvmpipe|basic render|intel(?!.*arc)/i.test(gpuName);
    this.size = opts.mobile ? 150 : low ? 200 : 240;
    this.count = this.size * this.size;
    const pr = Math.min(devicePixelRatio, opts.mobile ? 1.5 : low ? 1.25 : 1.75);
    this.renderer.setPixelRatio(pr);
    this.renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(this.renderer.domElement);

    this.env = new Environment(this.scene, pr, { mobile: opts.mobile, reduced: opts.reduced, low });
    this.camera.layers.enable(NO_REFLECT_LAYER);
    this.scene.add(this.camera);
    this.placeCamera();

    // Simulation.
    this.gpu = new GPUComputationRenderer(this.size, this.size, this.renderer);
    const pos0 = this.gpu.createTexture(), vel0 = this.gpu.createTexture();
    const start = pos0.image.data as Float32Array;
    for (let i = 0; i < this.count; i++) {
      const t = Math.random() * Math.PI * 2, p = Math.acos(2 * Math.random() - 1), r = 3.4 * Math.cbrt(Math.random());
      start.set([r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p), 0], i * 4);
    }
    this.target = new THREE.DataTexture(new Float32Array(start), this.size, this.size, THREE.RGBAFormat, THREE.FloatType);
    this.target.needsUpdate = true;
    this.velVar = this.gpu.addVariable("textureVelocity", VELOCITY, vel0);
    this.posVar = this.gpu.addVariable("texturePosition", POSITION, pos0);
    this.gpu.setVariableDependencies(this.velVar, [this.posVar, this.velVar]);
    this.gpu.setVariableDependencies(this.posVar, [this.posVar, this.velVar]);
    Object.assign(this.velVar.material.uniforms, {
      uTime: { value: 0 }, uMorph: { value: 1 }, uBurst: { value: 0 }, uPulse: { value: 0 }, uSpring: { value: 0.6 }, uDamping: { value: 0.93 },
      uFlow: { value: opts.reduced ? 0 : 0.00006 }, uFlowScale: { value: 0.55 }, uHover: { value: 0 }, uAspect: { value: 1 },
      uMouse: { value: new THREE.Vector2(9, 9) }, uMouseVel: { value: new THREE.Vector2() }, uMVP: { value: new THREE.Matrix4() },
      uCamRight: { value: new THREE.Vector3(1, 0, 0) }, uCamUp: { value: new THREE.Vector3(0, 1, 0) },
      tTarget: { value: this.target },
    });
    const err = this.gpu.init();
    if (err) throw new Error(err);

    // Render particles.
    const geo = new THREE.BufferGeometry(), ref = new Float32Array(this.count * 2), col = new Float32Array(this.count * 3), hash = new Float32Array(this.count);
    const pal = PALETTE.map(srgb);
    for (let i = 0; i < this.count; i++) {
      ref[i * 2] = (i % this.size + 0.5) / this.size;
      ref[i * 2 + 1] = (Math.floor(i / this.size) + 0.5) / this.size;
      hash[i] = Math.random();
      const r = Math.random(), f = i / this.count;
      let c: THREE.Vector3;
      if (r < 0.1) c = pal[4].clone().lerp(pal[0], Math.random() * 0.35);
      else if (r < 0.4) c = pal[0].clone().lerp(pal[1], Math.sin(f * Math.PI * 4) * 0.3 + 0.5);
      else if (r < 0.7) c = pal[0].clone().lerp(pal[2], Math.sin(f * Math.PI * 3) * 0.4 + 0.5);
      else c = pal[2].clone().lerp(pal[3], Math.sin(f * Math.PI * 5) * 0.3 + 0.45);
      col.set([c.x, c.y, c.z], i * 3);
    }
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.count * 3), 3));
    geo.setAttribute("aRef", new THREE.BufferAttribute(ref, 2));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aHash", new THREE.BufferAttribute(hash, 1));
    this.pointMat = new THREE.ShaderMaterial({
      vertexShader: POINT_VERT, fragmentShader: POINT_FRAG, depthTest: true, depthWrite: true, transparent: true,
      uniforms: {
        tPos: { value: null }, uSize: { value: opts.mobile ? 3.4 : 3.1 }, uPixelRatio: { value: pr },
        uLight: { value: new THREE.Vector3() }, uHalf: { value: new THREE.Vector3() },
        uAccent: { value: this.accent }, uGlow: { value: srgb("#8fd6ff") }, uRim: { value: srgb("#6fa8ff") },
        uHoverColor: { value: srgb("#b9ecff") }, uMouse: { value: new THREE.Vector2(9, 9) }, uAspect: { value: 1 }, uHover: { value: 0 },
        uPulse: { value: 0 }, uWave: { value: 100 },
      },
    });
    this.points = new THREE.Points(geo, this.pointMat);
    this.points.frustumCulled = false;
    this.camera.add(this.points);

    // Heartbeat sparks (live in the particles' local space so they follow the shape).
    this.sparkCount = opts.mobile ? 1200 : 3000;
    const sg = new THREE.BufferGeometry(), n = this.sparkCount;
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    sg.setAttribute("aSpawn", new THREE.BufferAttribute(new Float32Array(n).fill(-1), 1));
    sg.setAttribute("aLife", new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    sg.setAttribute("aPhase", new THREE.BufferAttribute(Float32Array.from({ length: n }, Math.random), 1));
    sg.setAttribute("aVel", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    sg.setAttribute("aFrom", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sparkMat = new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT, fragmentShader: SPARK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: 0.9 * 3.1 }, uPixelRatio: { value: pr }, uColor: { value: srgb("#4f8dff") }, uGlowColor: { value: srgb("#bfe9ff") } },
    });
    this.sparks = new THREE.Points(sg, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.points.add(this.sparks);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), opts.mobile ? 0.42 : 0.5, 0.45, 0.55);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
    addEventListener("resize", this.resize);
    addEventListener("pointermove", this.onMove, { passive: true });
    document.addEventListener("pointerleave", this.onLeave);
    this.warmUp();
  }

  private async warmUp() {
    await document.fonts?.ready;
    const first = await buildShape("logo", this.count);
    if (this.disposed) return;
    this.shapes.set("logo", first);
    this.apply("logo", first);
    this.morph = 1;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.opts.onReady?.();
    // Build the rest in the background so the first frame isn't blocked.
    for (const s of SHAPES.slice(1)) {
      await new Promise(r => setTimeout(r, 0));
      const data = await buildShape(s.key, this.count);
      if (this.disposed) return;
      this.shapes.set(s.key, data);
      if (this.pending === s.key) this.setShape(s.key);
    }
  }

  setShape(key: Exclude<ShapeKey, "text">) {
    if (key === this.current) return;
    const data = this.shapes.get(key);
    if (!data) { this.pending = key; return; }
    this.pending = null;
    this.apply(key, data);
  }

  /** Morph into arbitrary text typed by the visitor. */
  setText(value: string) {
    this.pending = null;
    this.apply(`text:${value}`, text(this.count, value));
  }

  private apply(key: string, data: Float32Array) {
    this.current = key;
    this.currentData = data;
    (this.target.image.data as Float32Array).set(data);
    this.target.needsUpdate = true;
    this.morph = this.opts.reduced ? 1 : 0;
    this.burst = 0;
    const def = SHAPES.find(s => s.key === key);
    this.spin = this.opts.reduced ? 0 : def?.spin ?? 0;
    this.tiltTarget = def?.tilt ?? 0;
    this.accentTarget = srgb(def?.accent ?? "#8fd6ff");
  }

  setLayout(l: Layout) { this.layoutTarget = l; }
  /** Angle (radians) of the camera around the lake. */
  setOrbit(a: number) { this.orbitTarget = a; }
  setScroll(p: number) { void p; }
  /** Click burst. */
  explode() { if (!this.opts.reduced) this.burst = 0.45; }

  private placeCamera() {
    const a = this.orbit, { radius, height, lookY } = ORBIT;
    this.camera.position.set(Math.sin(a) * radius, height, Math.cos(a) * radius);
    this.camera.lookAt(-Math.sin(a) * 8, lookY, -Math.cos(a) * 8);
  }

  /** One heartbeat: swell + light wave through the shape + a batch of sparks off its surface. */
  private beat() {
    const src = this.currentData;
    if (!src || this.opts.reduced) return;
    this.pulse = 1;
    this.beatAt = this.time;
    const g = this.sparks.geometry, spawn = g.getAttribute("aSpawn") as THREE.BufferAttribute, life = g.getAttribute("aLife") as THREE.BufferAttribute;
    const vel = g.getAttribute("aVel") as THREE.BufferAttribute, from = g.getAttribute("aFrom") as THREE.BufferAttribute, phase = g.getAttribute("aPhase") as THREE.BufferAttribute;
    const batch = Math.round(this.sparkCount * 0.53), pts = src.length / 4;
    for (let i = 0; i < batch; i++) {
      const s = this.sparkNext, k = Math.floor(Math.random() * pts) * 4;
      const x = src[k], y = src[k + 1], z = src[k + 2], l = Math.hypot(x, y, z) + 1e-3;
      const sp = BEAT.speedMin + Math.random() * (BEAT.speedMax - BEAT.speedMin);
      from.setXYZ(s, x, y, z);
      vel.setXYZ(s, (x / l + (Math.random() - 0.5) * 0.6) * sp, (y / l + (Math.random() - 0.5) * 0.6) * sp, (z / l + (Math.random() - 0.5) * 0.6) * sp);
      spawn.setX(s, this.time); life.setX(s, BEAT.lifetime * (0.6 + Math.random() * 0.8)); phase.setX(s, Math.random());
      this.sparkNext = (s + 1) % this.sparkCount;
    }
    for (const a of [spawn, life, vel, from, phase]) a.needsUpdate = true;
  }

  private onMove = (e: PointerEvent) => {
    this.mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.lastMove = this.time;
  };
  private onLeave = () => { this.mouse.set(9, 9); this.smooth.set(9, 9); };

  private resize = () => {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.env.resize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.fov = w < 760 ? 48 : 35;
    this.camera.updateProjectionMatrix();
    this.velVar.material.uniforms.uAspect.value = w / h;
    this.pointMat.uniforms.uAspect.value = w / h;
  };

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const ease = (k: number) => 1 - Math.exp(-dt * k);

    // Pointer: smoothed position + velocity (drives the soft push), eased hover engagement.
    const inside = this.mouse.x < 5;
    if (!inside) this.mouseVel.set(0, 0);
    else {
      if (this.smooth.x > 5) this.smooth.copy(this.mouse);
      const px = this.smooth.x, py = this.smooth.y;
      this.smooth.lerp(this.mouse, ease(12));
      this.mouseVel.x = this.mouseVel.x * 0.6 + (this.smooth.x - px) * 0.5;
      this.mouseVel.y = this.mouseVel.y * 0.6 + (this.smooth.y - py) * 0.5;
    }
    this.hover += ((inside && this.time - this.lastMove < 2.5 ? 1 : 0) - this.hover) * ease(6);

    // Camera orbit around the lake.
    this.orbit += (this.orbitTarget - this.orbit) * ease(1.3);
    this.placeCamera();

    // Layout, rotation and the per-shape accent colour.
    const l = this.layout, t = this.layoutTarget;
    l.x += (t.x - l.x) * ease(2.6); l.y += (t.y - l.y) * ease(2.6); l.scale += (t.scale - l.scale) * ease(2.6);
    this.accent.lerp(this.accentTarget, ease(2));
    this.tilt += (this.tiltTarget - this.tilt) * ease(2);
    if (this.spin) this.yaw += dt * this.spin;
    else this.yaw += (Math.round(this.yaw / (Math.PI * 2)) * Math.PI * 2 - this.yaw) * ease(1.6);
    const wobble = this.opts.reduced ? 0 : Math.sin(this.time * 0.3) * 0.12;
    const mx = inside ? this.smooth.x : 0, my = inside ? this.smooth.y : 0;
    this.points.position.set(l.x, l.y, -14);
    this.points.scale.setScalar(l.scale);
    this.points.rotation.set(-my * 0.06 + this.tilt, this.yaw + wobble + mx * 0.08, 0);
    this.camera.updateMatrixWorld(true);

    // Heartbeat every couple of seconds, only while the visitor is not playing with the shape.
    const slot = Math.floor(this.time / BEAT.every);
    const idle = !inside || this.time - this.lastMove > 1.2;
    if (slot !== this.lastBeatSlot) {
      this.lastBeatSlot = slot;
      if (idle && this.morph >= 1 && this.time > 1.5) this.beat();
    }
    this.pulse *= Math.pow(0.05, dt);

    // Fixed 60 Hz simulation steps.
    const u = this.velVar.material.uniforms, pu = this.pointMat.uniforms, { m, inv, v } = this.tmp;
    m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse).multiply(this.points.matrixWorld);
    u.uMVP.value.copy(m);
    inv.copy(this.points.matrixWorld).invert();
    u.uCamRight.value.copy(v.setFromMatrixColumn(this.camera.matrixWorld, 0).transformDirection(inv));
    u.uCamUp.value.copy(v.setFromMatrixColumn(this.camera.matrixWorld, 1).transformDirection(inv));
    u.uMouse.value.copy(inside ? this.smooth : this.mouse);
    u.uMouseVel.value.copy(this.mouseVel);
    u.uHover.value = this.hover;
    u.uPulse.value = this.pulse;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= 1 / 60 && steps < 3) {
      this.acc -= 1 / 60; steps++;
      this.morph = Math.min(1, this.morph + 1 / 60 / 1.3);
      this.burst *= 0.9;
      u.uTime.value = this.time; u.uMorph.value = this.morph; u.uBurst.value = this.burst;
      this.gpu.compute();
    }
    if (steps === 3) this.acc = 0;

    pu.tPos.value = this.gpu.getCurrentRenderTarget(this.posVar).texture;
    if (inside) pu.uMouse.value.copy(this.smooth);
    pu.uHover.value = this.hover;
    pu.uPulse.value = this.pulse;
    pu.uWave.value = this.time - this.beatAt;
    const light = pu.uLight.value as THREE.Vector3;
    light.set(0.5, 0.8, 0.6).normalize().transformDirection(this.camera.matrixWorldInverse);
    (pu.uHalf.value as THREE.Vector3).copy(light).add(v.set(0, 0, 1)).normalize();
    this.sparkMat.uniforms.uTime.value = this.time;
    this.env.update(this.time, this.camera);
    this.composer.render();
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.resize);
    removeEventListener("pointermove", this.onMove);
    document.removeEventListener("pointerleave", this.onLeave);
    this.gpu.dispose();
    this.target.dispose();
    this.points.geometry.dispose(); this.pointMat.dispose();
    this.sparks.geometry.dispose(); this.sparkMat.dispose();
    this.env.dispose();
    this.bloom.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
