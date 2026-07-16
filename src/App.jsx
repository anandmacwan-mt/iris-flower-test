import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, Fragment } from 'react'
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber'
import {
  Environment,
  MeshTransmissionMaterial,
  OrbitControls,
  useAnimations,
  useFBO,
  useGLTF,
  useTexture
} from '@react-three/drei'
import { useControls, button } from 'leva'
import * as THREE from 'three'
import { Effects } from './Effects'
import { FocusPortal } from './FocusPortal'
import { INK_PALETTES } from './InkWash'

/** Bare MTM — thickness / roughness / colour only; extras forced off for this experiment. */
const NOOMO_DEFAULTS = {
  backside: false,
  thickness: 0.4,
  backsideThickness: 0,
  reflectivity: 0.08,
  roughness: 0.2,
  anisotropy: 0,
  chromaticAberration: 0,
  distortion: 0,
  temporalDistortion: 0,
  anisotropicBlur: 0,
  color: '#f7cfff'
}

const PETAL_GLASS_DEFAULTS = {
  ...NOOMO_DEFAULTS,
  thickness: 0.4,
  reflectivity: 0.2,
  color: '#c2d6ff'
}

/** Scene looks — glass / fresnel / wash / xray palette. Order = dropdown order.
 * Each preset sets every controlled field so switching clears prior overrides. */
const SCENE_PRESETS = {
  Default: {
    petalGlass: {
      thickness: 0.4,
      reflectivity: 0.2,
      roughness: 0.2,
      color: '#c2d6ff',
      chromaticAberration: 0,
      distortion: 0,
      anisotropicBlur: 0
    },
    petalRim: {
      enabled: true,
      colorSource: 'highlight',
      power: 1.65,
      strength: 1.47
    },
    xray: {
      wash: '#e8dff5',
      ink: '#000000',
      accent: '#000000',
      highlight: '#ff9900'
    },
    scene: {
      background: '#cebfff',
      wash: 0.48,
      envBlur: 0.46,
      envIntensity: 1.01
    }
  },
  Indigo: {
    petalGlass: {
      thickness: 0.4,
      reflectivity: 0.08,
      roughness: 0.2,
      color: '#f7cfff',
      chromaticAberration: 0,
      distortion: 0,
      anisotropicBlur: 0
    },
    petalRim: {
      enabled: true,
      colorSource: 'accent',
      power: 0.75,
      strength: 2.75
    },
    xray: {
      wash: '#e8dff5',
      ink: '#2a1f6e',
      accent: '#7c5cbf',
      highlight: '#f4eeff'
    },
    scene: {
      background: '#181130',
      wash: 0.95,
      envBlur: 0.46,
      envIntensity: 1.01
    }
  },
  Light: {
    petalGlass: {
      thickness: 0.4,
      reflectivity: 0.08,
      roughness: 0.2,
      color: '#e8f4ff',
      chromaticAberration: 0,
      distortion: 0,
      anisotropicBlur: 0
    },
    petalRim: {
      enabled: true,
      colorSource: 'accent',
      power: 2.6,
      strength: 2.75
    },
    xray: {
      wash: '#e8dff5',
      ink: '#2a1f6e',
      accent: '#7c5cbf',
      highlight: '#f4eeff'
    },
    scene: {
      background: '#FCFCF2',
      wash: 0.28,
      envBlur: 0.55,
      envIntensity: 1.55
    }
  },
  Coral: {
    petalGlass: {
      thickness: 0.4,
      reflectivity: 0.08,
      roughness: 0.2,
      color: '#d2b4f0',
      chromaticAberration: 0,
      distortion: 0,
      anisotropicBlur: 0
    },
    petalRim: {
      enabled: true,
      colorSource: 'accent',
      power: 1.65,
      strength: 1.47
    },
    xray: {
      wash: '#ffffff',
      ink: '#8000ff',
      accent: '#ff8d21',
      highlight: '#ffffff'
    },
    scene: {
      background: '#1d0e4e',
      wash: 0.81,
      envBlur: 0.46,
      envIntensity: 1.01
    }
  },
  Mono: {
    petalGlass: {
      thickness: 0.4,
      reflectivity: 0.2,
      roughness: 0.2,
      color: '#b7b7b7',
      chromaticAberration: 0,
      distortion: 0,
      anisotropicBlur: 0
    },
    petalRim: {
      enabled: true,
      colorSource: 'highlight',
      power: 1.65,
      strength: 1.47
    },
    xray: {
      wash: '#e8dff5',
      ink: '#000000',
      accent: '#000000',
      highlight: '#ffffff'
    },
    scene: {
      background: '#c1c1c1',
      wash: 0.48,
      envBlur: 0.46,
      envIntensity: 1.01
    }
  },
  /* Blender-render looks: sheer alpha'd petals over a soft radial vignette */
  Bloom: {
    petalGlass: {
      thickness: 0.4,
      reflectivity: 0.12,
      roughness: 0.28,
      color: '#cbb4ff',
      chromaticAberration: 0,
      distortion: 0,
      anisotropicBlur: 0
    },
    petalRim: {
      enabled: true,
      colorSource: 'highlight',
      power: 2.4,
      strength: 1.1
    },
    xray: {
      wash: '#e8dff5',
      ink: '#2a1f6e',
      accent: '#7c5cbf',
      highlight: '#f2e9ff'
    },
    scene: {
      background: '#3a18b0',
      wash: 0.3,
      envBlur: 0.5,
      envIntensity: 1.2
    },
    texture: {
      enabled: true,
      mode: 'colour + emission',
      emissiveIntensity: 0.5,
      useAlpha: true
    },
    background: {
      gradient: true,
      style: 'radial',
      inner: '#5326d8',
      outer: '#2a0e94',
      flow: 0.3
    }
  },
  Blush: {
    petalGlass: {
      thickness: 0.35,
      reflectivity: 0.1,
      roughness: 0.3,
      color: '#eadcff',
      chromaticAberration: 0,
      distortion: 0,
      anisotropicBlur: 0
    },
    petalRim: {
      enabled: true,
      colorSource: 'highlight',
      power: 2.8,
      strength: 0.9
    },
    xray: {
      wash: '#ffffff',
      ink: '#4a2bb5',
      accent: '#b87fc4',
      highlight: '#ffffff'
    },
    scene: {
      background: '#cf9ed2',
      wash: 0.3,
      envBlur: 0.6,
      envIntensity: 1.5
    },
    texture: {
      enabled: true,
      mode: 'colour + emission',
      emissiveIntensity: 0.35,
      useAlpha: true
    },
    background: {
      gradient: true,
      style: 'radial',
      inner: '#d5a3da',
      outer: '#c188bd',
      flow: 0.25
    }
  }
}

/** Minimal glass knobs — extras stay available but default off. */
function glassControls(defaults = NOOMO_DEFAULTS) {
  return {
    thickness: { value: defaults.thickness, min: 0, max: 5, step: 0.01 },
    reflectivity: { value: defaults.reflectivity, min: 0, max: 1, step: 0.01 },
    roughness: { value: defaults.roughness, min: 0, max: 1, step: 0.01 },
    color: defaults.color,
    // Kept for A/B — leave at 0 for the bare FBO→MTM look
    chromaticAberration: { value: defaults.chromaticAberration, min: 0, max: 1, step: 0.01 },
    distortion: { value: defaults.distortion, min: 0, max: 10, step: 0.01 },
    anisotropicBlur: { value: defaults.anisotropicBlur, min: 0, max: 10, step: 0.01 }
  }
}

/** Bare MTM props for a custom FBO buffer (no MTM internal resolution pass). */
function toBareMtmProps(glass) {
  return {
    side: THREE.DoubleSide,
    backside: false,
    thickness: glass.thickness,
    backsideThickness: 0,
    roughness: glass.roughness,
    anisotropy: 0,
    chromaticAberration: glass.chromaticAberration ?? 0,
    distortion: glass.distortion ?? 0,
    distortionScale: 0.55,
    temporalDistortion: 0,
    anisotropicBlur: glass.anisotropicBlur ?? 0,
    samples: Math.max(1, glass.samples ?? 1),
    // MTM always allocates an unused internal FBO; keep it tiny when we supply buffer
    resolution: 1,
    transmission: 1,
    ior: 1.5,
    color: glass.color,
    reflectivity: glass.reflectivity,
    transmissionSampler: false
  }
}

const DEFAULT_PALETTE = 'Lilac + Indigo'
const DEFAULT_INK = INK_PALETTES[DEFAULT_PALETTE]

/** Usable tip of Iris "Action" clip — ignore keyframes past this. */
const IRIS_ANIM_DURATION = 5

export function App() {
  const [petalMaterial, setPetalMaterial] = useControls(
    'glass',
    () => glassControls(PETAL_GLASS_DEFAULTS),
    { collapsed: true, order: 1 }
  )
  const [textureGui, setTexture] = useControls(
    'texture',
    () => ({
      enabled: { value: true, label: 'use texture' },
      mode: {
        value: 'colour',
        options: ['colour', 'emission', 'colour + emission'],
        label: 'apply as'
      },
      emissiveIntensity: {
        value: 1,
        min: 0,
        max: 8,
        step: 0.01,
        label: 'emission strength'
      },
      useAlpha: { value: true, label: 'texture alpha' }
    }),
    { collapsed: true, order: 2 }
  )

  const pulseGui = useControls(
    'pulse',
    {
      enabled: { value: true, label: 'seed pulse' },
      speed: { value: 0.45, min: 0.05, max: 3, step: 0.01, label: 'pulse speed' },
      min: { value: 0.3, min: 0, max: 4, step: 0.01, label: 'glow min' },
      max: { value: 3.5, min: 0, max: 8, step: 0.01, label: 'glow max' }
    },
    { collapsed: true, order: 9 }
  )

  const [backgroundGui, setBackground] = useControls(
    'background',
    () => ({
      gradient: { value: true, label: 'gradient bg' },
      style: {
        value: 'design',
        options: ['design', 'radial'],
        label: 'gradient style'
      },
      inner: { value: '#5326d8', label: 'inner colour' },
      outer: { value: '#2a0e94', label: 'outer colour' },
      drift: { value: 0.03, min: 0, max: 0.3, step: 0.005, label: 'drift speed' },
      haze: { value: 0.55, min: 0, max: 1, step: 0.01, label: 'atmosphere' },
      flow: { value: 0.2, min: 0, max: 1, step: 0.01, label: 'fluid flow' }
    }),
    { collapsed: true, order: 10 }
  )

  const [petalRim, setPetalRim] = useControls(
    'rim',
    () => ({
      enabled: { value: true, label: 'fresnel halo' },
      colorSource: {
        value: 'highlight',
        options: ['wash', 'ink', 'accent', 'highlight'],
        label: 'rim from palette'
      },
      power: { value: 1.65, min: 0.5, max: 8, step: 0.05, label: 'rim power' },
      strength: { value: 1.47, min: 0, max: 4, step: 0.01, label: 'rim strength' }
    }),
    { collapsed: true, order: 3 }
  )

  const [inkGui, setInk] = useControls(
    'xray colours',
    () => ({
      palette: {
        value: DEFAULT_PALETTE,
        options: Object.keys(INK_PALETTES)
      },
      wash: '#e8dff5',
      ink: { value: '#000000', label: 'ink colour' },
      accent: '#000000',
      highlight: '#ff9900'
    }),
    { collapsed: true, order: 4 }
  )

  const animGui = useControls(
    'animation',
    {
      scrub: { value: 5.0, min: 0, max: IRIS_ANIM_DURATION, step: 0.01, label: 'scrub (s)' },
      scale: { value: 8, min: 0.5, max: 40, step: 0.1, label: 'model scale' },
      y: { value: -3.4, min: -8, max: 2, step: 0.05, label: 'y offset' }
    },
    { collapsed: true, order: 5 }
  )

  const [sceneGui, setScene] = useControls(
    'scene',
    () => ({
      background: { value: '#cebfff', label: 'Wash Colour' },
      wash: { value: 0.48, min: 0, max: 1, step: 0.01, label: 'wash amount' },
      envBlur: { value: 0.46, min: 0, max: 1, step: 0.01, label: 'env blur' },
      envIntensity: { value: 1.01, min: 0, max: 3, step: 0.01, label: 'env light' },
      envSpeed: { value: 0.08, min: 0, max: 0.5, step: 0.01, label: 'env rotate' },
      breeze: { value: true, label: 'breeze sway' },
      breezeStrength: { value: 0.01, min: 0, max: 0.2, step: 0.001, label: 'breeze amount' },
      breezeSpeed: { value: 1.0, min: 0.1, max: 2.5, step: 0.05, label: 'breeze speed' },
      ssgi: { value: false, label: 'SSGI lighting' },
      autoRotate: false,
      'Reset All': button(() => window.location.reload())
    }),
    { collapsed: true, order: 6 }
  )

  const performance = useControls(
    'performance',
    {
      samples: { value: 1, min: 1, max: 32, step: 1 },
      fboScale: {
        value: 0.75,
        min: 0.25,
        max: 1,
        step: 0.05,
        label: 'FBO × canvas'
      }
    },
    { collapsed: true, order: 7 }
  )

  const focusGui = useControls(
    'focus',
    {
      enabled: { value: true, label: 'blur plate' },
      circle: { value: 0.61, min: 0.05, max: 1.5, step: 0.01, label: 'circle size' },
      feather: { value: 0.33, min: 0.01, max: 0.8, step: 0.01, label: 'feather' },
      blur: { value: 1.72, min: 0, max: 3, step: 0.01, label: 'blur amount' }
    },
    { collapsed: true, order: 8 }
  )

  const applyingPreset = useRef(false)

  const applyScenePreset = (name) => {
    const preset = SCENE_PRESETS[name]
    if (!preset) return
    applyingPreset.current = true
    setPetalMaterial(preset.petalGlass)
    setPetalRim(preset.petalRim)
    setScene(preset.scene)
    // Always replace xray colours so IRIS customs don't linger on Indigo / Light
    if (preset.xray) setInk(preset.xray)
    if (preset.texture) setTexture(preset.texture)
    if (preset.background) setBackground(preset.background)
    queueMicrotask(() => {
      applyingPreset.current = false
    })
  }

  useControls(
    'presets',
    () => ({
      scenePreset: {
        value: 'Default',
        options: Object.keys(SCENE_PRESETS),
        label: 'scene look',
        onChange: applyScenePreset
      }
    }),
    { collapsed: true, order: -1 }
  )

  // Palette dropdown only — skip mount so Default preset xray colours aren't overwritten
  const paletteReady = useRef(false)
  useEffect(() => {
    if (!paletteReady.current) {
      paletteReady.current = true
      return
    }
    if (applyingPreset.current) return
    const preset = INK_PALETTES[inkGui.palette]
    if (!preset) return
    setInk({
      wash: preset.wash,
      ink: preset.ink,
      accent: preset.accent,
      highlight: preset.highlight
    })
  }, [inkGui.palette, setInk])

  const paletteColors = {
    wash: inkGui.wash,
    ink: inkGui.ink,
    accent: inkGui.accent,
    highlight: inkGui.highlight
  }

  const perf = { samples: performance.samples, fboScale: performance.fboScale }

  // Stable gl config — inline `gl={{}}` remounts WebGL when leva toggles
  const glConfig = useMemo(
    () => ({
      antialias: !sceneGui.ssgi,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true
    }),
    [sceneGui.ssgi]
  )

  return (
    <Canvas
      dpr={[1, 1.5]}
      gl={glConfig}
      camera={{ position: [0, 0, 9], fov: 45, near: 0.1, far: 1000 }}>
      <color attach="background" args={[sceneGui.background]} />
      <ambientLight intensity={0.2} />
      {/* Sunset-keyed lights so glass still “catches” warmth when the sky is washed */}
      <directionalLight position={[6, 4, 2]} intensity={1.35} color="#ffb39a" />
      <directionalLight position={[-4, 2, -3]} intensity={0.55} color="#9aabb8" />
      <Suspense fallback={<FallbackMarker />}>
        <GradientAtmosphere
          enabled={backgroundGui.gradient}
          style={backgroundGui.style}
          inner={backgroundGui.inner}
          outer={backgroundGui.outer}
          drift={backgroundGui.drift}
          haze={backgroundGui.haze}
          flow={backgroundGui.flow}
        />
        <RotatingSunsetEnvironment
          blur={sceneGui.envBlur}
          speed={sceneGui.envSpeed}
          washColor={sceneGui.background}
          washAmount={sceneGui.wash}
          envIntensity={sceneGui.envIntensity}
          showSky={!backgroundGui.gradient}
        />
        <GlassMuse
          glass={{ ...petalMaterial, ...perf }}
          textureSettings={textureGui}
          pulse={pulseGui}
          breeze={sceneGui.breeze}
          breezeStrength={sceneGui.breezeStrength}
          breezeSpeed={sceneGui.breezeSpeed}
          animTime={animGui.scrub}
          modelScale={animGui.scale}
          y={animGui.y}
          petalRim={{
            ...petalRim,
            color: paletteColors[petalRim.colorSource] || paletteColors.highlight
          }}
        />
      </Suspense>
      <OrbitControls
        makeDefault
        enableDamping
        autoRotate={sceneGui.autoRotate}
        autoRotateSpeed={0.4}
        minDistance={2}
        maxDistance={20}
        target={[0, 0, 0]}
      />
      {sceneGui.ssgi && <Effects />}
      <FocusPortal
        enabled={focusGui.enabled && !sceneGui.ssgi}
        circle={focusGui.circle}
        feather={focusGui.feather}
        blur={focusGui.blur}
      />
    </Canvas>
  )
}

/**
 * Venice for IBL + soft HDR backdrop (so glass refraction sits “in” the scene),
 * lifted with a Starling wash. Stronger env intensity + warm key lights restore
 * the “catching light” feel of a fully visible HDR sky.
 */
/**
 * World-anchored gradient dome — indigo field, near-black corner, violet sweep
 * and a coral hotspot. Blob anchors drift slowly for idle atmosphere; because
 * the dome is world-space, orbiting the camera parallaxes the whole gradient.
 * fbm haze + fine grain keep it from banding and give it air.
 */
/** hex -> raw display-space vec3 (the shader handles ACES compensation
 * itself, so bypass THREE.Color's colour management) */
function hexToVec3(hex) {
  const n = parseInt(hex.slice(1), 16)
  return new THREE.Vector3(
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255
  )
}

function GradientAtmosphere({
  enabled = true,
  style = 'design',
  inner = '#5326d8',
  outer = '#2a0e94',
  drift = 0.03,
  haze = 0.55,
  flow = 0.2
}) {
  const mat = useRef()
  const res = useRef(new THREE.Vector2(1, 1)).current

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uDrift: { value: drift },
      uHaze: { value: haze },
      uFlow: { value: flow },
      uStyle: { value: 0 },
      uInner: { value: new THREE.Vector3() },
      uOuter: { value: new THREE.Vector3() },
      uResolution: { value: new THREE.Vector2(1, 1) }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )

  useFrame((state) => {
    if (!mat.current) return
    mat.current.uniforms.uTime.value = state.clock.elapsedTime
    mat.current.uniforms.uDrift.value = drift
    mat.current.uniforms.uHaze.value = haze
    mat.current.uniforms.uFlow.value = flow
    mat.current.uniforms.uStyle.value = style === 'radial' ? 1 : 0
    mat.current.uniforms.uInner.value.copy(hexToVec3(inner))
    mat.current.uniforms.uOuter.value.copy(hexToVec3(outer))
    state.gl.getDrawingBufferSize(res)
    mat.current.uniforms.uResolution.value.copy(res)
  })

  if (!enabled) return null

  // The gradient is evaluated procedurally in screen space, so it is
  // inherently seamless — no texture edges or dome-mapping seams. The huge
  // dome only exists to fill every pixel behind the scene.
  return (
    <mesh renderOrder={-5} frustumCulled={false}>
      <sphereGeometry args={[200, 16, 12]} />
      <shaderMaterial
        ref={mat}
        side={THREE.BackSide}
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={/* glsl */ `
          void main() {
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={/* glsl */ `
          uniform float uTime;
          uniform float uDrift;
          uniform float uHaze;
          uniform float uFlow;
          uniform float uStyle;
          uniform vec3 uInner;
          uniform vec3 uOuter;
          uniform vec2 uResolution;

          // sine-feedback fluid field (the classic glslsandbox / media-facade
          // trick): a few iterations of mutual sine displacement give a slow,
          // seamless lava-lamp swirl. Returns a bounded uv offset.
          vec2 flowField(vec2 st, float t) {
            vec2 p = st * 2.0;
            for (int i = 1; i < 8; i++) {
              vec2 np = p + t * 0.02;
              np.x += 0.6 / float(i) * sin(float(i) * p.y + t + 20.3 * float(i)) + 0.5;
              np.y += 0.6 / float(i) * sin(float(i) * p.x + t + 0.3 * float(i + 10)) - 0.5;
              p = np;
            }
            return vec2(sin(3.0 * p.x), sin(3.0 * p.y)) * 0.5;
          }

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }
          float vnoise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            float a = hash(i);
            float b = hash(i + vec2(1.0, 0.0));
            float c = hash(i + vec2(0.0, 1.0));
            float d = hash(i + vec2(1.0, 1.0));
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }
          float fbm(vec2 p) {
            float s = 0.0, amp = 0.5;
            for (int i = 0; i < 4; i++) { s += amp * vnoise(p); p *= 2.03; amp *= 0.5; }
            return s;
          }

          // FocusPortal captures linear then displays linearToSRGB(ACES(x)).
          // To make hex value H land on screen: x = acesInverse(srgbToLinear(H)).
          vec3 srgbToLinear(vec3 c) {
            return mix(
              pow((c + 0.055) / 1.055, vec3(2.4)),
              c / 12.92,
              vec3(lessThanEqual(c, vec3(0.04045)))
            );
          }
          vec3 acesInverse(vec3 y) {
            y = min(y, vec3(0.985));
            vec3 a = 2.51 - 2.43 * y;
            vec3 b = 0.03 - 0.59 * y;
            vec3 c = -0.14 * y;
            return (-b + sqrt(b * b - 4.0 * a * c)) / (2.0 * a);
          }

          // radial-gradient(124.55% 105.64% at 15.32% 29.2%,
          //   #000 0%, #190B75 40%, #60F 75%, #FF787C 100%)
          vec3 gradient(float t) {
            t = clamp(t, 0.0, 1.0);
            vec3 c0 = vec3(0.0);
            vec3 c1 = vec3( 25.0,  11.0, 117.0) / 255.0;
            vec3 c2 = vec3(102.0,   0.0, 255.0) / 255.0;
            vec3 c3 = vec3(255.0, 120.0, 124.0) / 255.0;
            vec3 col = c0;
            col = mix(col, c1, clamp(t / 0.40, 0.0, 1.0));
            col = mix(col, c2, clamp((t - 0.40) / 0.35, 0.0, 1.0));
            col = mix(col, c3, clamp((t - 0.75) / 0.25, 0.0, 1.0));
            return col;
          }

          void main() {
            // CSS-style coords: origin top-left, per-axis percentages
            vec2 st = gl_FragCoord.xy / uResolution;
            st.y = 1.0 - st.y;

            // drifting fbm warp keeps the smooth gradient alive without a seam
            float n = fbm(st * 3.0 + vec2(uTime * uDrift, uTime * uDrift * 0.7));
            vec2 p = st + (n - 0.5) * 0.03 * uHaze;

            // fluid advection: swirl the gradient through the sine-feedback
            // field for a slow, living lava-lamp motion
            p += flowField(st, uTime * (0.2 + uDrift * 4.0)) * 0.12 * uFlow;

            vec3 col;
            if (uStyle > 0.5) {
              // soft two-colour radial vignette (Blender-render style):
              // bright centre falling off to the corners
              float t = length((p - vec2(0.5, 0.45)) * vec2(1.15, 1.0));
              col = mix(uInner, uOuter, smoothstep(0.12, 0.85, t));
            } else {
              vec2 c = vec2(0.1532, 0.292);   // gradient centre
              vec2 r = vec2(1.2455, 1.0564);  // ellipse radii (fraction of axis)
              col = gradient(length((p - c) / r));
            }
            col *= 1.0 + (n - 0.5) * 0.10 * uHaze;   // gentle atmospheric shimmer
            col = acesInverse(srgbToLinear(col));
            col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) * 0.012; // anti-band grain

            gl_FragColor = vec4(col, 1.0);
          }
        `}
      />
    </mesh>
  )
}

function RotatingSunsetEnvironment({
  blur = 0.55,
  speed = 0.08,
  washColor = '#FCFCF2',
  washAmount = 0.28,
  envIntensity = 1.55,
  showSky = true
}) {
  const scene = useThree((s) => s.scene)
  const wash = useRef()

  useFrame((_, dt) => {
    scene.backgroundRotation.y += dt * speed
    scene.environmentRotation.y += dt * speed
    if (wash.current) wash.current.rotation.y += dt * speed
  })

  return (
    <>
      <Environment
        files="/syferfontein_0d_clear_puresky_1k.hdr"
        background={showSky}
        blur={blur}
        environmentIntensity={envIntensity}
        backgroundIntensity={1}
      />
      {showSky && (
        <mesh ref={wash} scale={[-1, 1, 1]} renderOrder={-10}>
          <sphereGeometry args={[90, 64, 32]} />
          <meshBasicMaterial
            color={washColor}
            transparent
            opacity={washAmount}
            depthWrite={false}
            side={THREE.BackSide}
            toneMapped={false}
          />
        </mesh>
      )}
    </>
  )
}

function FallbackMarker() {
  return (
    <mesh>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshBasicMaterial color="hotpink" />
    </mesh>
  )
}

/**
 * Skinned Iris muse — every mesh is bare MTM with its own hide-self FBO
 * (stem / leaves / petals all see each other through glass).
 * Animation is paused and scrubbed via leva.
 */
function GlassMuse({
  glass,
  textureSettings,
  pulse,
  breeze,
  breezeStrength,
  breezeSpeed,
  animTime,
  modelScale,
  y,
  petalRim
}) {
  const sway = useRef()
  const { scene, animations } = useGLTF('/Iris_animated.glb')
  const irisTexture = useTexture('/iris_texture.png')

  // Painted against the glTF UV layout — needs glTF texture conventions
  useMemo(() => {
    irisTexture.flipY = false
    irisTexture.colorSpace = THREE.SRGBColorSpace
    irisTexture.anisotropy = 8
    irisTexture.needsUpdate = true
  }, [irisTexture])

  const texProps = useMemo(() => {
    if (!textureSettings?.enabled) return {}
    const { mode, emissiveIntensity, useAlpha } = textureSettings
    const props = {}
    if (mode === 'colour' || mode === 'colour + emission') props.map = irisTexture
    if (mode === 'emission' || mode === 'colour + emission') {
      props.emissiveMap = irisTexture
      props.emissive = '#ffffff'
      props.emissiveIntensity = emissiveIntensity
    }
    // the texture's alpha channel is a designed translucency map: sheer
    // petal interiors, denser edges/line art, solid leaves and seed pods
    if (useAlpha && props.map) {
      props.transparent = true
      props.alphaTest = 0.02
    }
    return props
  }, [textureSettings, irisTexture])

  // Pulsing meshes always carry the emissive slot so the glow can animate
  // even in plain colour mode
  const pulseTexProps = useMemo(() => {
    if (!pulse?.enabled) return texProps
    return {
      ...texProps,
      emissiveMap: irisTexture,
      emissive: '#ffffff',
      emissiveIntensity: pulse.min
    }
  }, [texProps, pulse, irisTexture])

  // Adding/removing map slots needs a shader rebuild — remount MTM on mode change
  const texKey = textureSettings?.enabled
    ? `${textureSettings.mode}${textureSettings.useAlpha ? '-a' : ''}`
    : 'off'
  const pulseKey = pulse?.enabled ? `${texKey}-pulse` : texKey
  // Bind mixer to the scene so bone tracks resolve correctly
  const { actions, mixer, names } = useAnimations(animations, scene)

  const clipName = useMemo(() => {
    if (actions?.Action) return 'Action'
    return names?.[0]
  }, [actions, names])

  const { stemMeshes, petalMeshes } = useMemo(() => {
    const stems = []
    const petals = []
    scene.traverse((child) => {
      if (!child.isMesh) return
      child.frustumCulled = false
      if (/^(PurplePetal|WhitePetal)/i.test(child.name)) petals.push(child)
      else stems.push(child)
    })
    return { stemMeshes: stems, petalMeshes: petals }
  }, [scene])

  useEffect(() => {
    const action = clipName && actions?.[clipName]
    if (!action) return
    action.reset()
    action.play()
    action.paused = true
    action.clampWhenFinished = true
    action.enabled = true
  }, [actions, clipName])

  useLayoutEffect(() => {
    for (const m of [...stemMeshes, ...petalMeshes]) {
      m.castShadow = true
      m.receiveShadow = true
      m.frustumCulled = false
      m.visible = true
    }
  })

  useFrame((state) => {
    const action = clipName && actions?.[clipName]
    if (mixer && action) {
      const duration = action.getClip().duration
      const t = Math.min(Math.max(0, animTime), Math.min(IRIS_ANIM_DURATION, duration))
      action.enabled = true
      action.paused = false
      action.time = t
      action.weight = 1
      mixer.update(1e-6)
      action.paused = true
    }

    if (!sway.current) return
    if (!breeze) {
      sway.current.rotation.set(0, 0, 0)
      return
    }
    const t = state.clock.elapsedTime
    const s = breezeStrength
    const spd = breezeSpeed
    sway.current.rotation.x = Math.sin(t * spd * 0.85 + 0.4) * s * 0.9
    sway.current.rotation.z = Math.sin(t * spd * 1.1) * s * 1.15
    sway.current.rotation.y = Math.sin(t * spd * 0.45) * s * 0.55
  })

  const allMeshes = useMemo(
    () => [...stemMeshes, ...petalMeshes],
    [stemMeshes, petalMeshes]
  )

  return (
    <group scale={modelScale} position={[0, y, 0]} rotation={[0, Math.PI / 4, 0]}>
      <group ref={sway}>
        <primitive object={scene} />
        {allMeshes.map((mesh, i) => {
          // The seed pods in the flower centre (FlowerYellow) breathe with an
          // emissive pulse; petals stay as they are
          const pulses = pulse?.enabled && /^FlowerYellow/i.test(mesh.name)
          return (
            <Fragment key={mesh.uuid}>
              <EnvGlassMesh
                key={pulses ? pulseKey : texKey}
                host={mesh}
                glass={glass}
                texProps={pulses ? pulseTexProps : texProps}
                pulse={pulses ? { ...pulse, phase: i * 0.7 } : null}
              />
            </Fragment>
          )
        })}
        <FresnelHalos meshes={allMeshes} rim={petalRim} />
      </group>
    </group>
  )
}

/**
 * Additive Fresnel shells on each glass mesh — bright edge halo without replacing glass.
 */
function FresnelHalos({ meshes, rim }) {
  const rimMeshes = useRef([])

  useLayoutEffect(() => {
    const created = []
    for (const mesh of meshes) {
      if (!mesh?.isSkinnedMesh && !mesh?.isMesh) continue
      const mat = createPetalRimMaterial(rim.color, rim.power, rim.strength)
      let shell
      if (mesh.isSkinnedMesh) {
        shell = new THREE.SkinnedMesh(mesh.geometry, mat)
        shell.bind(mesh.skeleton, mesh.bindMatrix)
        shell.bindMode = mesh.bindMode
      } else {
        shell = new THREE.Mesh(mesh.geometry, mat)
      }
      shell.frustumCulled = false
      shell.renderOrder = 3
      shell.userData.isGlassRim = true
      mesh.parent?.add(shell)
      mesh.userData.rimMesh = shell
      shell.position.copy(mesh.position)
      shell.quaternion.copy(mesh.quaternion)
      shell.scale.copy(mesh.scale)
      created.push(shell)
    }
    rimMeshes.current = created

    return () => {
      for (const shell of created) {
        shell.parent?.remove(shell)
        shell.material?.dispose()
      }
      for (const mesh of meshes) {
        delete mesh.userData.rimMesh
      }
      rimMeshes.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshes])

  useFrame(() => {
    for (const shell of rimMeshes.current) {
      const u = shell.material?.uniforms
      if (!u) continue
      shell.visible = !!rim.enabled
      u.uColor.value.set(rim.color)
      u.uPower.value = rim.power
      u.uStrength.value = rim.strength
    }
  })

  return null
}

function createPetalRimMaterial(color, power, strength) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
      uStrength: { value: strength }
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        #include <skinbase_vertex>
        #include <beginnormal_vertex>
        #include <skinnormal_vertex>
        #include <defaultnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        #include <project_vertex>
        vNormal = normalize(transformedNormal);
        vViewDir = normalize(-mvPosition.xyz);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uStrength;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewDir))), uPower);
        float a = clamp(fres * uStrength, 0.0, 1.0);
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    skinning: true
  })
}

/**
 * Hide-self live capture → bare MTM buffer. One FBO per mesh so glass can
 * refract siblings (petal↔petal, stem↔petals).
 * FBO defaults to 0.75 × canvas (CSS size × DPR).
 */
function EnvGlassMesh({ host, glass, texProps = {}, pulse = null }) {
  const canvasSize = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const scale = Math.min(1, Math.max(0.25, Number(glass.fboScale) || 0.75))
  const width = Math.max(64, Math.floor(canvasSize.width * dpr * scale))
  const height = Math.max(64, Math.floor(canvasSize.height * dpr * scale))
  const fbo = useFBO(width, height)
  const matRef = useRef()

  useFrame((state) => {
    if (!pulse?.enabled || !matRef.current) return
    const t = state.clock.elapsedTime
    const s = 0.5 + 0.5 * Math.sin(t * pulse.speed * Math.PI * 2 + (pulse.phase || 0))
    matRef.current.emissiveIntensity = pulse.min + (pulse.max - pulse.min) * s
  })

  useFrame(({ gl, scene, camera }) => {
    const prevTarget = gl.getRenderTarget()
    const prevTone = gl.toneMapping
    const prevVisible = host.visible
    const rim = host.userData.rimMesh
    const prevRim = rim?.visible

    host.visible = false
    if (rim) rim.visible = false

    gl.toneMapping = THREE.NoToneMapping
    gl.setRenderTarget(fbo)
    gl.clear()
    gl.render(scene, camera)

    gl.setRenderTarget(prevTarget)
    gl.toneMapping = prevTone
    host.visible = prevVisible
    if (rim) rim.visible = prevRim
  })

  return createPortal(
    <MeshTransmissionMaterial
      ref={matRef}
      attach="material"
      {...toBareMtmProps(glass)}
      {...texProps}
      buffer={fbo.texture}
    />,
    host
  )
}

useGLTF.preload('/Iris_animated.glb')
useTexture.preload('/iris_texture.png')
