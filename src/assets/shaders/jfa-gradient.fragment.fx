// JFA Gradient Pass Fragment Shader
// Computes the central-difference gradient over the signed distance texture
// produced by the distance pass, then outputs the normalized gradient vector
// packed into the RG channels.
//
// Input (from distance pass):
//   R = raw signed distance (positive = land, negative = ocean)
//   A = land mask (0.0 or 1.0)
//
// Output (packed, ready for the final pack pass or direct use):
//   R = gradient X packed to [0,1] via gx * 0.5 + 0.5
//   G = gradient Y packed to [0,1] via gy * 0.5 + 0.5
//   B = 0.0 (unused)
//   A = land mask (pass-through)
//
// The gradient magnitude should be ≈ 1.0 everywhere (Eikonal property).
//
// Requirements: 2.4

#ifdef GL_ES
precision highp float;
#endif

// Signed distance texture from the distance pass (R = signed dist, A = mask)
uniform sampler2D uDistanceTexture;

// Texel size (1/width, 1/height)
uniform vec2 uTexelSize;

// Interpolated UV from the full-screen quad vertex shader
varying vec2 vUV;

void main(void) {
    // Central-difference gradient in UV space
    float dL = texture2D(uDistanceTexture, vUV + vec2(-uTexelSize.x, 0.0)).r;
    float dR = texture2D(uDistanceTexture, vUV + vec2( uTexelSize.x, 0.0)).r;
    float dD = texture2D(uDistanceTexture, vUV + vec2(0.0, -uTexelSize.y)).r;
    float dU = texture2D(uDistanceTexture, vUV + vec2(0.0,  uTexelSize.y)).r;

    // Raw gradient (rise over run in UV space)
    vec2 grad = vec2(dR - dL, dU - dD) * 0.5;

    // Normalise to unit length (Eikonal property: |∇SDF| = 1)
    float len = length(grad);
    if (len > 1e-6) {
        grad = grad / len;
    } else {
        // At the exact coastline seed the gradient is undefined; default to +X
        grad = vec2(1.0, 0.0);
    }

    // Pack gradient components from [-1, 1] to [0, 1]
    vec2 packedGrad = grad * 0.5 + 0.5;

    // Pass the land mask through from the distance texture
    float mask = texture2D(uDistanceTexture, vUV).a;

    gl_FragColor = vec4(packedGrad, 0.0, mask);
}
