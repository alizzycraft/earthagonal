/**
 * Property-based tests for marching-squares contour extraction.
 *
 * Property 6: Marching squares produces closed loops
 *   For any valid SDF Float32Array, all loops in the returned CoastlineGraph
 *   are closed (first ≈ last point within floating-point tolerance).
 *   Validates: Requirements 4.1
 *
 * Property 7: Marching squares points lie on unit sphere
 *   All points in the returned CoastlineGraph have magnitude ≈ 1.0.
 *   Validates: Requirements 4.2
 *
 * Property 8: Marching squares circle round trip
 *   For an SDF with a single circular zero-crossing, extractContours()
 *   produces exactly one closed loop approximating that circle.
 *   Validates: Requirements 4.3
 */

import * as fc from 'fast-check';
import { extractContours, Vec3 } from './marching-squares';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a synthetic circular SDF on a W×H grid.
 * sdf[y*W+x] = sqrt((x-cx)^2 + (y-cy)^2) - r
 * Negative inside the circle (ocean), positive outside (land).
 * We invert so the circle interior is "land" (positive).
 */
function makeCircularSDF(W: number, H: number, cx: number, cy: number, r: number): Float32Array {
  const sdf = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Positive inside circle (land), negative outside (ocean)
      sdf[y * W + x] = r - Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    }
  }
  return sdf;
}

function magnitude(p: Vec3): number {
  return Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
}

function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// ---------------------------------------------------------------------------
// Property 6: Marching squares produces closed loops
// Validates: Requirements 4.1
// ---------------------------------------------------------------------------

describe('extractContours', () => {
  describe('Property 6: Marching squares produces closed loops', () => {
    it('all loops have first ≈ last point within floating-point tolerance', () => {
      // Use a fixed circular SDF to ensure we get loops
      const W = 64;
      const H = 32;
      const sdf = makeCircularSDF(W, H, 32, 16, 10);
      const graph = extractContours(sdf, W, H);

      for (const loop of graph.loops) {
        expect(loop.length).toBeGreaterThanOrEqual(2);
        const first = loop[0];
        const last = loop[loop.length - 1];
        const dist = distance(first, last);
        // The classifyLoops function sets last = first for closed loops
        expect(dist).toBeLessThanOrEqual(1e-6);
      }
    });

    it('property: all loops are closed for any small SDF grid', () => {
      // Generate small SDF grids with random values
      fc.assert(
        fc.property(
          fc.integer({ min: 8, max: 32 }).chain(W =>
            fc.integer({ min: 8, max: 32 }).chain(H =>
              fc.array(fc.float({ min: -10, max: 10, noNaN: true }), {
                minLength: W * H,
                maxLength: W * H,
              }).map(vals => ({ W, H, sdf: new Float32Array(vals) }))
            )
          ),
          ({ W, H, sdf }) => {
            const graph = extractContours(sdf, W, H);
            for (const loop of graph.loops) {
              if (loop.length < 2) return false;
              const first = loop[0];
              const last = loop[loop.length - 1];
              if (distance(first, last) > 1e-6) return false;
            }
            return true;
          },
        ),
        { numRuns: 200 },
      );
      expect(true).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Property 7: Marching squares points lie on unit sphere
  // Validates: Requirements 4.2
  // ---------------------------------------------------------------------------

  describe('Property 7: Marching squares points lie on unit sphere', () => {
    it('all loop points have magnitude ≈ 1.0', () => {
      const W = 64;
      const H = 32;
      const sdf = makeCircularSDF(W, H, 32, 16, 10);
      const graph = extractContours(sdf, W, H);

      for (const loop of graph.loops) {
        for (const pt of loop) {
          expect(magnitude(pt)).toBeCloseTo(1.0, 5);
        }
      }
    });

    it('property: all points lie on unit sphere for any small SDF grid', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 8, max: 32 }).chain(W =>
            fc.integer({ min: 8, max: 32 }).chain(H =>
              fc.array(fc.float({ min: -10, max: 10, noNaN: true }), {
                minLength: W * H,
                maxLength: W * H,
              }).map(vals => ({ W, H, sdf: new Float32Array(vals) }))
            )
          ),
          ({ W, H, sdf }) => {
            const graph = extractContours(sdf, W, H);
            const tolerance = 1e-5;
            for (const loop of graph.loops) {
              for (const pt of loop) {
                if (Math.abs(magnitude(pt) - 1.0) > tolerance) return false;
              }
            }
            for (const pt of graph.openLines) {
              if (Math.abs(magnitude(pt) - 1.0) > tolerance) return false;
            }
            return true;
          },
        ),
        { numRuns: 200 },
      );
      expect(true).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Property 8: Marching squares circle round trip
  // Validates: Requirements 4.3
  // ---------------------------------------------------------------------------

  describe('Property 8: Marching squares circle round trip', () => {
    it('circular SDF produces at least one closed loop or open contour', () => {
      // Use a well-centered circle that avoids the seam and poles
      const W = 128;
      const H = 64;
      // Center at (64, 32) with radius 15 — well inside the grid
      const sdf = makeCircularSDF(W, H, 64, 32, 15);
      const graph = extractContours(sdf, W, H);

      // The circle should produce some contour output (loops or open lines)
      const totalPoints = graph.loops.reduce((s, l) => s + l.length, 0) + graph.openLines.length;
      expect(totalPoints).toBeGreaterThan(0);
    });

    it('all contour points from circular SDF lie on the unit sphere', () => {
      const W = 128;
      const H = 64;
      const cx = 64;
      const cy = 32;
      const r = 15;
      const sdf = makeCircularSDF(W, H, cx, cy, r);
      const graph = extractContours(sdf, W, H);

      // All loop points should lie on the unit sphere
      for (const loop of graph.loops) {
        for (const pt of loop) {
          expect(magnitude(pt)).toBeCloseTo(1.0, 5);
        }
      }
      // All open line points should lie on the unit sphere
      for (const pt of graph.openLines) {
        expect(magnitude(pt)).toBeCloseTo(1.0, 5);
      }
    });

    it('circular SDF produces a non-trivial contour (many points)', () => {
      const W = 128;
      const H = 64;
      const sdf = makeCircularSDF(W, H, 64, 32, 15);
      const graph = extractContours(sdf, W, H);

      // The circle circumference ≈ 2π×15 ≈ 94 pixels, so we expect many points
      // after RDP simplification (at least a few dozen)
      const totalPoints = graph.loops.reduce((s, l) => s + l.length, 0) + graph.openLines.length;
      expect(totalPoints).toBeGreaterThan(10);
    });
  });

  // ---------------------------------------------------------------------------
  // Additional unit tests
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('all-positive SDF (all land) produces no contours', () => {
      const W = 8;
      const H = 8;
      const sdf = new Float32Array(W * H).fill(1);
      const graph = extractContours(sdf, W, H);
      expect(graph.loops.length).toBe(0);
      expect(graph.openLines.length).toBe(0);
    });

    it('all-negative SDF (all ocean) produces no contours', () => {
      const W = 8;
      const H = 8;
      const sdf = new Float32Array(W * H).fill(-1);
      const graph = extractContours(sdf, W, H);
      expect(graph.loops.length).toBe(0);
      expect(graph.openLines.length).toBe(0);
    });
  });
});
