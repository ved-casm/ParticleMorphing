"use client";

import { useEffect, useRef } from "react";

/**
 * A tiny live preview of each version, rendered into a low-resolution canvas and scaled
 * up with `image-rendering: pixelated`. Hovering the card raises the resolution in steps,
 * so the pixels "resolve" toward the real thing.
 */

export type Variant = "globe" | "morph" | "depth";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
// Fine pixels by default (crisp, not 8-bit chunky); hovering resolves further.
const LOW = 112, HIGH = 200;

function hash(x: number, y: number) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Version 1: a dotted globe, sage on near-black, slowly turning.
function drawGlobe(px: Uint8ClampedArray, w: number, h: number, t: number) {
  const r = Math.min(w, h) * 0.38, cx = w / 2, cy = h * 0.52, rot = t * 0.25;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, d2 = dx * dx + dy * dy;
    let c = [8, 10, 9];
    if (d2 < 1) {
      const z = Math.sqrt(1 - d2), lon = Math.atan2(dx, z) + rot, lat = Math.asin(-dy);
      const land = noise(lon * 2.2 + 10, lat * 3.2) * 0.65 + noise(lon * 5, lat * 6) * 0.35;
      const light = 0.45 + 0.55 * z;
      const dot = (x + y) % 2 === 0;
      if (land > 0.52 && dot) c = [173 * light, 186 * light, 172 * light];
      else if (dot && hash(x, y) > 0.86) c = [40, 52, 44];
      else c = [12, 17, 14];
    } else if (d2 < 1.12) c = [26 * (1.12 - d2) / 0.12 + 8, 36 * (1.12 - d2) / 0.12 + 10, 30 * (1.12 - d2) / 0.12 + 9];
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255;
  }
}

// Version 2: blue particles morphing sphere -> cube -> heart.
const MORPH_N = 3200;
const SEEDS = Array.from({ length: MORPH_N }, (_, i) => [hash(i, 1), hash(i, 2), hash(i, 3)]);
function shapePoint(kind: number, s: number[]): [number, number, number] {
  const [a, b, c] = s;
  if (kind === 0) { const th = a * 6.2832, ph = Math.acos(2 * b - 1); return [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)]; }
  if (kind === 1) { const f = Math.floor(c * 6), u = a * 2 - 1, v = b * 2 - 1, p: [number, number, number] = [0, 0, 0]; p[f >> 1] = f & 1 ? -0.8 : 0.8; p[((f >> 1) + 1) % 3] = u * 0.8; p[((f >> 1) + 2) % 3] = v * 0.8; return p; }
  return HEART[Math.floor(a * HEART.length) % HEART.length].map((v, i) => i === 2 ? (c - 0.5) * 0.4 : v) as [number, number, number];
}
// Area-filled heart from the implicit curve (x² + y² − 1)³ − x²y³ ≤ 0, sampled once.
const HEART: [number, number, number][] = [];
for (let i = 0; HEART.length < 1200; i++) {
  const x = (hash(i, 7) * 2 - 1) * 1.2, y = hash(i, 9) * 2.5 - 1.2, q = x * x + y * y - 1;
  if (q * q * q - x * x * y * y * y <= 0) HEART.push([x * 0.78, -(y - 0.1) * 0.78, 0]);
}
function drawMorph(px: Uint8ClampedArray, w: number, h: number, t: number, acc: Float32Array) {
  acc.fill(0);
  const cyc = t / 2.6, from = Math.floor(cyc) % 3, to = (from + 1) % 3, f = Math.min(1, Math.max(0, (cyc % 1 - 0.55) / 0.45));
  const e = f * f * (3 - 2 * f), rot = t * 0.5, cr = Math.cos(rot), sr = Math.sin(rot), sc = Math.min(w, h) * 0.34;
  for (let i = 0; i < MORPH_N; i++) {
    const s = SEEDS[i], p0 = shapePoint(from, s), p1 = shapePoint(to, s), lift = Math.sin(e * Math.PI) * 0.35 * (s[2] - 0.5);
    const x = p0[0] + (p1[0] - p0[0]) * e + lift, y = p0[1] + (p1[1] - p0[1]) * e, z = p0[2] + (p1[2] - p0[2]) * e;
    const rx = x * cr - z * sr, rz = x * sr + z * cr;
    const X = Math.round(w / 2 + rx * sc), Y = Math.round(h * 0.5 + y * sc);
    if (X >= 0 && X < w && Y >= 0 && Y < h) acc[Y * w + X] += 0.75 + 0.5 * (rz + 1) / 2;
  }
  for (let j = 0; j < w * h; j++) {
    const v = Math.min(1, acc[j]), i = j * 4;
    px[i] = 5 + 70 * v * v; px[i + 1] = 8 + 150 * v + 40 * v * v; px[i + 2] = 18 + 237 * v; px[i + 3] = 255;
  }
}

// Version 3: the depth clip, ordered-dithered into white stipple. Frames come from a small
// sprite atlas (no <video>: browsers won't reliably play a detached, unseen video).
const ATLAS = { src: "/demo1/android-atlas.webp", frames: 30, cols: 6, w: 96, h: 120, fps: 10 };
let probe: CanvasRenderingContext2D | null = null;
function drawDepth(px: Uint8ClampedArray, w: number, h: number, atlas: HTMLImageElement | null, t: number) {
  if (!probe) probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const ctx = probe!;
  ctx.canvas.width = w; ctx.canvas.height = h;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
  if (atlas && atlas.dataset.ready === "1") {
    const f = Math.floor(t * ATLAS.fps) % ATLAS.frames, sx = (f % ATLAS.cols) * ATLAS.w, sy = Math.floor(f / ATLAS.cols) * ATLAS.h;
    // Cover-fit the portrait frame into the card.
    const scale = Math.max(w / ATLAS.w, h / ATLAS.h), dw = ATLAS.w * scale, dh = ATLAS.h * scale;
    ctx.drawImage(atlas, sx, sy, ATLAS.w, ATLAS.h, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }
  const src = ctx.getImageData(0, 0, w, h).data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, v = src[i] / 255, on = v > 0.08 && v * 0.95 > BAYER[(y & 3) * 4 + (x & 3)] * 0.9;
    const g = on ? 150 + 105 * v : 5;
    px[i] = g; px[i + 1] = g; px[i + 2] = g; px[i + 3] = 255;
  }
}

export default function PixelPreview({ variant, active }: { variant: Variant; active: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let atlas: HTMLImageElement | null = null;
    if (variant === "depth") {
      const img = new Image();
      img.onload = () => { img.dataset.ready = "1"; };
      // If the atlas can't load, fall back to the still poster so the card is never blank.
      img.onerror = () => { if (!img.src.endsWith(".avif")) img.src = "/demo1/poster/android.avif"; };
      img.src = ATLAS.src;
      atlas = img;
    }
    let cols = LOW, raf = 0, visible = true, last = 0, t = 0;
    let acc = new Float32Array(1);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || now - last < 42) return; // ~24 fps is plenty for a preview
      const dt = last ? (now - last) / 1000 : 0;
      last = now;
      if (!reduced) t += dt;
      // Step the resolution toward the target: a quick "resolve" on hover.
      const target = activeRef.current ? HIGH : LOW;
      if (cols !== target) cols += Math.sign(target - cols) * Math.max(1, Math.round(Math.abs(target - cols) * 0.35));
      const rows = Math.max(8, Math.round(cols * (el.clientHeight || 5) / (el.clientWidth || 4)));
      if (el.width !== cols || el.height !== rows) { el.width = cols; el.height = rows; acc = new Float32Array(cols * rows); }
      const img = ctx.createImageData(cols, rows);
      if (variant === "globe") drawGlobe(img.data, cols, rows, t);
      else if (variant === "morph") drawMorph(img.data, cols, rows, t, acc);
      else drawDepth(img.data, cols, rows, atlas, t);
      ctx.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); io.disconnect(); };
  }, [variant]);

  return <canvas ref={canvas} className="vh-canvas" aria-hidden="true" />;
}
