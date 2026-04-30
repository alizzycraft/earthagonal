// JFA Pass Fragment Shader
// Implements one iteration of the Jump Flood Algorithm.
// Samples 8 neighbours at ±uStep offsets and propagates the nearest valid seed.
//
// Input texture layout (from seed pass or previous JFA pass):
//   RG = seed UV position (or (-1,-1) if unseeded)
//   A  = 1.0 if this texel carries a valid seed, 0.0 otherwise
//
// Requirements: 1.1

#ifdef GL_ES
precision highp float;
#endif

// The ping-pong texture from the previous pass
uniform sampler2D uJFATexture;

// Current jump distance in UV space (halved each pass)
uniform float uStep;

// Texel size (1/width, 1/height)
uniform vec2 uTexelSize;

// Interpolated UV from the full-screen quad vertex shader
varying vec2 vUV;

void main(void) {
    // Start with the current texel's seed data
    vec4 current = texture2D(uJFATexture, vUV);
    vec2 bestSeed = current.rg;
    float bestValid = current.a;
    float bestDist = 1e9;

    // If we already have a valid seed, initialise bestDist to its distance
    if (bestValid > 0.5) {
        vec2 diff = vUV - bestSeed;
        bestDist = dot(diff, diff); // squared distance is fine for comparison
    }

    // Sample all 8 neighbours (3×3 grid minus centre) at the current step size
    for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
            if (dx == 0 && dy == 0) continue;

            vec2 offset = vec2(float(dx), float(dy)) * uStep;
            vec2 sampleUV = vUV + offset;

            // Clamp to [0,1] — seeds outside the texture boundary are ignored
            if (sampleUV.x < 0.0 || sampleUV.x > 1.0 ||
                sampleUV.y < 0.0 || sampleUV.y > 1.0) {
                continue;
            }

            vec4 neighbour = texture2D(uJFATexture, sampleUV);

            // Only consider neighbours that carry a valid seed
            if (neighbour.a < 0.5) continue;

            vec2 candidateSeed = neighbour.rg;
            vec2 diff = vUV - candidateSeed;
            float dist = dot(diff, diff);

            if (dist < bestDist) {
                bestDist = dist;
                bestSeed = candidateSeed;
                bestValid = 1.0;
            }
        }
    }

    gl_FragColor = vec4(bestSeed, 0.0, bestValid);
}
