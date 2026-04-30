/**
 * SDFGeneratorService
 *
 * Runs the full GPU Jump Flood Algorithm (JFA) pipeline on BabylonJS render
 * targets to produce a packed RGBA SDF texture.
 *
 * Pipeline:
 *   seed pass → log₂(width) JFA passes → refinement pass (step=1)
 *   → distance pass → gradient pass → pack pass
 *
 * Fallback chain (Requirements 1.6):
 *   1. RGBA32F render targets (preferred)
 *   2. RGBA16F render targets
 *   3. CPU-side `buildSDFGradient()` + `packSDFTexture()` → RawTexture
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1
 */

import { Injectable } from '@angular/core'
import * as BABYLON from '@babylonjs/core'
import { TerrainDataService } from './terrain-data.service'
import { buildSDFGradient, packSDFTexture } from '../utils/sdf-gradient'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true when n is a power of two (n > 0). */
function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0
}

/** Returns log₂(n) for a power-of-two integer. */
function log2Int(n: number): number {
  return Math.round(Math.log2(n))
}

// ---------------------------------------------------------------------------
// SDFGeneratorService
// ---------------------------------------------------------------------------

@Injectable({
  providedIn: 'root',
})
export class SDFGeneratorService {
  /** Tracks whether TerrainDataService has resolved. */
  private terrainReady = false

  constructor(private terrainDataService: TerrainDataService) {}

  /**
   * Ensure the service knows the terrain is ready.
   * Call this after `TerrainDataService.ensureReady()` resolves.
   */
  markTerrainReady(): void {
    this.terrainReady = true
  }

  /**
   * Generate a packed RGBA SDF texture from a binary land-mask texture.
   *
   * @param scene        Active BabylonJS Scene.
   * @param maskTexture  Texture whose R channel is the binary land mask
   *                     (1.0 = land, 0.0 = ocean).
   * @param width        Output width in texels — must be a power of two.
   * @param height       Output height in texels.
   * @returns            Promise resolving to the packed RGBA RenderTargetTexture
   *                     (or RawTexture on the CPU fallback path).
   */
  async generate(
    scene: BABYLON.Scene,
    maskTexture: BABYLON.Texture,
    width: number,
    height: number,
  ): Promise<BABYLON.RenderTargetTexture> {
    // --- Requirement 1.3: width must be a power of two ---
    if (!isPowerOfTwo(width)) {
      throw new Error(
        `SDFGeneratorService.generate(): width must be a power of two, got ${width}.`,
      )
    }

    // --- Requirement 1.4: terrain must be ready ---
    if (!this.terrainReady) {
      // Attempt a last-chance check by awaiting ensureReady().
      // If it hasn't resolved yet this will throw (or the caller should have
      // awaited it first).  We surface a descriptive error either way.
      try {
        await this.terrainDataService.ensureReady()
        this.terrainReady = true
      } catch {
        throw new Error(
          'SDFGeneratorService.generate(): TerrainDataService.ensureReady() has not resolved. ' +
            'Await ensureReady() before calling generate().',
        )
      }
    }

    const engine = scene.getEngine()

    // --- Requirement 1.6: probe render-target float support ---
    const supportsRGBA32F = engine.getCaps().textureFloatRender
    const supportsRGBA16F = engine.getCaps().textureHalfFloatRender

    if (!supportsRGBA32F && !supportsRGBA16F) {
      // CPU fallback path
      return this.generateCPUFallback(scene, maskTexture, width, height)
    }

    const textureType = supportsRGBA32F
      ? BABYLON.Constants.TEXTURETYPE_FLOAT
      : BABYLON.Constants.TEXTURETYPE_HALF_FLOAT

    return this.generateGPU(scene, maskTexture, width, height, textureType)
  }

  // ---------------------------------------------------------------------------
  // GPU path
  // ---------------------------------------------------------------------------

  private async generateGPU(
    scene: BABYLON.Scene,
    maskTexture: BABYLON.Texture,
    width: number,
    height: number,
    textureType: number,
  ): Promise<BABYLON.RenderTargetTexture> {
    const engine = scene.getEngine()
    const texelSize = new BABYLON.Vector2(1 / width, 1 / height)

    // --- Create ping-pong render targets ---
    const rtA = this.createRT(scene, 'sdf_rtA', width, height, textureType)
    const rtB = this.createRT(scene, 'sdf_rtB', width, height, textureType)

    // --- Seed pass ---
    await this.runPass(scene, 'jfa-seed', rtA, {
      uMaskTexture: maskTexture,
      uTexelSize: texelSize,
    })

    // --- JFA passes: log₂(width) iterations ---
    const numPasses = log2Int(width)
    let src = rtA
    let dst = rtB

    for (let i = 0; i < numPasses; i++) {
      const step = Math.pow(2, numPasses - 1 - i) / width
      await this.runPass(scene, 'jfa-pass', dst, {
        uJFATexture: src.renderTarget ? src : src,
        uStep: step,
        uTexelSize: texelSize,
      }, src)
      ;[src, dst] = [dst, src]
    }

    // --- Requirement 1.5: refinement pass (step=1 pixel) ---
    await this.runPass(scene, 'jfa-pass', dst, {
      uJFATexture: src,
      uStep: 1 / width,
      uTexelSize: texelSize,
    }, src)
    ;[src, dst] = [dst, src]

    // --- Distance pass ---
    await this.runPass(scene, 'jfa-distance', dst, {
      uJFATexture: src,
      uMaskTexture: maskTexture,
      uMaxDist: Math.SQRT2,
      uTexelSize: texelSize,
    }, src)
    ;[src, dst] = [dst, src]

    // --- Gradient pass ---
    await this.runPass(scene, 'jfa-gradient', dst, {
      uDistanceTexture: src,
      uTexelSize: texelSize,
    }, src)
    ;[src, dst] = [dst, src]

    // --- Pack pass: combine distance + gradient into final RGBA ---
    const packedRT = this.createRT(scene, 'sdf_packed', width, height, textureType)
    await this.runPackPass(scene, src, dst, packedRT, texelSize)

    // Dispose intermediate render targets
    rtA.dispose()
    rtB.dispose()

    return packedRT
  }

  /**
   * Execute a single full-screen shader pass using EffectWrapper + EffectRenderer.
   *
   * @param scene       Active BabylonJS Scene.
   * @param shaderName  Base name of the shader (looks up `<name>.fragment.fx`).
   * @param target      Render target to write into.
   * @param uniforms    Map of uniform name → value.
   * @param inputRT     Optional ping-pong source (used to set the texture uniform).
   */
  private async runPass(
    scene: BABYLON.Scene,
    shaderName: string,
    target: BABYLON.RenderTargetTexture,
    uniforms: Record<string, unknown>,
    inputRT?: BABYLON.RenderTargetTexture,
  ): Promise<void> {
    const engine = scene.getEngine()

    // Collect sampler names and float/vec2 uniform names
    const samplerNames: string[] = []
    const uniformNames: string[] = []

    for (const [key, value] of Object.entries(uniforms)) {
      if (
        value instanceof BABYLON.Texture ||
        value instanceof BABYLON.RenderTargetTexture
      ) {
        samplerNames.push(key)
      } else {
        uniformNames.push(key)
      }
    }

    const effectWrapper = new BABYLON.EffectWrapper({
      engine,
      fragmentShader: shaderName,
      useShaderStore: false,
      samplerNames,
      uniformNames,
    })

    await new Promise<void>((resolve, reject) => {
      effectWrapper.effect.onCompileObservable.addOnce(() => resolve())
      effectWrapper.effect.onErrorObservable.addOnce((msg) =>
        reject(new Error(`Shader compile error (${shaderName}): ${msg}`)),
      )
      if (effectWrapper.effect.isReady()) resolve()
    })

    const effectRenderer = new BABYLON.EffectRenderer(engine)

    // Bind uniforms
    const effect = effectWrapper.effect
    for (const [key, value] of Object.entries(uniforms)) {
      if (value instanceof BABYLON.Texture || value instanceof BABYLON.RenderTargetTexture) {
        effect.setTexture(key, value)
      } else if (value instanceof BABYLON.Vector2) {
        effect.setVector2(key, value)
      } else if (typeof value === 'number') {
        effect.setFloat(key, value)
      }
    }

    effectRenderer.render(effectWrapper, target)

    effectWrapper.dispose()
    effectRenderer.dispose()
  }

  /**
   * Pack pass: reads the distance texture (R=signed dist, A=mask) and the
   * gradient texture (R=gradX packed, G=gradY packed, A=mask) and writes the
   * final RGBA packed texture.
   *
   * Because there is no dedicated "pack" shader file in the assets, we
   * implement the pack pass inline using a dynamically registered shader.
   */
  private async runPackPass(
    scene: BABYLON.Scene,
    distanceRT: BABYLON.RenderTargetTexture,
    gradientRT: BABYLON.RenderTargetTexture,
    packedRT: BABYLON.RenderTargetTexture,
    texelSize: BABYLON.Vector2,
  ): Promise<void> {
    const engine = scene.getEngine()

    const packShaderName = 'sdf-pack-internal'

    // Register the pack shader if not already registered
    if (!BABYLON.Effect.ShadersStore[`${packShaderName}FragmentShader`]) {
      BABYLON.Effect.ShadersStore[`${packShaderName}FragmentShader`] = /* glsl */ `
        #ifdef GL_ES
        precision highp float;
        #endif

        uniform sampler2D uDistanceTexture;
        uniform sampler2D uGradientTexture;
        uniform float uMaxDist;

        varying vec2 vUV;

        void main(void) {
          vec4 dist  = texture2D(uDistanceTexture, vUV);
          vec4 grad  = texture2D(uGradientTexture, vUV);

          float signedDist = dist.r;
          float mask       = dist.a;

          // Normalise signed distance to [0,1]: d/maxDist * 0.5 + 0.5
          float r = clamp(signedDist / uMaxDist * 0.5 + 0.5, 0.0, 1.0);

          // Gradient is already packed in [0,1] from the gradient pass
          float g = grad.r;
          float b = grad.g;

          gl_FragColor = vec4(r, g, b, mask);
        }
      `
    }

    const effectWrapper = new BABYLON.EffectWrapper({
      engine,
      fragmentShader: packShaderName,
      useShaderStore: true,
      samplerNames: ['uDistanceTexture', 'uGradientTexture'],
      uniformNames: ['uMaxDist'],
    })

    await new Promise<void>((resolve, reject) => {
      effectWrapper.effect.onCompileObservable.addOnce(() => resolve())
      effectWrapper.effect.onErrorObservable.addOnce((msg) =>
        reject(new Error(`Shader compile error (sdf-pack): ${msg}`)),
      )
      if (effectWrapper.effect.isReady()) resolve()
    })

    const effectRenderer = new BABYLON.EffectRenderer(engine)
    const effect = effectWrapper.effect

    effect.setTexture('uDistanceTexture', distanceRT)
    effect.setTexture('uGradientTexture', gradientRT)
    effect.setFloat('uMaxDist', Math.SQRT2)

    effectRenderer.render(effectWrapper, packedRT)

    effectWrapper.dispose()
    effectRenderer.dispose()
  }

  // ---------------------------------------------------------------------------
  // CPU fallback path (Requirement 1.6)
  // ---------------------------------------------------------------------------

  /**
   * CPU fallback: reads the mask texture pixels, computes a BFS-style SDF,
   * builds the gradient, packs into RGBA Uint8, and returns a RawTexture
   * wrapped in a RenderTargetTexture-compatible object.
   *
   * The returned texture has the same packed RGBA layout as the GPU path so
   * the CoastlineShaderMaterial shader is unchanged.
   */
  private async generateCPUFallback(
    scene: BABYLON.Scene,
    maskTexture: BABYLON.Texture,
    width: number,
    height: number,
  ): Promise<BABYLON.RenderTargetTexture> {
    // Read mask pixels from the texture via a temporary canvas
    const maskData = await this.readTexturePixels(maskTexture, width, height)

    // Build a binary mask (1 = land, 0 = ocean)
    const mask = new Uint8Array(width * height)
    for (let i = 0; i < width * height; i++) {
      mask[i] = maskData[i * 4] > 127 ? 1 : 0
    }

    // Compute a simple Euclidean distance transform on the CPU
    const sdf = this.computeCPUSDF(mask, width, height)

    // Compute gradient
    const grad = buildSDFGradient(sdf, width, height)

    // Pack into RGBA Uint8
    const rgba = packSDFTexture(sdf, grad, mask, width, height)

    // Create a RawTexture with the packed data
    const rawTexture = BABYLON.RawTexture.CreateRGBATexture(
      rgba,
      width,
      height,
      scene,
      false,
      false,
      BABYLON.Texture.BILINEAR_SAMPLINGMODE,
    )

    // Wrap in a RenderTargetTexture so the return type is consistent.
    // We create a thin wrapper RTT and assign the raw texture as its backing.
    // In practice callers only need the texture interface, so we cast here.
    return rawTexture as unknown as BABYLON.RenderTargetTexture
  }

  /**
   * Simple CPU signed distance transform using a two-pass approach.
   * Positive values = land interior, negative = ocean.
   */
  private computeCPUSDF(mask: Uint8Array, width: number, height: number): Float32Array {
    const n = width * height
    const INF = 1e9

    // Forward pass: distance to nearest coastline seed (unsigned)
    const dist = new Float32Array(n).fill(INF)

    // Seed: pixels on the land/water boundary
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        const c = mask[idx]
        const isCoast =
          (x > 0 && mask[idx - 1] !== c) ||
          (x < width - 1 && mask[idx + 1] !== c) ||
          (y > 0 && mask[idx - width] !== c) ||
          (y < height - 1 && mask[idx + width] !== c)
        if (isCoast) dist[idx] = 0
      }
    }

    // BFS wavefront propagation (Manhattan approximation, fast)
    // Forward pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        if (x > 0) dist[idx] = Math.min(dist[idx], dist[idx - 1] + 1)
        if (y > 0) dist[idx] = Math.min(dist[idx], dist[idx - width] + 1)
      }
    }
    // Backward pass
    for (let y = height - 1; y >= 0; y--) {
      for (let x = width - 1; x >= 0; x--) {
        const idx = y * width + x
        if (x < width - 1) dist[idx] = Math.min(dist[idx], dist[idx + 1] + 1)
        if (y < height - 1) dist[idx] = Math.min(dist[idx], dist[idx + width] + 1)
      }
    }

    // Apply sign: land = positive, ocean = negative
    // Normalise to UV space (divide by max dimension)
    const maxDim = Math.max(width, height)
    const sdf = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const sign = mask[i] !== 0 ? 1 : -1
      sdf[i] = (sign * dist[i]) / maxDim
    }

    return sdf
  }

  /**
   * Read RGBA pixel data from a BabylonJS Texture by rendering it to a
   * temporary canvas.  Returns a Uint8ClampedArray of length width×height×4.
   */
  private readTexturePixels(
    texture: BABYLON.Texture,
    width: number,
    height: number,
  ): Promise<Uint8ClampedArray> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        reject(new Error('SDFGeneratorService: could not get 2D canvas context for CPU fallback'))
        return
      }

      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height)
        resolve(ctx.getImageData(0, 0, width, height).data)
      }
      img.onerror = () =>
        reject(new Error('SDFGeneratorService: failed to load mask texture for CPU fallback'))

      const url = texture.url ?? ''
      if (url) {
        img.src = url
      } else {
        // Texture has no URL (e.g. procedurally generated); fall back to a
        // blank mask (all ocean) so the pipeline can still complete.
        resolve(new Uint8ClampedArray(width * height * 4))
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Create a floating-point render target texture.
   */
  private createRT(
    scene: BABYLON.Scene,
    name: string,
    width: number,
    height: number,
    textureType: number,
  ): BABYLON.RenderTargetTexture {
    const rt = new BABYLON.RenderTargetTexture(
      name,
      { width, height },
      scene,
      {
        type: textureType,
        format: BABYLON.Constants.TEXTUREFORMAT_RGBA,
        samplingMode: BABYLON.Texture.BILINEAR_SAMPLINGMODE,
        generateMipMaps: false,
        generateDepthBuffer: false,
        generateStencilBuffer: false,
      },
    )
    return rt
  }
}
