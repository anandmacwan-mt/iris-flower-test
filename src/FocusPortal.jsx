import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Always paints through one colour pipeline (linear capture → ACES+sRGB).
 * "enabled" only adds the blurred outer plate; off = full-frame sharp.
 */
export function FocusPortal({
  enabled = true,
  circle = 0.61,
  feather = 0.33,
  blur = 1.72
}) {
  const { gl, scene, camera } = useThree()
  const propsRef = useRef({ enabled, circle, feather, blur })
  propsRef.current = { enabled, circle, feather, blur }

  const scratch = useRef({ db: new THREE.Vector2() }).current

  const targets = useMemo(() => {
    const sharp = makeLinearTarget(2, 2)
    const blurA = makeLinearTarget(2, 2)
    const blurB = makeLinearTarget(2, 2)
    return { sharp, blurA, blurB }
  }, [])

  const blurMat = useMemo(() => createBlurMaterial(), [])
  const compositeMat = useMemo(() => createCompositeMaterial(), [])
  const fs = useMemo(() => createFullscreen(), [])

  useEffect(() => {
    return () => {
      targets.sharp.dispose()
      targets.blurA.dispose()
      targets.blurB.dispose()
      blurMat.dispose()
      compositeMat.dispose()
      fs.geo.dispose()
    }
  }, [targets, blurMat, compositeMat, fs])

  useFrame(() => {
    const { enabled: on, circle: cir, feather: featherAmt, blur: blurAmt } = propsRef.current
    const { sharp, blurA, blurB } = targets

    const prevTarget = gl.getRenderTarget()
    const prevAutoClear = gl.autoClear
    const prevTone = gl.toneMapping
    const prevOutput = gl.outputColorSpace
    const exposure = gl.toneMappingExposure

    try {
      gl.getDrawingBufferSize(scratch.db)
      const w = Math.max(2, scratch.db.x)
      const h = Math.max(2, scratch.db.y)
      const bw = Math.max(2, Math.floor(w * 0.5))
      const bh = Math.max(2, Math.floor(h * 0.5))
      if (sharp.width !== w || sharp.height !== h) sharp.setSize(w, h)
      if (blurA.width !== bw || blurA.height !== bh) {
        blurA.setSize(bw, bh)
        blurB.setSize(bw, bh)
      }

      // Linear capture (shared path whether portal is on or off)
      gl.autoClear = true
      gl.toneMapping = THREE.NoToneMapping
      gl.outputColorSpace = THREE.LinearSRGBColorSpace
      gl.setRenderTarget(sharp)
      gl.clear()
      gl.render(scene, camera)

      let softTexture = sharp.texture
      const doBlur = on && blurAmt > 0.001
      if (doBlur) {
        const iterations = Math.max(1, Math.round(2 + blurAmt * 6))
        const texelScale = 0.6 + blurAmt * 2.4

        blit(gl, fs, blurMat, sharp.texture, blurA, {
          direction: [texelScale / blurA.width, 0]
        })

        let read = blurA
        let write = blurB
        for (let i = 0; i < iterations; i++) {
          const horizontal = i % 2 === 0
          blit(gl, fs, blurMat, read.texture, write, {
            direction: horizontal
              ? [0, texelScale / write.height]
              : [texelScale / write.width, 0]
          })
          const tmp = read
          read = write
          write = tmp
        }
        softTexture = read.texture
      }

      compositeMat.uniforms.tSharp.value = sharp.texture
      compositeMat.uniforms.tBlur.value = softTexture
      compositeMat.uniforms.uCircle.value = cir
      compositeMat.uniforms.uFeather.value = Math.max(0.001, featherAmt)
      compositeMat.uniforms.uAspect.value = w / Math.max(1, h)
      compositeMat.uniforms.uExposure.value = exposure
      // off → full-frame sharp (no outer blur plate)
      compositeMat.uniforms.uPortal.value = on ? 1 : 0

      gl.toneMapping = THREE.NoToneMapping
      gl.outputColorSpace = THREE.LinearSRGBColorSpace
      gl.autoClear = true
      gl.setRenderTarget(null)
      gl.clear()
      fs.mesh.material = compositeMat
      gl.render(fs.scene, fs.camera)
    } finally {
      gl.setRenderTarget(prevTarget)
      gl.autoClear = prevAutoClear
      gl.toneMapping = prevTone
      gl.outputColorSpace = prevOutput
    }
  }, 1)

  return null
}

function makeLinearTarget(width, height) {
  return new THREE.WebGLRenderTarget(width, height, {
    samples: 0,
    depthBuffer: true,
    stencilBuffer: false,
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    colorSpace: THREE.LinearSRGBColorSpace
  })
}

function blit(gl, fs, material, input, output, { direction }) {
  material.uniforms.tMap.value = input
  material.uniforms.uDirection.value.set(direction[0], direction[1])
  fs.mesh.material = material
  gl.setRenderTarget(output)
  gl.clear()
  gl.render(fs.scene, fs.camera)
}

function createFullscreen() {
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const geo = new THREE.PlaneGeometry(2, 2)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial())
  scene.add(mesh)
  return { scene, camera, mesh, geo }
}

function createBlurMaterial() {
  return new THREE.RawShaderMaterial({
    uniforms: {
      tMap: { value: null },
      uDirection: { value: new THREE.Vector2(1, 0) }
    },
    vertexShader: /* glsl */ `
      attribute vec3 position;
      attribute vec2 uv;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tMap;
      uniform vec2 uDirection;
      varying vec2 vUv;
      void main() {
        vec4 sum = texture2D(tMap, vUv) * 0.227027;
        sum += texture2D(tMap, vUv + uDirection * 1.384615) * 0.316216;
        sum += texture2D(tMap, vUv - uDirection * 1.384615) * 0.316216;
        sum += texture2D(tMap, vUv + uDirection * 3.230769) * 0.070270;
        sum += texture2D(tMap, vUv - uDirection * 3.230769) * 0.070270;
        gl_FragColor = sum;
      }
    `,
    depthTest: false,
    depthWrite: false
  })
}

function createCompositeMaterial() {
  return new THREE.RawShaderMaterial({
    uniforms: {
      tSharp: { value: null },
      tBlur: { value: null },
      uCircle: { value: 0.55 },
      uFeather: { value: 0.25 },
      uAspect: { value: 1 },
      uExposure: { value: 1 },
      uPortal: { value: 1 }
    },
    vertexShader: /* glsl */ `
      attribute vec3 position;
      attribute vec2 uv;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tSharp;
      uniform sampler2D tBlur;
      uniform float uCircle;
      uniform float uFeather;
      uniform float uAspect;
      uniform float uExposure;
      uniform float uPortal;
      varying vec2 vUv;

      vec3 ACESFilmic(vec3 x) {
        return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
      }

      vec3 linearToSRGB(vec3 value) {
        return mix(
          pow(value, vec3(0.41666)) * 1.055 - vec3(0.055),
          value * 12.92,
          vec3(lessThanEqual(value, vec3(0.0031308)))
        );
      }

      void main() {
        vec3 sharpCol = texture2D(tSharp, vUv).rgb;
        vec3 softCol = texture2D(tBlur, vUv).rgb;

        float mask = 1.0;
        if (uPortal > 0.5) {
          vec2 p = vUv - 0.5;
          p.x *= uAspect;
          float d = length(p);
          float outer = uCircle;
          float inner = max(0.0, uCircle - uFeather);
          mask = 1.0 - smoothstep(inner, outer, d);
        }

        vec3 color = mix(softCol, sharpCol, mask);
        color *= uExposure;
        color = ACESFilmic(color);
        color = linearToSRGB(color);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false
  })
}
