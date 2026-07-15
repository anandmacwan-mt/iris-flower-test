import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uSpeed;
  uniform float uScale;
  uniform float uInkAmount;
  uniform float uSoftness;
  uniform float uContrast;
  uniform vec3 uWash;
  uniform vec3 uInk;
  uniform vec3 uAccent;
  uniform vec3 uHighlight;

  varying vec2 vUv;

  // ——— hash / noise helpers ———
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = m * p;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = (vUv - 0.5) * uScale;
    uv.x *= 1.15;
    float t = uTime * uSpeed;

    // Flow field — slow swimming curl
    vec2 flow = vec2(
      fbm(uv * 0.9 + vec2(t * 0.07, -t * 0.04)),
      fbm(uv * 0.9 + vec2(-t * 0.05, t * 0.06) + 3.1)
    );
    vec2 p = uv + (flow - 0.5) * 1.35;

    // Soft paper wash (background bloom)
    float washNoise = fbm(p * 0.55 + t * 0.03);
    float radial = length(uv) * 0.55;
    float washMask = smoothstep(1.1, 0.15, radial + washNoise * 0.35);

    // Primary indigo / ink veins — sharper ridges so glass CA can fringe them
    float inkA = fbm(p * 1.8 - t * 0.08);
    float inkB = fbm(p * 2.6 + flow * 1.4 + t * 0.05);
    float inkC = fbm(p * 5.5 - flow * 0.8 + t * 0.12);
    float veins = inkA * 0.5 + inkB * 0.3 + inkC * 0.2;
    veins = smoothstep(0.38 - uInkAmount * 0.22, 0.68 + uSoftness * 0.12, veins);

    // Secondary accent blooms
    float bloom = fbm(p * 1.2 + vec2(t * 0.04, -t * 0.03) + 8.0);
    bloom = smoothstep(0.52, 0.82, bloom) * (0.55 + 0.45 * washMask);

    // Feathered edges (inking bleed) + micro grain for refraction sparkle
    float edge = fbm(p * 4.5 + t * 0.1);
    float grain = noise(p * 28.0 + t) * 0.08;
    float inkBody = veins * mix(0.75, 1.0, edge) + grain * veins;

    // Soft highlight wisps
    float highlight = fbm(p * 3.2 - t * 0.06 + 12.0);
    highlight = smoothstep(0.68, 0.9, highlight) * 0.35 * washMask;

    vec3 washCol = mix(uWash, uHighlight, washNoise * 0.35 * washMask);
    vec3 col = washCol;
    col = mix(col, uAccent, bloom * 0.55);
    col = mix(col, uInk, inkBody * uContrast);
    col += uHighlight * highlight;

    // Gentle vignette into wash
    float vig = smoothstep(1.35, 0.35, length(uv));
    col = mix(uWash * 0.92, col, vig);

    gl_FragColor = vec4(col, 1.0);
  }
`

export const INK_PALETTES = {
  'Lilac + Indigo': {
    wash: '#e8dff5',
    ink: '#2a1f6e',
    accent: '#7c5cbf',
    highlight: '#f4eeff'
  },
  'Mist + Slate': {
    wash: '#e6eef4',
    ink: '#1e2a3a',
    accent: '#6b8499',
    highlight: '#f2f7fb'
  },
  'Blush + Burgundy': {
    wash: '#f5e4ea',
    ink: '#5c1a32',
    accent: '#c46a8a',
    highlight: '#fff0f5'
  },
  'Cream + Teal': {
    wash: '#f3efe4',
    ink: '#0f4c55',
    accent: '#3d9a9e',
    highlight: '#fffaf0'
  },
  'Pearl + Violet': {
    wash: '#efeaf8',
    ink: '#3b1d6e',
    accent: '#9b7ed9',
    highlight: '#faf7ff'
  }
}

function hexToVec3(hex) {
  const c = new THREE.Color(hex)
  return new THREE.Vector3(c.r, c.g, c.b)
}

export function InkWashMaterial({
  wash = '#e8dff5',
  ink = '#2a1f6e',
  accent = '#7c5cbf',
  highlight = '#f4eeff',
  speed = 0.35,
  scale = 2.2,
  inkAmount = 0.55,
  softness = 0.45,
  contrast = 0.85,
  side = THREE.FrontSide,
  depthWrite = false
}) {
  const mat = useRef()

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uScale: { value: scale },
      uInkAmount: { value: inkAmount },
      uSoftness: { value: softness },
      uContrast: { value: contrast },
      uWash: { value: hexToVec3(wash) },
      uInk: { value: hexToVec3(ink) },
      uAccent: { value: hexToVec3(accent) },
      uHighlight: { value: hexToVec3(highlight) }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useFrame((_, dt) => {
    const m = mat.current
    if (!m) return
    m.uniforms.uTime.value += dt
    m.uniforms.uSpeed.value = speed
    m.uniforms.uScale.value = scale
    m.uniforms.uInkAmount.value = inkAmount
    m.uniforms.uSoftness.value = softness
    m.uniforms.uContrast.value = contrast
    m.uniforms.uWash.value.copy(hexToVec3(wash))
    m.uniforms.uInk.value.copy(hexToVec3(ink))
    m.uniforms.uAccent.value.copy(hexToVec3(accent))
    m.uniforms.uHighlight.value.copy(hexToVec3(highlight))
  })

  return (
    <shaderMaterial
      ref={mat}
      uniforms={uniforms}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      side={side}
      depthWrite={depthWrite}
      toneMapped={false}
    />
  )
}

/** Inverted sphere sky — ink wash wraps the portal from every direction. */
export function InkWashSphere({ radius = 12, ...props }) {
  return (
    <mesh>
      <sphereGeometry args={[radius, 64, 64]} />
      <InkWashMaterial {...props} side={THREE.BackSide} depthWrite={false} />
    </mesh>
  )
}

/** @deprecated Prefer InkWashSphere for omnidirectional portal coverage */
export function InkWashScene(props) {
  return (
    <>
      <color attach="background" args={[props.wash || '#e8dff5']} />
      <InkWashSphere {...props} />
    </>
  )
}

/**
 * Large backdrop sitting behind the glass muse so MeshTransmissionMaterial
 * samples the real scene (restores chromatic aberration / distortion).
 */
export function InkWashBackdrop({ distance = -2.6, size = 7, ...props }) {
  return (
    <mesh position={[0, 0.1, distance]} scale={[size, size * 0.75, 1]}>
      <planeGeometry args={[1, 1]} />
      <InkWashMaterial {...props} />
    </mesh>
  )
}
