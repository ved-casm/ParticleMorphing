/**
 * Target point clouds for the particle morph.
 * Every builder returns `count * 4` floats: xyz = target position, w = per-particle hash (0..1)
 * used by the simulation to stagger the morph. All shapes fit roughly inside a radius of ~3.3.
 */

export type ShapeKey = "logo" | "globe" | "helix" | "cube" | "heart" | "sphere" | "torus" | "knot" | "galaxy" | "text";

export const SHAPES: { key: Exclude<ShapeKey, "text">; label: string; spin: number; tilt?: number; accent: string }[] = [
  { key: "logo", label: "Wordmark", spin: 0, accent: "#4f8dff" },
  { key: "globe", label: "Globe", spin: 0.22, tilt: 0.3, accent: "#5ee7ff" },
  { key: "helix", label: "Helix", spin: 0.35, tilt: 0.08, accent: "#6f8bff" },
  { key: "cube", label: "Cube", spin: 0, accent: "#3f7bff" },
  { key: "heart", label: "Heart", spin: 0, accent: "#8a7dff" },
  { key: "sphere", label: "Sphere", spin: 0.12, tilt: 0.2, accent: "#4fb4ff" },
  { key: "torus", label: "Ring", spin: 0, accent: "#6ad1ff" },
  { key: "knot", label: "Knot", spin: 0, accent: "#5a6dff" },
  { key: "galaxy", label: "Galaxy", spin: 0.16, tilt: 0.85, accent: "#9ec9ff" },
];

const TAU = Math.PI * 2;
const rand = Math.random;

/** Every particle belongs to the shape; nothing floats loose around it. */
function points(count: number, fill: (out: Float32Array, i: number) => void) {
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) { fill(out, i); out[i * 4 + 3] = rand(); }
  return out;
}

function set(out: Float32Array, i: number, x: number, y: number, z: number) {
  out[i * 4] = x; out[i * 4 + 1] = y; out[i * 4 + 2] = z;
}

export function sphere(count: number, r = 2.6) {
  return points(count, (o, i) => {
    const t = rand() * TAU, p = Math.acos(2 * rand() - 1), d = r * Math.pow(rand(), 0.22);
    set(o, i, d * Math.sin(p) * Math.cos(t), d * Math.sin(p) * Math.sin(t), d * Math.cos(p));
  });
}

export function cube(count: number, s = 3.6) {
  const h = s / 2;
  return points(count, (o, i) => {
    const face = Math.floor(rand() * 6), a = (rand() - 0.5) * s, b = (rand() - 0.5) * s, j = (rand() - 0.5) * 0.12;
    const axis = face >> 1, sign = face & 1 ? -1 : 1, v = [0, 0, 0];
    v[axis] = sign * h + j; v[(axis + 1) % 3] = a; v[(axis + 2) % 3] = b;
    set(o, i, v[0], v[1], v[2]);
  });
}

export function torus(count: number, R = 2.3, r = 0.7) {
  return points(count, (o, i) => {
    const u = rand() * TAU, v = rand() * TAU, d = r * Math.pow(rand(), 0.3);
    set(o, i, (R + d * Math.cos(v)) * Math.cos(u), (R + d * Math.cos(v)) * Math.sin(u), d * Math.sin(v));
  });
}

export function heart(count: number, s = 2.35) {
  return points(count, (o, i) => {
    // Rejection-sample the implicit heart (x² + y² − 1)³ − x²y³ ≤ 0 and puff it up in z.
    let x = 0, y = 0;
    for (;;) {
      x = (rand() * 2 - 1) * 1.2; y = rand() * 2.5 - 1.2;
      const q = x * x + y * y - 1;
      if (q * q * q - x * x * y * y * y <= 0) break;
    }
    const depth = 0.62 * Math.sqrt(Math.max(0, 1 - (x * x + (y - 0.15) * (y - 0.15)) / 1.7));
    set(o, i, x * s, (y - 0.1) * s, (rand() * 2 - 1) * depth * s * Math.pow(rand(), 0.35));
  });
}

export function knot(count: number, p = 2, q = 3, s = 1.05) {
  const curve = (t: number) => {
    const r = 2 + Math.cos(q * t);
    return [r * Math.cos(p * t) * s, r * Math.sin(p * t) * s, -Math.sin(q * t) * s];
  };
  return points(count, (o, i) => {
    const t = rand() * TAU, a = curve(t), b = curve(t + 1e-3);
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const tl = Math.hypot(tx, ty, tz); tx /= tl; ty /= tl; tz /= tl;
    // Frame around the tangent: n = normalize(t × z), bn = t × n
    let nx = ty, ny = -tx;
    const nz = 0;
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
    const ang = rand() * TAU, rr = 0.42 * Math.pow(rand(), 0.35), c = Math.cos(ang) * rr, sn = Math.sin(ang) * rr;
    set(o, i, a[0] + nx * c + bx * sn, a[1] + ny * c + by * sn, a[2] + nz * c + bz * sn);
  });
}

export function galaxy(count: number, R = 3.4, arms = 3) {
  return points(count, (o, i) => {
    const r = Math.pow(rand(), 0.8) * R, arm = Math.floor(rand() * arms) / arms * TAU;
    const a = arm + r * 1.35 + (rand() - 0.5) * (0.5 + r * 0.12), spread = 0.28 * r * 0.25 + 0.05;
    const core = r < 0.6 ? 0.35 * (1 - r / 0.6) : 0;
    set(o, i, Math.cos(a) * r + (rand() - 0.5) * spread, (rand() - 0.5) * (0.22 + core) * (1 - r / R * 0.7), Math.sin(a) * r + (rand() - 0.5) * spread);
  });
}

export function helix(count: number, h = 6.4, R = 1.25, turns = 2.2) {
  return points(count, (o, i) => {
    const kind = rand();
    const t = rand(), a = t * turns * TAU, y = (t - 0.5) * h;
    if (kind < 0.78) {
      // Two strands, half a turn apart, with a soft tube around each.
      const phase = kind < 0.39 ? 0 : Math.PI, j = 0.16 * Math.pow(rand(), 0.4), ja = rand() * TAU;
      set(o, i, Math.cos(a + phase) * R + Math.cos(ja) * j, y + Math.sin(ja) * j, Math.sin(a + phase) * R + Math.sin(ja) * j * 0.6);
    } else {
      // Rungs between the strands at regular intervals.
      const steps = 26, st = Math.round(t * steps) / steps, aa = st * turns * TAU, yy = (st - 0.5) * h, k = rand() * 2 - 1;
      set(o, i, Math.cos(aa) * R * k, yy + (rand() - 0.5) * 0.06, Math.sin(aa) * R * k);
    }
  });
}

/** Rasterise text on a 2D canvas and scatter particles over the filled pixels, extruded in z. */
export function text(count: number, value: string, width = 7.2) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const label = value.trim().slice(0, 14) || "owow";
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-sans").trim() || "Arial";
  const fontSize = 220;
  canvas.width = 2048; canvas.height = 360;
  if (!ctx) return sphere(count);
  ctx.font = `800 ${fontSize}px ${family}, Arial, sans-serif`;
  const measured = Math.min(canvas.width - 40, ctx.measureText(label).width);
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width - 40);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const filled: number[] = [];
  for (let y = 0; y < canvas.height; y += 2) for (let x = 0; x < canvas.width; x += 2) if (data[(y * canvas.width + x) * 4 + 3] > 140) filled.push(x, y);
  if (!filled.length) return sphere(count);
  const scale = width / Math.max(measured, 1);
  return points(count, (o, i) => {
    const k = Math.floor(rand() * (filled.length / 2)) * 2;
    set(o, i, (filled[k] - canvas.width / 2 + rand() * 2) * scale, -(filled[k + 1] - canvas.height / 2 + rand() * 2) * scale, (rand() - 0.5) * 0.7);
  });
}

/** The same precomputed landmass points the home-page globe uses (radius 100), rescaled. */
export async function globe(count: number, R = 2.7) {
  const pts = (await import("@/data/continent-points.json")).default as number[];
  const land = pts.length / 3, k = R / 100;
  return points(count, (o, i) => {
    const roll = rand();
    if (roll < 0.68) {
      const j = Math.floor(rand() * land) * 3, jit = 1 + (rand() - 0.5) * 0.02;
      set(o, i, pts[j] * k * jit, pts[j + 1] * k * jit, pts[j + 2] * k * jit);
    } else {
      // Sparse ocean shell so the globe still reads as a sphere.
      const t = rand() * TAU, p = Math.acos(2 * rand() - 1), r = R * 0.97;
      set(o, i, r * Math.sin(p) * Math.cos(t), r * Math.cos(p), r * Math.sin(p) * Math.sin(t));
    }
  });
}

export async function buildShape(key: Exclude<ShapeKey, "text">, count: number): Promise<Float32Array> {
  switch (key) {
    case "logo": return text(count, "owow");
    case "globe": return globe(count);
    case "helix": return helix(count);
    case "cube": return cube(count);
    case "heart": return heart(count);
    case "sphere": return sphere(count);
    case "torus": return torus(count);
    case "knot": return knot(count);
    case "galaxy": return galaxy(count);
  }
}
