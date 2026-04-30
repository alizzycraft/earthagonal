// Coastline Fragment Shader
// Renders the Goldberg sphere with SDF-driven coastlines, foam, and
// physically-plausible terrain lighting.
//
// Textures:
//   sdfTexture    — packed RGBA: R=SDF, G=gradX, B=gradY, A=landMask
//   heightTexture — R=landMask, G=elevation, B=depth (height-combined.png)
//
// Uniforms:
//   uLightDirection — world-space light direction (normalised)
//   uTime           — elapsed time in seconds (for animated foam)
//
// Requirements: 5.2, 6.1, 6.2, 6.3, 6.4, 6.5

#ifdef GL_ES
precision highp float;
#endif

// ── Uniforms ─────────────────────────────────────────────────────────────────
uniform sampler2D sdfTexture;
uniform sampler2D heightTexture;
uniform vec3      uLightDirection;
uniform float     uTime;

// ── Varyings from vertex shader ───────────────────────────────────────────────
varying vec3 vWorldPos;
varying vec3 vNormal;

// ── Constants ─────────────────────────────────────────────────────────────────
const float PI = 3.14159265358979;

// Texel size for the height/SDF textures (4096 × 2048 matches height-combined.png)
const vec2 TEXEL = vec2(1.0 / 4096.0, 1.0 / 2048.0);

// ── Shared XYZ→UV equirectangular projection ──────────────────────────────────
// This function is the GLSL mirror of the TypeScript xyzToUV() contract.
// Any change here must be reflected in terrain-sampler.ts (and vice-versa).
//
// Precondition:  p is a normalised unit-sphere vector.
// Postconditions:
//   u ∈ [0, 1)  — longitude wrapped with fract()
//   v ∈ [0, 1]  — latitude clamped at poles
//
// Validates: Requirements 5.2
vec2 xyzToUV(vec3 p) {
    float lat = asin(clamp(p.y, -1.0, 1.0));
    float lon = atan(p.z, p.x);
    float u = fract((lon + PI) / (2.0 * PI));
    float v = clamp((PI * 0.5 - lat) / PI, 0.0, 1.0);
    return vec2(u, v);
}

// ── Height decode helper ───────────────────────────────────────────────────────
// Reads the G channel of heightTexture (elevation encoded in [0,1]) and
// converts it to a world-space elevation value in metres (0–8848 m range).
float decodeHeight(vec4 sample) {
    return sample.g * 8848.0;
}

// ── Main ──────────────────────────────────────────────────────────────────────
void main(void) {
    // ── 1. Derive equirectangular UV from world position ──────────────────────
    vec3  spherePos = normalize(vWorldPos);
    vec2  uv        = xyzToUV(spherePos);

    // ── 2. Sample textures ────────────────────────────────────────────────────
    vec4 sdfData    = texture2D(sdfTexture,    uv);
    vec4 heightData = texture2D(heightTexture, uv);

    // ── 3. Decode SDF and gradient (Requirements 6.1) ─────────────────────────
    // R channel: sdf = r * 2.0 - 1.0  →  [-1, +1]  (positive = land)
    // GB channels: grad = gb * 2.0 - 1.0  →  [-1, +1] unit gradient vector
    float sdf  = sdfData.r * 2.0 - 1.0;
    vec2  grad = sdfData.gb * 2.0 - 1.0;

    // ── 4. Sphere base normal ─────────────────────────────────────────────────
    vec3 sphereNormal = normalize(vNormal);

    // ── 5. Elevation normal via central differences on heightTexture ──────────
    // (Requirements 6.4)
    float hL = decodeHeight(texture2D(heightTexture, uv + vec2(-TEXEL.x,  0.0)));
    float hR = decodeHeight(texture2D(heightTexture, uv + vec2( TEXEL.x,  0.0)));
    float hD = decodeHeight(texture2D(heightTexture, uv + vec2( 0.0,     -TEXEL.y)));
    float hU = decodeHeight(texture2D(heightTexture, uv + vec2( 0.0,      TEXEL.y)));

    // Tangent-space normal from height differences; Z=1 is the "up" direction
    // in texture space.  Scale factor (1/3000) keeps the normal reasonable for
    // typical mountain heights.
    vec3 elevationNormal = normalize(vec3(-(hR - hL) / 3000.0,
                                         -(hU - hD) / 3000.0,
                                          1.0));

    // ── 6. SDF gradient normal ────────────────────────────────────────────────
    // Lift the 2-D gradient into a 3-D tangent-space normal; Z=0.5 gives a
    // moderate bump contribution near the coastline.
    vec3 sdfNormal = normalize(vec3(grad, 0.5));

    // ── 7. Blend normals with pole fade (Requirements 6.4) ───────────────────
    // Coast influence: strongest at the zero-crossing, falls off exponentially.
    float coastInfluence = exp(-abs(sdf) * 40.0);

    // Elevation strength: mountains dominate, minimum 0.2 even in flat areas.
    float elevStrength = clamp(decodeHeight(heightData) / 3000.0, 0.2, 1.0);

    // Pole fade: suppress distortion near poles where the equirectangular
    // projection is most distorted.
    float poleFade = smoothstep(0.85, 1.0, abs(sphereNormal.y));

    // Combined tangent-space normal (elevation + SDF coast contribution)
    vec3 combined = normalize(elevationNormal * elevStrength
                            + sdfNormal * coastInfluence * 0.3);

    // Final normal: blend combined with sphere normal, then fade to sphere at poles
    vec3 finalNormal = normalize(
        mix(sphereNormal * 0.5 + combined * 0.5, sphereNormal, poleFade)
    );

    // ── 8. Coastline band and foam (Requirements 6.5) ─────────────────────────
    // fwidth(sdf) gives the screen-space derivative — used for anti-aliased
    // coastline edges that are always exactly 1 pixel wide regardless of zoom.
    float w         = fwidth(sdf);
    float coastLine = 1.0 - smoothstep(-w, w, sdf);

    // Foam: tight exponential band around the zero-crossing, animated with uTime
    float foamNoise = 0.5 + 0.5 * sin(uv.x * 200.0 + uTime * 2.0)
                          * sin(uv.y * 200.0 + uTime * 1.7);
    float foam      = exp(-abs(sdf) * 200.0) * foamNoise;

    // ── 9. Base colour blend ──────────────────────────────────────────────────
    vec3 landColor  = vec3(0.2,  0.7,  0.3);
    vec3 oceanColor = vec3(0.1,  0.3,  0.8);
    vec3 coastColor = vec3(0.9,  0.85, 0.6);

    // Smooth land/ocean transition centred on the SDF zero-crossing
    vec3 base = mix(oceanColor, landColor, smoothstep(-0.02, 0.02, sdf));
    // Overlay the sandy coastline band
    base = mix(base, coastColor, coastLine);
    // Add white foam
    base = mix(base, vec3(1.0), foam * 0.3);

    // ── 10. Diffuse lighting ──────────────────────────────────────────────────
    // Half-Lambert (remapped to [0,1]) for a softer look on the night side.
    float light = dot(normalize(uLightDirection), finalNormal) * 0.5 + 0.5;

    vec3 finalColor = base * light;

    gl_FragColor = vec4(finalColor, 1.0);
}
