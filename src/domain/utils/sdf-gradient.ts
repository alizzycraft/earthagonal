/**
 * CPU-side SDF gradient computation and RGBA packing utilities.
 *
 * This module serves two purposes:
 *  1. Compute central-difference gradients over a signed distance field.
 *  2. Pack SDF + gradient + mask into a RGBA Uint8 texture using the same
 *     encoding as the GPU pipeline, so the CoastlineShaderMaterial shader
 *     is unchanged regardless of whether the GPU or CPU path was used.
 *
 * Encoding (matches design.md "Packed RGBA SDF Texture"):
 *   R = d / maxDist * 0.5 + 0.5   (signed distance, normalised to [0,1])
 *   G = gx * 0.5 + 0.5            (gradient X, packed to [0,1])
 *   B = gy * 0.5 + 0.5            (gradient Y, packed to [0,1])
 *   A = mask                       (0 = ocean, 255 = land)
 *
 * Decode in shader:
 *   float sdf  = r * 2.0 - 1.0;
 *   vec2  grad = gb * 2.0 - 1.0;
 *
 * Requirements: 1.6, 2.1, 2.2
 */

// ---------------------------------------------------------------------------
// buildSDFGradient
// ---------------------------------------------------------------------------

/**
 * Compute the central-difference gradient of a signed distance field.
 *
 * For each texel (x, y) the gradient is:
 *   gx = (sdf[x+1, y] - sdf[x-1, y]) / 2
 *   gy = (sdf[x, y+1] - sdf[x, y-1]) / 2
 *
 * Boundary texels use one-sided differences (forward/backward).
 *
 * @param sdf    Flat Float32Array of length width × height (row-major).
 * @param width  Texture width in texels.
 * @param height Texture height in texels.
 * @returns      Interleaved Float32Array of length width × height × 2,
 *               where element [2*i] = gx and [2*i+1] = gy for texel i.
 */
export function buildSDFGradient(
  sdf: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const grad = new Float32Array(width * height * 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // Central difference in X; fall back to one-sided at boundaries.
      let gx: number;
      if (x === 0) {
        gx = sdf[idx + 1] - sdf[idx];
      } else if (x === width - 1) {
        gx = sdf[idx] - sdf[idx - 1];
      } else {
        gx = (sdf[idx + 1] - sdf[idx - 1]) * 0.5;
      }

      // Central difference in Y; fall back to one-sided at boundaries.
      let gy: number;
      if (y === 0) {
        gy = sdf[idx + width] - sdf[idx];
      } else if (y === height - 1) {
        gy = sdf[idx] - sdf[idx - width];
      } else {
        gy = (sdf[idx + width] - sdf[idx - width]) * 0.5;
      }

      grad[idx * 2] = gx;
      grad[idx * 2 + 1] = gy;
    }
  }

  return grad;
}

// ---------------------------------------------------------------------------
// packSDFTexture
// ---------------------------------------------------------------------------

/**
 * Pack a signed distance field, its gradient, and a land mask into a RGBA
 * Uint8Array using the encoding defined in the design document.
 *
 * The `maxDist` used for normalising the SDF is derived automatically as the
 * maximum absolute value present in the `sdf` array.  If the array is all
 * zeros (degenerate case) `maxDist` is set to 1 to avoid division by zero.
 *
 * @param sdf    Flat Float32Array of length width × height.
 * @param grad   Interleaved Float32Array of length width × height × 2
 *               (output of `buildSDFGradient`).
 * @param mask   Uint8Array of length width × height; non-zero = land.
 * @param width  Texture width in texels.
 * @param height Texture height in texels.
 * @returns      RGBA Uint8Array of length width × height × 4.
 */
export function packSDFTexture(
  sdf: Float32Array,
  grad: Float32Array,
  mask: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const n = width * height;
  const rgba = new Uint8Array(n * 4);

  // Determine the maximum absolute SDF value for normalisation.
  let maxDist = 0;
  for (let i = 0; i < n; i++) {
    const abs = Math.abs(sdf[i]);
    if (abs > maxDist) maxDist = abs;
  }
  if (maxDist === 0) maxDist = 1;

  for (let i = 0; i < n; i++) {
    const d = sdf[i];
    const gx = grad[i * 2];
    const gy = grad[i * 2 + 1];

    // Encode to [0, 1] then scale to [0, 255].
    const r = (d / maxDist) * 0.5 + 0.5;
    const g = gx * 0.5 + 0.5;
    const b = gy * 0.5 + 0.5;
    const a = mask[i] !== 0 ? 1.0 : 0.0;

    rgba[i * 4] = Math.round(clamp01(r) * 255);
    rgba[i * 4 + 1] = Math.round(clamp01(g) * 255);
    rgba[i * 4 + 2] = Math.round(clamp01(b) * 255);
    rgba[i * 4 + 3] = Math.round(a * 255);
  }

  return rgba;
}

// ---------------------------------------------------------------------------
// Decode helpers
// ---------------------------------------------------------------------------

/**
 * Decode the R channel of a packed RGBA texel back to a normalised SDF value
 * in [−1, 1].
 *
 * Inverse of the R encoding: `r_encoded = d/maxDist * 0.5 + 0.5`.
 * This helper decodes the *normalised* distance (i.e. d/maxDist), not the
 * world-space distance.  Multiply by `maxDist` if the absolute distance is
 * needed.
 *
 * @param r  R channel value in [0, 1] (divide the raw Uint8 byte by 255
 *           before passing it here).
 * @returns  Decoded SDF value in [−1, 1].
 */
export function unpackSDF(r: number): number {
  return r * 2.0 - 1.0;
}

/**
 * Decode a G or B channel of a packed RGBA texel back to a gradient component
 * in [−1, 1].
 *
 * Inverse of the G/B encoding: `c_encoded = component * 0.5 + 0.5`.
 *
 * @param c  Channel value in [0, 1] (divide the raw Uint8 byte by 255 before
 *           passing it here).
 * @returns  Decoded gradient component in [−1, 1].
 */
export function unpackGradient(c: number): number {
  return c * 2.0 - 1.0;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
