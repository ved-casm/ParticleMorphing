/**
 * Utility to generate or load uniform spherical landmass particles for the 3D globe.
 * Uses spherical Fibonacci distribution and Ray-casting Point-in-Polygon
 * matching ThreeGlobe's exact spherical projection (R = 100).
 */

import precomputedPoints from "@/data/continent-points.json";

export interface GlobeParticlesData {
  positions: Float32Array;
  seeds: Float32Array;
  count: number;
}

export function getContinentParticles(): GlobeParticlesData {
  const count = precomputedPoints.length / 3;
  const positions = new Float32Array(precomputedPoints);
  const seeds = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // Deterministic pseudo-random seed between 0.0 and 1.0 for each particle
    seeds[i] = ((i * 2654435761) ^ (i >> 3)) % 1000 / 1000;
  }

  return {
    positions,
    seeds,
    count,
  };
}
