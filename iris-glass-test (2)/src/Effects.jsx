import { useThree, useFrame } from '@react-three/fiber'
import { EffectComposer, RenderPass, EffectPass, BloomEffect, ToneMappingEffect, FXAAEffect } from 'postprocessing'
import { useEffect, useState } from 'react'
import { SSGIEffect, VelocityDepthNormalPass } from './realism-effects/v2'

export function Effects() {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const [composer] = useState(() => new EffectComposer(gl, { multisampling: 0 }))

  useEffect(() => composer.setSize(size.width, size.height), [composer, size])

  useEffect(() => {
    const config = {
      importanceSampling: true,
      steps: 16,
      refineSteps: 4,
      spp: 1,
      resolutionScale: 0.75,
      missedRays: false,
      distance: 5.98,
      thickness: 2.83,
      denoiseIterations: 1,
      denoiseKernel: 3,
      denoiseDiffuse: 25,
      denoiseSpecular: 25.54,
      radius: 11,
      phi: 0.576,
      lumaPhi: 20.65,
      depthPhi: 23.37,
      normalPhi: 26.087,
      roughnessPhi: 18.478,
      specularPhi: 7.1,
      envBlur: 0.8
    }

    const renderPass = new RenderPass(scene, camera)
    const velocityDepthNormalPass = new VelocityDepthNormalPass(scene, camera)
    composer.addPass(renderPass)
    composer.addPass(velocityDepthNormalPass)
    composer.addPass(
      new EffectPass(camera, new SSGIEffect(composer, scene, camera, { ...config, velocityDepthNormalPass }))
    )
    composer.addPass(
      new EffectPass(camera, new BloomEffect({ mipmapBlur: true, luminanceThreshold: 0.2, intensity: 0.6, levels: 6 }))
    )
    composer.addPass(new EffectPass(camera, new FXAAEffect(), new ToneMappingEffect()))

    return () => {
      composer.removeAllPasses()
    }
  }, [composer, camera, scene])

  useFrame((_, delta) => {
    gl.autoClear = true
    composer.render(delta)
  }, 1)

  return null
}
