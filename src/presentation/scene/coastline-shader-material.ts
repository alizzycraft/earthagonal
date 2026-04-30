/**
 * CoastlineShaderMaterial
 *
 * A BabylonJS ShaderMaterial that renders the Goldberg sphere with SDF-driven
 * coastlines, foam, and physically-plausible terrain lighting.
 *
 * The vertex and fragment shaders are registered into BabylonJS's shader store
 * so they are available without requiring a network fetch.
 *
 * Uniforms:
 *   sdfTexture      — packed RGBA: R=SDF, G=gradX, B=gradY, A=landMask
 *   heightTexture   — R=landMask, G=elevation, B=depth (height-combined.png)
 *   uLightDirection — world-space light direction (normalised)
 *   uTime           — elapsed time in seconds (for animated foam)
 *
 * Requirements: 6.1, 6.2, 6.3
 */

import * as BABYLON from '@babylonjs/core'

// ---------------------------------------------------------------------------
// Shader source
// ---------------------------------------------------------------------------

/**
 * Vertex shader source.
 * Mirrors the content of src/presentation/shaders/coastline.vertex.fx.
 * Registered in BABYLON.Effect.ShadersStore as "coastlineVertexShader".
 */
const COASTLINE_VERTEX_SHADER = /* glsl */ `
// Coastline Vertex Shader
// Standard BabylonJS vertex shader boilerplate.
// Transforms position and normal into clip/world space and passes
// worldPosition (sphere XYZ) and vNormal to the fragment shader as varyings.
//
// Requirements: 6.1

// BabylonJS built-in attributes
attribute vec3 position;
attribute vec3 normal;

// BabylonJS built-in uniforms
uniform mat4 worldViewProjection;
uniform mat4 world;
uniform mat4 worldInverseTranspose;

// Varyings passed to the fragment shader
varying vec3 vWorldPos;
varying vec3 vNormal;

void main(void) {
    gl_Position = worldViewProjection * vec4(position, 1.0);
    vWorldPos = (world * vec4(position, 1.0)).xyz;
    vNormal = normalize((worldInverseTranspose * vec4(normal, 0.0)).xyz);
}
`

/**
 * Fragment shader source.
 * Mirrors the content of src/presentation/shaders/coastline.fragment.fx.
 * Registered in BABYLON.Effect.ShadersStore as "coastlineFragmentShader".
 */
const COASTLINE_FRAGMENT_SHADER = /* glsl */ `
// Coastline Fragment Shader
// Renders the Goldberg sphere with SDF-driven coastlines, foam, and
// physically-plausible terrain lighting.
//
// Requirements: 5.2, 6.1, 6.2, 6.3, 6.4, 6.5

#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D sdfTexture;
uniform sampler2D heightTexture;
uniform vec3      uLightDirection;
uniform float     uTime;

varying vec3 vWorldPos;
varying vec3 vNormal;

const float PI = 3.14159265358979;
const vec2 TEXEL = vec2(1.0 / 4096.0, 1.0 / 2048.0);

// Shared XYZ->UV equirectangular projection (mirrors TypeScript xyzToUV contract)
vec2 xyzToUV(vec3 p) {
    float lat = asin(clamp(p.y, -1.0, 1.0));
    float lon = atan(p.z, p.x);
    float u = fract((lon + PI) / (2.0 * PI));
    float v = clamp((PI * 0.5 - lat) / PI, 0.0, 1.0);
    return vec2(u, v);
}

float decodeHeight(vec4 sample) {
    return sample.g * 8848.0;
}

void main(void) {
    vec3  spherePos = normalize(vWorldPos);
    vec2  uv        = xyzToUV(spherePos);

    vec4 sdfData    = texture2D(sdfTexture,    uv);
    vec4 heightData = texture2D(heightTexture, uv);

    float sdf  = sdfData.r * 2.0 - 1.0;
    vec2  grad = sdfData.gb * 2.0 - 1.0;

    vec3 sphereNormal = normalize(vNormal);

    float hL = decodeHeight(texture2D(heightTexture, uv + vec2(-TEXEL.x,  0.0)));
    float hR = decodeHeight(texture2D(heightTexture, uv + vec2( TEXEL.x,  0.0)));
    float hD = decodeHeight(texture2D(heightTexture, uv + vec2( 0.0,     -TEXEL.y)));
    float hU = decodeHeight(texture2D(heightTexture, uv + vec2( 0.0,      TEXEL.y)));

    vec3 elevationNormal = normalize(vec3(-(hR - hL) / 3000.0,
                                         -(hU - hD) / 3000.0,
                                          1.0));

    vec3 sdfNormal = normalize(vec3(grad, 0.5));

    float coastInfluence = exp(-abs(sdf) * 40.0);
    float elevStrength   = clamp(decodeHeight(heightData) / 3000.0, 0.2, 1.0);
    float poleFade       = smoothstep(0.85, 1.0, abs(sphereNormal.y));

    vec3 combined = normalize(elevationNormal * elevStrength
                            + sdfNormal * coastInfluence * 0.3);

    vec3 finalNormal = normalize(
        mix(sphereNormal * 0.5 + combined * 0.5, sphereNormal, poleFade)
    );

    float w         = fwidth(sdf);
    float coastLine = 1.0 - smoothstep(-w, w, sdf);

    float foamNoise = 0.5 + 0.5 * sin(uv.x * 200.0 + uTime * 2.0)
                          * sin(uv.y * 200.0 + uTime * 1.7);
    float foam      = exp(-abs(sdf) * 200.0) * foamNoise;

    vec3 landColor  = vec3(0.2,  0.7,  0.3);
    vec3 oceanColor = vec3(0.1,  0.3,  0.8);
    vec3 coastColor = vec3(0.9,  0.85, 0.6);

    vec3 base = mix(oceanColor, landColor, smoothstep(-0.02, 0.02, sdf));
    base = mix(base, coastColor, coastLine);
    base = mix(base, vec3(1.0), foam * 0.3);

    float light = dot(normalize(uLightDirection), finalNormal) * 0.5 + 0.5;

    gl_FragColor = vec4(base * light, 1.0);
}
`

// Shader store key used by BabylonJS ShaderMaterial
const SHADER_NAME = 'coastline'

// Register shaders into BabylonJS's shader store once (idempotent)
function registerShaders(): void {
  const store = BABYLON.Effect.ShadersStore
  if (!store[`${SHADER_NAME}VertexShader`]) {
    store[`${SHADER_NAME}VertexShader`] = COASTLINE_VERTEX_SHADER
  }
  if (!store[`${SHADER_NAME}FragmentShader`]) {
    store[`${SHADER_NAME}FragmentShader`] = COASTLINE_FRAGMENT_SHADER
  }
}

// ---------------------------------------------------------------------------
// CoastlineShaderMaterial
// ---------------------------------------------------------------------------

/**
 * Factory and controller for the BabylonJS ShaderMaterial used to render
 * SDF-driven coastlines on the Goldberg sphere.
 *
 * Usage:
 * ```ts
 * const csm = new CoastlineShaderMaterial()
 * const mat = csm.create(scene, sdfTexture, heightTexture)
 * mesh.material = mat
 *
 * // Per-frame updates
 * csm.setLightDirection(lightDir)
 * csm.setTime(elapsedSeconds)
 * ```
 *
 * Requirements: 6.1, 6.2, 6.3
 */
export class CoastlineShaderMaterial {
  private material: BABYLON.ShaderMaterial | null = null

  /**
   * Create and return a configured BabylonJS ShaderMaterial.
   *
   * Registers the coastline vertex/fragment shaders into BabylonJS's shader
   * store (idempotent) and wires `sdfTexture` and `heightTexture` as uniforms.
   *
   * @param scene         Active BabylonJS Scene.
   * @param sdfTexture    Packed RGBA SDF texture (R=SDF, G=gradX, B=gradY, A=mask).
   * @param heightTexture Height-combined texture (R=mask, G=elevation, B=depth).
   * @returns             The configured ShaderMaterial ready to assign to a mesh.
   */
  create(
    scene: BABYLON.Scene,
    sdfTexture: BABYLON.Texture,
    heightTexture: BABYLON.Texture,
  ): BABYLON.ShaderMaterial {
    registerShaders()

    this.material = new BABYLON.ShaderMaterial(
      'coastlineShaderMaterial',
      scene,
      SHADER_NAME,
      {
        attributes: ['position', 'normal'],
        uniforms: [
          'worldViewProjection',
          'world',
          'worldInverseTranspose',
          'uLightDirection',
          'uTime',
        ],
        samplers: ['sdfTexture', 'heightTexture'],
        needAlphaBlending: false,
      },
    )

    // Wire textures as shader uniforms (Requirements 6.1)
    this.material.setTexture('sdfTexture', sdfTexture)
    this.material.setTexture('heightTexture', heightTexture)

    // Sensible defaults
    this.material.setVector3(
      'uLightDirection',
      new BABYLON.Vector3(1, 1, 0).normalize(),
    )
    this.material.setFloat('uTime', 0)

    // Disable back-face culling so the sphere interior is also rendered
    this.material.backFaceCulling = false

    return this.material
  }

  /**
   * Update the light direction uniform.
   *
   * Should be called whenever the light source moves (e.g. once per frame
   * when the headlamp follows the camera).
   *
   * @param dir World-space light direction vector (need not be normalised;
   *            normalisation is performed in the fragment shader).
   *
   * Requirements: 6.2
   */
  setLightDirection(dir: BABYLON.Vector3): void {
    if (!this.material) {
      throw new Error(
        'CoastlineShaderMaterial: call create() before setLightDirection()',
      )
    }
    this.material.setVector3('uLightDirection', dir)
  }

  /**
   * Update the time uniform used for animated foam rendering.
   *
   * Should be called once per frame with the elapsed time in seconds.
   *
   * @param t Elapsed time in seconds.
   *
   * Requirements: 6.3
   */
  setTime(t: number): void {
    if (!this.material) {
      throw new Error(
        'CoastlineShaderMaterial: call create() before setTime()',
      )
    }
    this.material.setFloat('uTime', t)
  }

  /**
   * Dispose the underlying ShaderMaterial and release GPU resources.
   */
  dispose(): void {
    if (this.material) {
      this.material.dispose()
      this.material = null
    }
  }
}
