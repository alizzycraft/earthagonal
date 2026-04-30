// JFA Distance Pass Fragment Shader
// Computes the Euclidean distance from each texel to its nearest seed UV
// (stored in the final JFA ping-pong texture) and applies the sign from the
// land mask: positive = land interior, negative = ocean.
//
// Output (raw float, not yet packed):
//   R = signed distance (positive = land, negative = ocean)
//   G = 0.0 (unused at this stage)
//   B = 0.0 (unused at this stage)
//   A = land mask value (0.0 or 1.0)
//
// Requirements: 1.1, 1.2

#ifdef GL_ES
precision highp float;
#endif

// Final JFA texture: RG = nearest seed UV, A = 1.0 if valid seed found
uniform sampler2D uJFATexture;

// Original land/water mask: R = 1.0 (land) or 0.0 (ocean)
uniform sampler2D uMaskTexture;

// Maximum distance used for normalisation (in UV space).
// Typically set to the diagonal length of the texture (sqrt(2) ≈ 1.414).
uniform float uMaxDist;

// Interpolated UV from the full-screen quad vertex shader
varying vec2 vUV;

void main(void) {
    vec4 jfa = texture2D(uJFATexture, vUV);
    float mask = texture2D(uMaskTexture, vUV).r;

    float signedDist = 0.0;

    if (jfa.a > 0.5) {
        // Euclidean distance from this texel to its nearest coastline seed
        vec2 diff = vUV - jfa.rg;
        float dist = length(diff);

        // Apply sign: land pixels get positive distance, ocean pixels get negative.
        // step(0.5, mask) = 1.0 for land, 0.0 for ocean.
        float landSign = step(0.5, mask) * 2.0 - 1.0; // +1 land, -1 ocean
        signedDist = dist * landSign;
    }
    // If no valid seed was found (should not happen after a full JFA run),
    // leave signedDist = 0.0 (treated as coastline).

    gl_FragColor = vec4(signedDist, 0.0, 0.0, step(0.5, mask));
}
