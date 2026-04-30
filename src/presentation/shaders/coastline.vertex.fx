// Coastline Vertex Shader
// Standard BabylonJS vertex shader boilerplate.
// Transforms position and normal into clip/world space and passes
// worldPosition (sphere XYZ) and vNormal to the fragment shader as varyings.
//
// Requirements: 6.1

// ── BabylonJS built-in attributes ────────────────────────────────────────────
attribute vec3 position;
attribute vec3 normal;

// ── BabylonJS built-in uniforms ──────────────────────────────────────────────
// worldViewProjection: model-view-projection matrix (MVP)
uniform mat4 worldViewProjection;
// world: model matrix (object → world space)
uniform mat4 world;
// worldInverseTranspose: used for correct normal transformation
uniform mat4 worldInverseTranspose;

// ── Varyings passed to the fragment shader ───────────────────────────────────
// World-space position on the unit sphere (XYZ)
varying vec3 vWorldPos;
// World-space normal (unit length)
varying vec3 vNormal;

void main(void) {
    // Transform position to clip space
    gl_Position = worldViewProjection * vec4(position, 1.0);

    // World-space position (sphere XYZ) — used by the fragment shader to
    // derive equirectangular UV via xyzToUV()
    vWorldPos = (world * vec4(position, 1.0)).xyz;

    // Transform normal using the inverse-transpose of the world matrix so that
    // non-uniform scaling does not distort the normal direction
    vNormal = normalize((worldInverseTranspose * vec4(normal, 0.0)).xyz);
}
