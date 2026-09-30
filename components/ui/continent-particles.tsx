"use client";

import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { getContinentParticles } from "@/lib/generate-globe-particles";

export interface ContinentParticlesProps {
  pointSize?: number;
  particleColor?: string;
  hoverColor?: string;
  cursorRadius?: number;
  repelStrength?: number;
  opacity?: number;
  globeRadius?: number;
}

const MAX_RIPPLES = 4;

const vertexShader = /* glsl */ `
  uniform vec3 uMouse;
  uniform float uHover;
  uniform float uRadius;
  uniform float uRepelStrength;
  uniform float uPointSize;
  uniform float uTime;
  uniform vec4 uRipples[${MAX_RIPPLES}]; // xyz: center, w: startTime

  attribute float aSeed;

  varying float vHover;
  varying float vRipple;
  varying float vSeed;

  void main() {
    vSeed = aSeed;
    vec3 orig = position;
    vec3 normal = normalize(orig);

    // 1. Interactive Cursor Repulsion (React Bits Bulge/Repel Physics)
    float d = distance(orig, uMouse);
    float repelForce = 0.0;
    vec3 repelOffset = vec3(0.0);

    if (uHover > 0.001 && d < uRadius) {
      float t = 1.0 - (d / uRadius);
      // Quadratic push force (smooth falloff towards edge)
      repelForce = t * t * uRepelStrength * uHover;

      // Calculate tangent vector along the sphere surface pointing away from mouse
      vec3 diff = orig - uMouse;
      vec3 tangentPush = diff - dot(diff, normal) * normal;
      float len = length(tangentPush);
      if (len > 0.001) {
        tangentPush = tangentPush / len;
      } else {
        tangentPush = vec3(0.0, 1.0, 0.0);
      }

      // Displace outward along sphere tangent + subtle radial dome crest
      repelOffset = tangentPush * repelForce + normal * (repelForce * 0.4);
    }
    vHover = (d < uRadius && uHover > 0.001) ? (1.0 - (d / uRadius)) * uHover : 0.0;

    // 2. Interactive Water-Drop Ripple Physics (Click/Tap Waves)
    float totalRipple = 0.0;
    vec3 rippleOffset = vec3(0.0);

    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      float startTime = uRipples[i].w;
      if (startTime > 0.0) {
        float age = uTime - startTime;
        if (age > 0.0 && age < 3.0) {
          vec3 rCenter = uRipples[i].xyz;
          float rDist = distance(orig, rCenter);
          float waveSpeed = 65.0; // propagation speed across globe
          float waveFront = age * waveSpeed;
          float delta = rDist - waveFront;
          float waveWidth = 14.0;

          // Gaussian wave packet envelope
          float envelope = exp(- (delta * delta) / (waveWidth * waveWidth));
          // Exponential time decay
          float decay = exp(-age * 1.4);
          float wave = sin(delta * 0.35) * envelope * decay * 5.0;

          rippleOffset += normal * wave;
          totalRipple += envelope * decay;
        }
      }
    }
    vRipple = clamp(totalRipple, 0.0, 1.0);

    // Final displaced position
    vec3 displaced = orig + repelOffset + rippleOffset;

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Perspective point sizing with organic seed variation
    float sizeFactor = 0.8 + aSeed * 0.45;
    gl_PointSize = (uPointSize * sizeFactor) * (340.0 / -mvPosition.z);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHoverColor;
  uniform float uOpacity;

  varying float vHover;
  varying float vRipple;
  varying float vSeed;

  void main() {
    // Crisp circular anti-aliased dot
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    float alpha = smoothstep(0.5, 0.35, dist);

    // Transition from base color to vibrant hover highlight
    vec3 col = mix(uColor, uHoverColor, clamp(vHover * 1.6, 0.0, 1.0));

    // Water-drop ripple gives a bright wave crest
    if (vRipple > 0.01) {
      col = mix(col, vec3(1.0, 1.0, 1.0), vRipple * 0.85);
    }

    gl_FragColor = vec4(col, alpha * uOpacity);
  }
`;

export function ContinentParticles({
  pointSize = 2.4,
  particleColor = "#cbd5e1", // crisp silver/white default
  hoverColor = "#f97316",    // vibrant orange hover circle (like reference)
  cursorRadius = 28.0,
  repelStrength = 14.0,
  opacity = 0.95,
  globeRadius = 100,
}: ContinentParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { raycaster, camera, pointer, gl } = useThree();

  // Mouse tracking state in local globe coordinates
  const currentMouseLocal = useRef(new THREE.Vector3(0, 0, 1000));
  const targetMouseLocal = useRef(new THREE.Vector3(0, 0, 1000));
  const pointerInside = useRef(false);
  const hoverEngagement = useRef(0);
  const targetHoverEngagement = useRef(0);

  // Water drop ripple registry
  const ripples = useMemo<THREE.Vector4[]>(() =>
    Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, -999)), []
  );
  const nextRippleIdx = useRef(0);

  // Load continent particles data
  const particlesData = useMemo(() => getContinentParticles(), []);

  // Prepare BufferGeometry
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(particlesData.positions, 3)
    );
    geo.setAttribute(
      "aSeed",
      new THREE.BufferAttribute(particlesData.seeds, 1)
    );
    return geo;
  }, [particlesData]);

  // Shader uniforms
  const uniforms = useMemo(
    () => ({
      uMouse: { value: new THREE.Vector3(0, 0, 1000) },
      uHover: { value: 0 },
      uRadius: { value: cursorRadius },
      uRepelStrength: { value: repelStrength },
      uPointSize: { value: pointSize },
      uColor: { value: new THREE.Color(particleColor) },
      uHoverColor: { value: new THREE.Color(hoverColor) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
      uRipples: { value: ripples },
    }),
    [cursorRadius, repelStrength, pointSize, particleColor, hoverColor, opacity, ripples]
  );

  // Keep uniforms in sync with props
  useEffect(() => {
    if (!materialRef.current) return;
    materialRef.current.uniforms.uPointSize.value = pointSize;
    materialRef.current.uniforms.uRadius.value = cursorRadius;
    materialRef.current.uniforms.uRepelStrength.value = repelStrength;
    materialRef.current.uniforms.uColor.value.set(particleColor);
    materialRef.current.uniforms.uHoverColor.value.set(hoverColor);
    materialRef.current.uniforms.uOpacity.value = opacity;
  }, [pointSize, cursorRadius, repelStrength, particleColor, hoverColor, opacity]);

  // Invisible collision sphere for precise 3D surface raycasting
  const collisionSphere = useMemo(
    () => new THREE.Sphere(new THREE.Vector3(0, 0, 0), globeRadius),
    [globeRadius]
  );
  const hitPointWorld = useMemo(() => new THREE.Vector3(), []);

  // Frame loop: raycast onto sphere, smoothly lerp cursor and ripple uniforms
  useFrame(() => {
    if (!materialRef.current || !pointsRef.current) return;

    materialRef.current.uniforms.uTime.value = performance.now() * 0.001;

    // Raycast against the globe sphere
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.ray.intersectSphere(collisionSphere, hitPointWorld);

    if (hit && pointerInside.current) {
      // Convert hit to the local space of the rotating points group
      const localHit = hitPointWorld.clone();
      pointsRef.current.worldToLocal(localHit);
      targetMouseLocal.current.copy(localHit);
      targetHoverEngagement.current = 1.0;
    } else {
      targetHoverEngagement.current = 0.0;
    }

    // Smooth lerp mouse position (inertia)
    currentMouseLocal.current.lerp(targetMouseLocal.current, 0.25);
    hoverEngagement.current +=
      (targetHoverEngagement.current - hoverEngagement.current) * 0.15;

    materialRef.current.uniforms.uMouse.value.copy(currentMouseLocal.current);
    materialRef.current.uniforms.uHover.value = hoverEngagement.current;
  });

  // Handle click / tap water-drop ripple on window pointerdown
  useEffect(() => {
    const onPointerDown = () => {
      if (!pointsRef.current) return;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.ray.intersectSphere(collisionSphere, hitPointWorld);
      if (hit && pointerInside.current) {
        const localHit = hitPointWorld.clone();
        pointsRef.current.worldToLocal(localHit);
        const idx = nextRippleIdx.current;
        ripples[idx].set(
          localHit.x,
          localHit.y,
          localHit.z,
          performance.now() / 1000
        );
        nextRippleIdx.current = (idx + 1) % MAX_RIPPLES;
      }
    };

    const enter = () => { pointerInside.current = true; };
    const leave = () => { pointerInside.current = false; };
    gl.domElement.addEventListener("pointerenter", enter);
    gl.domElement.addEventListener("pointerleave", leave);
    gl.domElement.addEventListener("pointerdown", onPointerDown);
    return () => { gl.domElement.removeEventListener("pointerdown", onPointerDown); gl.domElement.removeEventListener("pointerenter", enter); gl.domElement.removeEventListener("pointerleave", leave); };
  }, [camera, collisionSphere, hitPointWorld, pointer, raycaster, gl, ripples]);

  return (
    <points ref={pointsRef} geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent={true}
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}



