import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, Fragment } from 'react'
import { Canvas, createPortal, useFrame, useThree } from '@react-three/fiber'
import {
  Environment,
  MeshTransmissionMaterial,
  OrbitControls,
  useAnimations,
  useFBO,
  useGLTF
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
  chromaticAberration: 0.04,
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
      chromaticAberration: 0.04,
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
      chromaticAberration: 0.04,
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
      chromaticAberration: 0.04,
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
      chromaticAberration: 0.04,
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
      chromaticAberration: 0.04,
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
        <RotatingSunsetEnvironment
          blur={sceneGui.envBlur}
          speed={sceneGui.envSpeed}
          washColor={sceneGui.background}
          washAmount={sceneGui.wash}
          envIntensity={sceneGui.envIntensity}
        />
        <GlassMuse
          glass={{ ...petalMaterial, ...perf }}
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
function RotatingSunsetEnvironment({
  blur = 0.55,
  speed = 0.08,
  washColor = '#FCFCF2',
  washAmount = 0.28,
  envIntensity = 1.55
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
        background
        blur={blur}
        environmentIntensity={envIntensity}
        backgroundIntensity={1}
      />
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
        {allMeshes.map((mesh) => (
          <Fragment key={mesh.uuid}>
            <EnvGlassMesh host={mesh} glass={glass} />
          </Fragment>
        ))}
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
function EnvGlassMesh({ host, glass }) {
  const canvasSize = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const scale = Math.min(1, Math.max(0.25, Number(glass.fboScale) || 0.75))
  const width = Math.max(64, Math.floor(canvasSize.width * dpr * scale))
  const height = Math.max(64, Math.floor(canvasSize.height * dpr * scale))
  const fbo = useFBO(width, height)

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
      attach="material"
      {...toBareMtmProps(glass)}
      buffer={fbo.texture}
    />,
    host
  )
}

useGLTF.preload('/Iris_animated.glb')
