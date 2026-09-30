import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Night-time lake world behind the particles, built entirely in code:
 * sky dome (clouds, moon, stars), terrain with a lake basin, a reflective lake,
 * wind-blown instanced grass, noise-sculpted rocks, and a branching tree with
 * textured, fluttering blue leaves. Custom shaders author colours in sRGB and
 * convert to linear at the end (the composer ends with an OutputPass).
 */

/** `low`: weak / integrated GPU — fewer blades and a cheaper reflection. */
export interface EnvOptions { mobile: boolean; reduced: boolean; low: boolean }

/** Objects on this layer are drawn by the main camera but skipped by the lake reflection. */
export const NO_REFLECT_LAYER = 1;

const TAU = Math.PI * 2;
const TO_LINEAR = /* glsl */ `vec3 toLinear(vec3 c){ return pow(max(c, 0.0), vec3(2.2)); }`;
const FOG_HEX = "#0b1531";
const FOG_DENSITY = 0.0105;

/* ---------- deterministic noise + random ---------- */

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967295;
}
function vnoise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm3(x: number, y: number, z: number, oct = 4) {
  let s = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { s += a * vnoise3(x, y, z); x = x * 2.03 + 17; y = y * 2.03 + 11; z = z * 2.03 + 7; a *= 0.5; }
  return s / (1 - Math.pow(0.5, oct));
}
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ---------- terrain ---------- */

export function lakeRadius(theta: number) {
  return 24 + 2.6 * Math.sin(3 * theta + 0.7) + 1.6 * Math.sin(5 * theta + 2.1);
}
/** A small island in the lake that carries the tree (sits left of the shape in the "people" view). */
export const ISLAND = { x: -8, z: 6, radius: 6 };

export function heightAt(x: number, z: number) {
  const d = Math.hypot(x, z), e = d - lakeRadius(Math.atan2(z, x));
  let h = e < 0 ? -2.4 * smooth(0, -7, e) - 0.04 : 1.3 * smooth(0, 6, e);
  h += (fbm3(x * 0.035, 0.5, z * 0.035) - 0.5) * 4.5 * smooth(3, 30, e);
  h += smooth(60, 130, d) * (6 + fbm3(x * 0.018, 3.3, z * 0.018) * 22);
  h += 3.3 * smooth(ISLAND.radius, 1.2, Math.hypot(x - ISLAND.x, z - ISLAND.z));
  return h;
}
/** A point on the lake shore, `out` units inland, in the direction -(sin b, cos b). */
function shorePoint(b: number, out: number) {
  const dx = -Math.sin(b), dz = -Math.cos(b), r = lakeRadius(Math.atan2(dz, dx)) + out;
  return new THREE.Vector3(dx * r, 0, dz * r);
}

/* ---------- canvas textures ---------- */

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function leafTexture() {
  return canvasTexture(256, 256, ctx => {
    const rnd = mulberry(7);
    const leaf = new Path2D();
    leaf.moveTo(128, 250);
    leaf.bezierCurveTo(30, 200, 34, 70, 128, 6);
    leaf.bezierCurveTo(222, 70, 226, 200, 128, 250);
    // Body: soft radial light towards the middle.
    const g = ctx.createRadialGradient(118, 120, 10, 128, 128, 140);
    g.addColorStop(0, "#f2f7ff"); g.addColorStop(0.6, "#c9d9f7"); g.addColorStop(1, "#8ea5d6");
    ctx.fillStyle = g; ctx.fill(leaf);
    ctx.save(); ctx.clip(leaf);
    // Mottling.
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(${rnd() < 0.5 ? "40,60,120" : "255,255,255"},${0.03 + rnd() * 0.05})`;
      ctx.beginPath(); ctx.arc(rnd() * 256, rnd() * 256, 1 + rnd() * 5, 0, TAU); ctx.fill();
    }
    // Secondary veins branching off the midrib, with finer tertiary veins.
    ctx.lineCap = "round";
    for (let i = 0; i < 9; i++) {
      const y = 220 - i * 22, len = 90 - Math.abs(i - 4) * 8;
      for (const s of [-1, 1]) {
        ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(128, y);
        ctx.quadraticCurveTo(128 + s * len * 0.45, y - 18, 128 + s * len, y - 44); ctx.stroke();
        ctx.strokeStyle = "rgba(40,60,120,0.35)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(128, y + 3);
        ctx.quadraticCurveTo(128 + s * len * 0.45, y - 14, 128 + s * len, y - 40); ctx.stroke();
        for (let k = 1; k < 4; k++) {
          const t = k / 4, px = 128 + s * len * t, py = y - 44 * t * t - 4;
          ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + s * 6, py + 14); ctx.stroke();
        }
      }
    }
    // Midrib.
    ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(128, 250); ctx.quadraticCurveTo(122, 128, 128, 10); ctx.stroke();
    ctx.restore();
    // Darker rim.
    ctx.strokeStyle = "rgba(50,70,130,0.9)"; ctx.lineWidth = 3; ctx.stroke(leaf);
  });
}

function barkTexture() {
  return canvasTexture(256, 512, ctx => {
    const rnd = mulberry(3);
    ctx.fillStyle = "#3a4152"; ctx.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * 256, w = 1 + rnd() * 5, light = rnd() < 0.35;
      ctx.strokeStyle = light ? `rgba(150,165,195,${0.1 + rnd() * 0.2})` : `rgba(8,10,18,${0.25 + rnd() * 0.4})`;
      ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, -10);
      for (let y = 0; y <= 520; y += 40) ctx.lineTo(x + Math.sin(y * 0.02 + i) * 6 + (rnd() - 0.5) * 4, y);
      ctx.stroke();
    }
    for (let i = 0; i < 1200; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.2})`;
      ctx.fillRect(rnd() * 256, rnd() * 512, 1 + rnd() * 3, 1 + rnd() * 6);
    }
  });
}

function rockTexture() {
  return canvasTexture(512, 512, ctx => {
    const img = ctx.createImageData(512, 512);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
      const n = fbm3(x * 0.02, y * 0.02, 1.7, 5), m = fbm3(x * 0.09, y * 0.09, 9.1, 3);
      const v = 60 + n * 90 + (m - 0.5) * 50, i = (y * 512 + x) * 4;
      img.data[i] = v * 0.82; img.data[i + 1] = v * 0.88; img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
}

/* ---------- geometry builders ---------- */

function rockGeometry(seed: number) {
  const g = new THREE.IcosahedronGeometry(1, 5), p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const big = fbm3(v.x * 1.4 + seed, v.y * 1.4, v.z * 1.4, 4), fine = fbm3(v.x * 6 + seed, v.y * 6, v.z * 6, 3);
    // Sharp-ish ridges: fold the noise, then flatten the underside so rocks sit on the ground.
    const ridge = 1 - Math.abs(fbm3(v.x * 2.6 + seed * 2, v.y * 2.6, v.z * 2.6, 3) * 2 - 1);
    const r = 0.78 + big * 0.45 + ridge * 0.12 + (fine - 0.5) * 0.08;
    v.multiplyScalar(r);
    if (v.y < -0.25) v.y = -0.25 + (v.y + 0.25) * 0.3;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A tube whose radius tapers from r0 to r1 along the curve. */
function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, segs: number, radial: number, flare = 0) {
  const frames = curve.computeFrenetFrames(segs, false), len = curve.getLength();
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const r = r0 + (r1 - r0) * t + flare * Math.pow(1 - t, 6);
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * TAU;
      N.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r);
      nor.push(N.x, N.y, N.z);
      uv.push(j / radial, t * len * 0.35);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/* ---------- shaders ---------- */

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){ vDir=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }`;
const SKY_FRAG = /* glsl */ `
uniform float uTime; uniform vec3 uMoon;
varying vec3 vDir;
${TO_LINEAR}
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<6;i++){ v+=a*n2(p); p=p*2.02+vec2(3.1,1.7); a*=0.5; } return v; }
void main(){
  vec3 d=normalize(vDir); float y=d.y;
  vec3 col=mix(vec3(0.10,0.17,0.36),vec3(0.012,0.02,0.055),smoothstep(-0.02,0.55,y));
  col=mix(col,vec3(0.035,0.06,0.14),smoothstep(0.0,-0.2,y));
  float md=max(dot(d,uMoon),0.0);
  col+=vec3(0.30,0.45,0.85)*pow(md,40.0)*0.35+vec3(0.2,0.3,0.6)*pow(md,6.0)*0.12;
  // Stars, hidden by clouds.
  vec2 sc=floor(d.xz/(y+1.0)*260.0+d.y*37.0); float st=step(0.9975,h2(sc))*smoothstep(0.05,0.35,y);
  // Clouds: fbm on a plane above the camera, lit from the moon side.
  vec2 cp=d.xz/(y+0.12)*0.9+vec2(uTime*0.004,uTime*0.002);
  float c=fbm(cp*1.3); float c2=fbm(cp*3.1+4.0);
  float mask=smoothstep(0.42,0.8,c*0.75+c2*0.35)*smoothstep(0.0,0.18,y);
  vec3 cloud=mix(vec3(0.05,0.08,0.19),vec3(0.23,0.33,0.62),pow(md,3.0)*0.8+c2*0.35);
  col+=vec3(0.75,0.85,1.0)*st*(0.5+0.5*sin(uTime*2.0+sc.x))*(1.0-mask);
  col=mix(col,cloud,mask*0.9);
  col+=vec3(0.95,0.97,1.0)*smoothstep(0.99955,0.9997,md)*(1.0-mask*0.6);
  gl_FragColor=vec4(toLinear(col),1.0);
}`;

const WATER_VERT = /* glsl */ `
uniform mat4 textureMatrix;
varying vec4 vUv; varying vec3 vWorld;
void main(){ vUv=textureMatrix*vec4(position,1.0); vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const WATER_FRAG = /* glsl */ `
uniform vec3 color; uniform sampler2D tDiffuse; uniform float uTime; uniform vec3 uFog; uniform float uFogDensity;
varying vec4 vUv; varying vec3 vWorld;
${TO_LINEAR}
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec2 w=vWorld.xz;
  vec2 rip=vec2(n2(w*0.9+vec2(uTime*0.35,0.0))-0.5, n2(w*0.9+vec2(0.0,uTime*0.3)+7.0)-0.5)
          +vec2(n2(w*3.1-uTime*0.6)-0.5, n2(w*2.7+uTime*0.5+3.0)-0.5)*0.4;
  vec4 uv=vUv; uv.xy+=rip*0.045*uv.w;
  vec3 refl=texture2DProj(tDiffuse,uv).rgb;
  vec3 V=normalize(cameraPosition-vWorld);
  float fres=0.35+0.65*pow(1.0-max(V.y,0.0),4.0);
  vec3 deep=toLinear(color);
  vec3 col=mix(deep,refl*0.82,fres);
  col+=toLinear(vec3(0.25,0.4,0.8))*pow(max(rip.x+rip.y,0.0),6.0)*0.3;
  float dist=length(cameraPosition-vWorld); float f=1.0-exp(-uFogDensity*uFogDensity*dist*dist);
  gl_FragColor=vec4(mix(col,toLinear(uFog),f),1.0);
}`;

const GRASS_VERT = /* glsl */ `
uniform float uTime; uniform float uFogDensity;
attribute vec3 aOffset; attribute vec4 aParams;
varying float vY; varying float vVar; varying float vFog; varying float vShade;
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float n2(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }
void main(){
  vec3 p=position; float h=aParams.x;
  p.y*=h; p.x*=0.8+aParams.w*0.6;
  float c=cos(aParams.y), s=sin(aParams.y);
  p=vec3(p.x*c,p.y,p.x*s);
  vec2 wp=aOffset.xz;
  // Rolling wind waves across the field plus per-blade flutter.
  float wave=n2(wp*0.07+vec2(uTime*0.28,uTime*0.12));
  float gust=sin(uTime*1.3+wp.x*0.22+wp.y*0.12)*0.5+0.5;
  float flutter=sin(uTime*4.0+aParams.y*9.0)*0.06;
  float bend=(wave*0.8+gust*0.45+aParams.z+flutter)*position.y*position.y;
  p.x+=bend*0.55*h; p.z+=bend*0.3*h; p.y-=bend*bend*0.18*h;
  vec4 mv=viewMatrix*vec4(p+aOffset,1.0);
  gl_Position=projectionMatrix*mv;
  vY=position.y; vVar=aParams.w; vShade=0.7+wave*0.45;
  vFog=1.0-exp(-uFogDensity*uFogDensity*mv.z*mv.z);
}`;
const GRASS_FRAG = /* glsl */ `
uniform vec3 uBase; uniform vec3 uTip; uniform vec3 uTip2; uniform vec3 uFog;
varying float vY; varying float vVar; varying float vFog; varying float vShade;
${TO_LINEAR}
void main(){
  vec3 tip=mix(uTip,uTip2,vVar);
  vec3 col=mix(uBase,tip,pow(vY,1.4))*vShade;
  gl_FragColor=vec4(mix(toLinear(col),toLinear(uFog),vFog),1.0);
}`;

const FLY_VERT = /* glsl */ `
uniform float uTime; uniform float uPixelRatio; attribute float aSeed; varying float vA;
void main(){
  vec3 p=position+vec3(sin(uTime*0.4+aSeed*20.0),sin(uTime*0.7+aSeed*13.0)*0.6,cos(uTime*0.35+aSeed*9.0))*0.8;
  vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
  vA=0.4+0.6*(0.5+0.5*sin(uTime*(1.5+aSeed*2.0)+aSeed*30.0));
  gl_PointSize=uPixelRatio*(6.0+aSeed*6.0)*(20.0/-mv.z);
}`;
const FLY_FRAG = /* glsl */ `varying float vA; ${TO_LINEAR}
void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; float g=pow(1.0-d*2.0,2.0); gl_FragColor=vec4(toLinear(vec3(0.6,0.85,1.0))*g*vA*1.6,1.0); }`;

function srgbVec(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return new THREE.Vector3((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255);
}

/* ---------- the environment ---------- */

export class Environment {
  readonly group = new THREE.Group();
  private disposables: { dispose(): void }[] = [];
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private water: Reflector;
  private grassMat: THREE.ShaderMaterial;
  private flyMat: THREE.ShaderMaterial;
  private leafTime = { value: 0 };
  private tree = new THREE.Group();

  constructor(scene: THREE.Scene, pixelRatio: number, private opts: EnvOptions) {
    const rnd = mulberry(1337);
    scene.fog = new THREE.FogExp2(new THREE.Color(FOG_HEX), FOG_DENSITY);
    scene.add(this.group);

    // Lights: cold moonlight from behind-left, a dim blue sky/ground fill.
    const moonDir = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();
    const moon = new THREE.DirectionalLight(new THREE.Color("#a9c4ff"), 1.6);
    moon.position.copy(moonDir).multiplyScalar(100);
    this.group.add(moon, new THREE.HemisphereLight(new THREE.Color("#3553a8"), new THREE.Color("#070a16"), 1.1));

    // Sky.
    this.skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, uniforms: { uTime: { value: 0 }, uMoon: { value: moonDir } } });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(600, 48, 24), this.skyMat);
    this.sky.renderOrder = -2; this.sky.frustumCulled = false;
    this.group.add(this.sky);
    this.track(this.skyMat, this.sky.geometry);

    // Terrain.
    const seg = opts.mobile ? 160 : opts.low ? 200 : 256;
    const tg = new THREE.PlaneGeometry(360, 360, seg, seg); tg.rotateX(-Math.PI / 2);
    const tp = tg.attributes.position as THREE.BufferAttribute, cols = new Float32Array(tp.count * 3), c = new THREE.Color();
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), z = tp.getZ(i), h = heightAt(x, z);
      tp.setY(i, h);
      const shore = smooth(-0.6, 0.4, h) * (1 - smooth(1.5, 6, h));
      c.set("#0a1226").lerp(new THREE.Color("#1a2c5e"), shore * 0.7 + fbm3(x * 0.2, 1, z * 0.2) * 0.2);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    tg.setAttribute("color", new THREE.BufferAttribute(cols, 3));
    tg.computeVertexNormals();
    const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    this.group.add(new THREE.Mesh(tg, terrainMat));
    this.track(tg, terrainMat);

    // Lake with a real planar reflection.
    const scale = this.reflectScale();
    this.water = new Reflector(new THREE.CircleGeometry(60, 64), {
      textureWidth: Math.round(innerWidth * pixelRatio * scale), textureHeight: Math.round(innerHeight * pixelRatio * scale), clipBias: 0.003,
      color: 0x000000,
      shader: {
        name: "LakeShader",
        uniforms: { color: { value: srgbVec("#050a1a") }, tDiffuse: { value: null }, textureMatrix: { value: null }, uTime: { value: 0 }, uFog: { value: srgbVec(FOG_HEX) }, uFogDensity: { value: FOG_DENSITY } },
        vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
      },
    });
    (this.water.material as THREE.ShaderMaterial).uniforms.color.value = srgbVec("#050a1a");
    this.water.rotation.x = -Math.PI / 2;
    this.group.add(this.water);
    this.disposables.push({ dispose: () => this.water.dispose() });

    // Grass.
    const bp: number[] = [], bi: number[] = [];
    const rows = 4;
    for (let i = 0; i <= rows; i++) { const y = i / rows, w = 0.075 * (1 - y * 0.9); bp.push(-w, y, 0, w, y, 0); }
    bp.push(0, 1.08, 0);
    for (let i = 0; i < rows; i++) { const a = i * 2; bi.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    bi.push(rows * 2, rows * 2 + 1, rows * 2 + 2);
    const grassGeo = new THREE.InstancedBufferGeometry();
    grassGeo.setAttribute("position", new THREE.Float32BufferAttribute(bp, 3));
    grassGeo.setIndex(bi);
    const count = opts.mobile ? 22000 : opts.low ? 38000 : 70000, off = new Float32Array(count * 3), par = new Float32Array(count * 4);
    let placed = 0, guard = 0;
    const islandBlades = Math.round(count * 0.06);
    while (placed < count && guard++ < count * 6) {
      let x: number, z: number;
      if (placed < islandBlades) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()) * ISLAND.radius;
        x = ISLAND.x + Math.cos(a) * r; z = ISLAND.z + Math.sin(a) * r;
      } else {
        const th = rnd() * TAU, d = lakeRadius(th) + 0.2 + Math.pow(rnd(), 1.5) * 55;
        x = Math.cos(th) * d; z = Math.sin(th) * d;
      }
      const h = heightAt(x, z), d = Math.hypot(x, z);
      if (h < 0.03) continue;
      off.set([x, h - 0.05, z], placed * 3);
      par.set([0.55 + rnd() * 0.75 + smooth(26, 70, d) * 0.8, rnd() * TAU, (rnd() - 0.5) * 0.5, rnd()], placed * 4);
      placed++;
    }
    grassGeo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(off, 3));
    grassGeo.setAttribute("aParams", new THREE.InstancedBufferAttribute(par, 4));
    grassGeo.instanceCount = placed;
    this.grassMat = new THREE.ShaderMaterial({
      vertexShader: GRASS_VERT, fragmentShader: GRASS_FRAG, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uFogDensity: { value: FOG_DENSITY }, uFog: { value: srgbVec(FOG_HEX) }, uBase: { value: srgbVec("#050b1e") }, uTip: { value: srgbVec("#2f6bff") }, uTip2: { value: srgbVec("#5fcfff") } },
    });
    const grass = new THREE.Mesh(grassGeo, this.grassMat); grass.frustumCulled = false;
    // Grass is the heaviest thing in the scene; leave it out of the reflection pass.
    grass.layers.set(NO_REFLECT_LAYER);
    this.group.add(grass);
    this.track(grassGeo, this.grassMat);

    // Rocks: tall spires and boulders along the far shores, a few standing in the water.
    const rockTex = rockTexture(); rockTex.wrapS = rockTex.wrapT = THREE.RepeatWrapping; rockTex.repeat.set(2, 2);
    const rockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#5b6784"), map: rockTex, bumpMap: rockTex, bumpScale: 2.5, roughness: 0.92, metalness: 0 });
    const rockGeos = [0, 1, 2, 3, 4].map(s => rockGeometry(s * 13.7));
    this.track(rockMat, rockTex, ...rockGeos);
    for (let i = 0; i < 34; i++) {
      const b = -0.7 + rnd() * 3.7;
      if (Math.abs(b) < 0.14) continue; // keep the hero view clear behind the wordmark
      const spire = rnd() < 0.45, inWater = !spire && rnd() < 0.3;
      const pt = shorePoint(b, inWater ? -1.5 - rnd() * 2 : 0.5 + rnd() * 7);
      const sx = spire ? 1.2 + rnd() * 1.6 : 1.4 + rnd() * 2.2;
      const sy = spire ? 3.5 + rnd() * 5.5 : sx * (0.55 + rnd() * 0.4);
      const m = new THREE.Mesh(rockGeos[i % rockGeos.length], rockMat);
      m.scale.set(sx, sy, sx * (0.8 + rnd() * 0.5));
      m.position.set(pt.x, Math.min(heightAt(pt.x, pt.z), 0.1) + sy * 0.22, pt.z);
      m.rotation.set((rnd() - 0.5) * 0.25, rnd() * TAU, (rnd() - 0.5) * 0.25);
      this.group.add(m);
    }

    // A few boulders around the island edge.
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + rnd() * 0.8, r = ISLAND.radius * (0.55 + rnd() * 0.25), sx = 0.9 + rnd() * 1.1;
      const x = ISLAND.x + Math.cos(a) * r, z = ISLAND.z + Math.sin(a) * r;
      const m = new THREE.Mesh(rockGeos[(i + 2) % rockGeos.length], rockMat);
      m.scale.set(sx, sx * (0.5 + rnd() * 0.4), sx);
      m.position.set(x, heightAt(x, z) + sx * 0.1, z);
      m.rotation.y = rnd() * TAU;
      this.group.add(m);
    }

    const islandCenter = new THREE.Vector3(ISLAND.x, 0, ISLAND.z);
    this.buildTree(islandCenter, rnd);

    // Fireflies drifting over the grass near the tree.
    const flyCount = opts.mobile ? 40 : 90, fp = new Float32Array(flyCount * 3), fs = new Float32Array(flyCount);
    const tp0 = islandCenter;
    for (let i = 0; i < flyCount; i++) {
      const a = rnd() * TAU, r = 2 + rnd() * 16;
      const x = tp0.x + Math.cos(a) * r, z = tp0.z + Math.sin(a) * r;
      fp.set([x, Math.max(heightAt(x, z), 0) + 0.6 + rnd() * 4, z], i * 3); fs[i] = rnd();
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(fp, 3)); fg.setAttribute("aSeed", new THREE.BufferAttribute(fs, 1));
    this.flyMat = new THREE.ShaderMaterial({ vertexShader: FLY_VERT, fragmentShader: FLY_FRAG, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, uniforms: { uTime: { value: 0 }, uPixelRatio: { value: pixelRatio } } });
    const flies = new THREE.Points(fg, this.flyMat); flies.frustumCulled = false;
    this.group.add(flies);
    this.track(fg, this.flyMat);
  }

  private buildTree(base: THREE.Vector3, rnd: () => number) {
    const branches: THREE.BufferGeometry[] = [], tips: { p: THREE.Vector3; d: THREE.Vector3 }[] = [];
    const MAX = this.opts.mobile ? 4 : 5, up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
    const grow = (start: THREE.Vector3, dir: THREE.Vector3, len: number, radius: number, depth: number) => {
      const pts = [start.clone()], d = dir.clone(), n = 5;
      let p = start.clone();
      for (let i = 1; i <= n; i++) {
        d.add(tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.28)).addScaledVector(up, 0.07 - depth * 0.004).normalize();
        p = p.clone().addScaledVector(d, len / n); pts.push(p);
      }
      const curve = new THREE.CatmullRomCurve3(pts), r1 = radius * 0.62;
      branches.push(taperedTube(curve, radius, r1, depth < 2 ? 10 : 6, depth < 2 ? 12 : depth < 4 ? 7 : 5, depth === 0 ? 0.55 : 0));
      if (depth >= MAX) { for (let i = 2; i < pts.length; i++) tips.push({ p: pts[i], d: d.clone() }); return; }
      if (depth >= MAX - 2) for (let i = 3; i < pts.length; i++) tips.push({ p: pts[i], d: d.clone() });
      const kids = depth === 0 ? 4 : 2 + (rnd() < 0.55 ? 1 : 0);
      for (let k = 0; k < kids; k++) {
        const along = depth === 0 ? 0.55 + k / kids * 0.4 : 0.6 + rnd() * 0.4;
        const from = curve.getPointAt(along);
        const axis = tmp.set(rnd() - 0.5, 0, rnd() - 0.5).cross(d).normalize();
        if (axis.lengthSq() < 1e-4) axis.set(1, 0, 0);
        const cd = d.clone().applyAxisAngle(axis, 0.45 + rnd() * 0.45).applyAxisAngle(d, k / kids * TAU + rnd());
        grow(from, cd, len * (0.7 + rnd() * 0.1), radius * (depth === 0 ? 0.55 : 0.68) * (1 - along * 0.25), depth + 1);
      }
    };
    grow(new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0.08, 1, 0.04).normalize(), 4.6, 0.5, 0);

    const barkTex = barkTexture(); barkTex.wrapS = barkTex.wrapT = THREE.RepeatWrapping;
    const barkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#6d7896"), map: barkTex, bumpMap: barkTex, bumpScale: 3, roughness: 0.95 });
    const wood = mergeGeometries(branches);
    branches.forEach(g => g.dispose());
    this.tree.add(new THREE.Mesh(wood, barkMat));

    // Leaves: slightly cupped quads with a painted leaf texture, tinted per instance, fluttering in the wind.
    const leafGeo = new THREE.PlaneGeometry(0.55, 1, 1, 4); leafGeo.translate(0, 0.5, 0);
    const lp = leafGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < lp.count; i++) { const y = lp.getY(i), x = lp.getX(i); lp.setZ(i, -0.14 * y * y + Math.abs(x) * 0.18); }
    leafGeo.computeVertexNormals();
    const leafTex = leafTexture();
    const leafMat = new THREE.MeshStandardMaterial({
      map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55, metalness: 0,
      bumpMap: leafTex, bumpScale: 1.5, emissive: new THREE.Color("#2a55d6"), emissiveMap: leafTex, emissiveIntensity: 0.55,
    });
    const time = this.leafTime;
    leafMat.onBeforeCompile = shader => {
      shader.uniforms.uTime = time;
      shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
        float ph = ip.x * 1.7 + ip.y * 2.3 + ip.z * 1.3;
        transformed.z += sin(uTime * 2.6 + ph) * 0.09 * position.y;
        transformed.x += sin(uTime * 1.9 + ph * 1.3) * 0.05 * position.y;
      #endif`);
    };
    const per = this.opts.mobile ? 40 : this.opts.low ? 45 : 55, total = tips.length * per;
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, total);
    const o = new THREE.Object3D(), center = new THREE.Vector3(0, 7, 0), out = new THREE.Vector3(), col = new THREE.Color();
    const palette = ["#2f5fe0", "#4f8dff", "#6cc8ff", "#6d63ff", "#3a7bff", "#9ad8ff"].map(h => new THREE.Color(h));
    let li = 0;
    for (const t of tips) for (let k = 0; k < per; k++) {
      out.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(0.25 + rnd() * 0.9);
      o.position.copy(t.p).add(out);
      out.copy(o.position).sub(center).normalize().add(tmp.set(0, 0.6, 0)).add(t.d).normalize();
      o.lookAt(tmp.copy(o.position).add(out));
      o.rotateX(-Math.PI / 2 + (rnd() - 0.5) * 0.9); o.rotateY((rnd() - 0.5) * 2.4); o.rotateZ((rnd() - 0.5) * 0.8);
      o.scale.setScalar(0.32 + rnd() * 0.22);
      o.updateMatrix();
      leaves.setMatrixAt(li, o.matrix);
      col.copy(palette[Math.floor(rnd() * palette.length)]).lerp(palette[Math.floor(rnd() * palette.length)], rnd());
      leaves.setColorAt(li, col);
      li++;
    }
    leaves.frustumCulled = false;
    this.tree.add(leaves);
    this.tree.position.set(base.x, heightAt(base.x, base.z), base.z);
    this.tree.scale.setScalar(0.78);
    this.group.add(this.tree);
    this.track(wood, barkMat, barkTex, leafGeo, leafMat, leafTex, leaves);
  }

  private track(...items: { dispose(): void }[]) { this.disposables.push(...items); }

  update(time: number, camera: THREE.Camera) {
    this.sky.position.copy(camera.position);
    this.skyMat.uniforms.uTime.value = time;
    (this.water.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    const t = this.opts.reduced ? 0 : time;
    this.grassMat.uniforms.uTime.value = t;
    this.flyMat.uniforms.uTime.value = t;
    this.leafTime.value = t;
    this.tree.rotation.z = Math.sin(t * 0.5) * 0.006;
  }

  private reflectScale() { return this.opts.mobile || this.opts.low ? 0.35 : 0.5; }

  resize(w: number, h: number, pixelRatio: number) {
    const s = this.reflectScale();
    this.water.getRenderTarget().setSize(Math.round(w * pixelRatio * s), Math.round(h * pixelRatio * s));
  }

  dispose() {
    this.disposables.forEach(d => d.dispose());
    this.group.removeFromParent();
  }
}
