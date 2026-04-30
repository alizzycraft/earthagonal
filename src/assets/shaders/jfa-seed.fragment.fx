// JFA Seed Pass Fragment Shader
// Detects coastline pixels (land/water boundary) in the mask texture R channel.
// Outputs seed UV in RG channels; A=1.0 for seeded pixels, A=0.0 for unseeded.
//
// Requirements: 1.1

#ifdef GL_ES
precision highp float;
#endif

// The mask texture: R channel = binary land mask (1.0 = land, 0.0 = ocean)
uniform sampler2D uMaskTexture;

// Texel size for neighbour sampling
uniform vec2 uTexelSize;

// Interpolated UV from the full-screen quad vertex shader
varying vec2 vUV;

void main(void) {
    float center = texture2D(uMaskTexture, vUV).r;

    // Sample the 4-connected neighbours to detect land/water boundaries
    float left  = texture2D(uMaskTexture, vUV + vec2(-uTexelSize.x, 0.0)).r;
    float right = texture2D(uMaskTexture, vUV + vec2( uTexelSize.x, 0.0)).r;
    float down  = texture2D(uMaskTexture, vUV + vec2(0.0, -uTexelSize.y)).r;
    float up    = texture2D(uMaskTexture, vUV + vec2(0.0,  uTexelSize.y)).r;

    // A pixel is a coastline seed if it sits on a land/water boundary:
    // i.e. the centre value differs from at least one neighbour.
    // We threshold at 0.5 to convert the float mask to a binary value.
    float c = step(0.5, center);
    float l = step(0.5, left);
    float r = step(0.5, right);
    float d = step(0.5, down);
    float u = step(0.5, up);

    // isCoast = 1.0 when any neighbour has a different land/water classification
    float isCoast = step(0.5, abs(c - l) + abs(c - r) + abs(c - d) + abs(c - u));

    // Seeded pixels store their own UV as the nearest-seed coordinate.
    // Unseeded pixels output (-1, -1) in RG and A=0.0.
    vec2 seedUV = mix(vec2(-1.0, -1.0), vUV, isCoast);
    float seeded = isCoast;

    gl_FragColor = vec4(seedUV, 0.0, seeded);
}
