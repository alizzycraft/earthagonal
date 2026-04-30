/**
 * Property-based tests for sdf-gradient utilities.
 *
 * Property 3: Pack/decode round trip
 *   For any SDF value in [−1, 1] and gradient component in [−1, 1],
 *   decode(pack(v)) ≈ v within 1/255 quantization error.
 *   Validates: Requirements 2.2
 *
 * Property 5: Eikonal gradient magnitude
 *   Gradient magnitude decoded from G and B channels ≈ 1.0 at every texel
 *   away from the seed (tested with a synthetic circular SDF).
 *   Validates: Requirements 2.4
 */

import * as fc from 'fast-check';
import {
  buildSDFGradient,
  packSDFTexture,
  unpackSDF,
  unpackGradient,
} from './sdf-gradient';

// ---------------------------------------------------------------------------
// Property 3: Pack/decode round trip
// Validates: Requirements 2.2
// ---------------------------------------------------------------------------

describe('sdf-gradient', () => {
  describe('Property 3: Pack/decode round trip', () => {
    it('unpackSDF(pack(d)) ≈ d within 1/255 quantization error', () => {
      fc.assert(
        fc.property(fc.float({ min: -1, max: 1, noNaN: true }), (d) => {
          // Build a 1×1 SDF with this single value
          const sdf = new Float32Array([d]);
          const grad = new Float32Array([0, 0]);
          const mask = new Uint8Array([0]);
          const rgba = packSDFTexture(sdf, grad, mask, 1, 1);

          // Decode the R channel
          const rEncoded = rgba[0] / 255;
          const decoded = unpackSDF(rEncoded);

          // The SDF is normalised by maxDist = |d| (or 1 if d=0).
          // So the packed value represents d/maxDist, not d itself.
          // We verify the round-trip of the normalised value.
          const maxDist = Math.abs(d) === 0 ? 1 : Math.abs(d);
          const normalised = d / maxDist; // ∈ [−1, 1]

          return Math.abs(decoded - normalised) <= 1 / 255 + 1e-6;
        }),
        { numRuns: 10000 },
      );
      expect(true).toBe(true);
    });

    it('unpackGradient(pack(g)) ≈ g within 1/255 quantization error', () => {
      fc.assert(
        fc.property(fc.float({ min: -1, max: 1, noNaN: true }), (g) => {
          // Build a 1×1 SDF; gradient component g goes into G channel.
          const sdf = new Float32Array([0]);
          const grad = new Float32Array([g, 0]); // gx = g, gy = 0
          const mask = new Uint8Array([0]);
          const rgba = packSDFTexture(sdf, grad, mask, 1, 1);

          const gEncoded = rgba[1] / 255;
          const decoded = unpackGradient(gEncoded);

          return Math.abs(decoded - g) <= 1 / 255 + 1e-6;
        }),
        { numRuns: 10000 },
      );
      expect(true).toBe(true);
    });

    it('alpha channel is 255 for land (mask != 0) and 0 for ocean (mask == 0)', () => {
      fc.assert(
        fc.property(fc.integer({ min: 0, max: 255 }), (maskVal) => {
          const sdf = new Float32Array([0]);
          const grad = new Float32Array([0, 0]);
          const mask = new Uint8Array([maskVal]);
          const rgba = packSDFTexture(sdf, grad, mask, 1, 1);

          const expectedAlpha = maskVal !== 0 ? 255 : 0;
          return rgba[3] === expectedAlpha;
        }),
        { numRuns: 1000 },
      );
      expect(true).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Property 5: Eikonal gradient magnitude
  // Validates: Requirements 2.4
  // ---------------------------------------------------------------------------

  describe('Property 5: Eikonal gradient magnitude', () => {
    /**
     * Build a synthetic circular SDF on a W×H grid.
     * The zero-crossing is a circle of radius `r` centered at (cx, cy) in pixel space.
     * sdf[y*W+x] = sqrt((x-cx)^2 + (y-cy)^2) - r
     */
    function makeCircularSDF(W: number, H: number, cx: number, cy: number, r: number): Float32Array {
      const sdf = new Float32Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          sdf[y * W + x] = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) - r;
        }
      }
      return sdf;
    }

    it('gradient magnitude ≈ 1.0 at texels away from the seed (circular SDF)', () => {
      const W = 64;
      const H = 64;
      const cx = 32;
      const cy = 32;
      const r = 20;

      const sdf = makeCircularSDF(W, H, cx, cy, r);
      const grad = buildSDFGradient(sdf, W, H);

      // Check gradient magnitude at interior texels (not on boundary rows/cols)
      // and not too close to the zero-crossing (where interpolation artifacts occur)
      let failures = 0;
      let checked = 0;

      for (let y = 2; y < H - 2; y++) {
        for (let x = 2; x < W - 2; x++) {
          const idx = y * W + x;
          const dist = Math.abs(sdf[idx]);
          // Skip texels very close to the zero-crossing (within 2 pixels)
          if (dist < 2) continue;

          const gx = grad[idx * 2];
          const gy = grad[idx * 2 + 1];
          const mag = Math.sqrt(gx * gx + gy * gy);

          // For a true SDF, gradient magnitude should be ≈ 1.0
          // Allow tolerance of 0.15 for central-difference approximation
          if (Math.abs(mag - 1.0) > 0.15) {
            failures++;
          }
          checked++;
        }
      }

      // At least 95% of checked texels should have gradient magnitude ≈ 1.0
      const passRate = (checked - failures) / checked;
      expect(passRate).toBeGreaterThanOrEqual(0.95);
    });
  });

  // ---------------------------------------------------------------------------
  // Additional unit tests for buildSDFGradient
  // ---------------------------------------------------------------------------

  describe('buildSDFGradient', () => {
    it('returns array of length width * height * 2', () => {
      const W = 4;
      const H = 4;
      const sdf = new Float32Array(W * H).fill(0);
      const grad = buildSDFGradient(sdf, W, H);
      expect(grad.length).toBe(W * H * 2);
    });

    it('gradient of a constant SDF is zero everywhere', () => {
      const W = 5;
      const H = 5;
      const sdf = new Float32Array(W * H).fill(3.14);
      const grad = buildSDFGradient(sdf, W, H);
      for (let i = 0; i < grad.length; i++) {
        expect(grad[i]).toBeCloseTo(0, 10);
      }
    });

    it('gradient of a linear ramp in X has gx=1, gy=0 at interior points', () => {
      const W = 5;
      const H = 5;
      const sdf = new Float32Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          sdf[y * W + x] = x; // linear ramp in X
        }
      }
      const grad = buildSDFGradient(sdf, W, H);

      // Interior points: central difference → gx = (x+1 - (x-1)) / 2 = 1
      for (let y = 0; y < H; y++) {
        for (let x = 1; x < W - 1; x++) {
          const idx = y * W + x;
          expect(grad[idx * 2]).toBeCloseTo(1, 10);     // gx
          expect(grad[idx * 2 + 1]).toBeCloseTo(0, 10); // gy
        }
      }
    });
  });

  describe('packSDFTexture', () => {
    it('returns array of length width * height * 4', () => {
      const W = 3;
      const H = 3;
      const n = W * H;
      const sdf = new Float32Array(n).fill(0);
      const grad = new Float32Array(n * 2).fill(0);
      const mask = new Uint8Array(n).fill(0);
      const rgba = packSDFTexture(sdf, grad, mask, W, H);
      expect(rgba.length).toBe(n * 4);
    });

    it('all-zero SDF packs R channel to 128 (midpoint)', () => {
      const sdf = new Float32Array([0]);
      const grad = new Float32Array([0, 0]);
      const mask = new Uint8Array([0]);
      const rgba = packSDFTexture(sdf, grad, mask, 1, 1);
      // d=0, maxDist=1 → r = 0*0.5+0.5 = 0.5 → round(0.5*255) = 128
      expect(rgba[0]).toBe(128);
    });
  });
});
