/**
 * Property-based tests for xyzToUV()
 *
 * Property 1: xyzToUV output range
 *   For any normalized unit-sphere vector, u ∈ [0, 1) and v ∈ [0, 1].
 *   Validates: Requirements 5.1
 *
 * Property 2: CPU/GPU xyzToUV equivalence
 *   TypeScript and GLSL implementations produce identical UV for any normalized input.
 *   Validates: Requirements 5.2
 */

import * as fc from 'fast-check';
import { xyzToUV } from './terrain-sampler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * GLSL-equivalent xyzToUV implemented in TypeScript for numerical comparison.
 * Mirrors the GLSL code in design.md exactly:
 *   float lat = asin(clamp(p.y, -1.0, 1.0));
 *   float lon = atan(p.z, p.x);
 *   float u = fract((lon + PI) / (2.0 * PI));
 *   float v = clamp((PI * 0.5 - lat) / PI, 0.0, 1.0);
 */
function glslXyzToUV(x: number, y: number, z: number): { u: number; v: number } {
  const PI = Math.PI;
  const lat = Math.asin(Math.max(-1.0, Math.min(1.0, y)));
  const lon = Math.atan2(z, x);
  // GLSL fract(x) = x - floor(x)
  const raw = (lon + PI) / (2.0 * PI);
  const u = raw - Math.floor(raw);
  const v = Math.max(0.0, Math.min(1.0, (PI * 0.5 - lat) / PI));
  return { u, v };
}

/**
 * Arbitrary that generates a normalized unit-sphere vector.
 */
const unitVectorArb = fc
  .tuple(
    fc.float({ min: -1, max: 1, noNaN: true }),
    fc.float({ min: -1, max: 1, noNaN: true }),
    fc.float({ min: -1, max: 1, noNaN: true }),
  )
  .filter(([x, y, z]) => {
    const len = Math.sqrt(x * x + y * y + z * z);
    return len > 1e-6; // exclude near-zero vectors
  })
  .map(([x, y, z]) => {
    const len = Math.sqrt(x * x + y * y + z * z);
    return { x: x / len, y: y / len, z: z / len };
  });

// ---------------------------------------------------------------------------
// Property 1: xyzToUV output range
// Validates: Requirements 5.1
// ---------------------------------------------------------------------------

describe('xyzToUV', () => {
  describe('Property 1: xyzToUV output range', () => {
    it('u should be in [0, 1) for any unit-sphere vector', () => {
      let result = true;
      fc.assert(
        fc.property(unitVectorArb, ({ x, y, z }) => {
          const { u } = xyzToUV(x, y, z);
          return u >= 0 && u < 1;
        }),
        { numRuns: 10000 },
      );
      expect(result).toBe(true);
    });

    it('v should be in [0, 1] for any unit-sphere vector', () => {
      let result = true;
      fc.assert(
        fc.property(unitVectorArb, ({ x, y, z }) => {
          const { v } = xyzToUV(x, y, z);
          return v >= 0 && v <= 1;
        }),
        { numRuns: 10000 },
      );
      expect(result).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Property 2: CPU/GPU xyzToUV equivalence
  // Validates: Requirements 5.2
  // ---------------------------------------------------------------------------

  describe('Property 2: CPU/GPU xyzToUV equivalence', () => {
    it('TypeScript and GLSL implementations produce identical UV for any normalized input', () => {
      fc.assert(
        fc.property(unitVectorArb, ({ x, y, z }) => {
          const cpu = xyzToUV(x, y, z);
          const gpu = glslXyzToUV(x, y, z);
          // v should be identical
          if (Math.abs(cpu.v - gpu.v) > 1e-7) return false;
          // u should be identical or both near the antimeridian wrap (0 ≈ 1).
          // The TypeScript formula uses (raw % 1 + 1) % 1 which can differ from
          // GLSL fract() by up to 1.0 for values extremely close to 1.0 due to
          // floating-point rounding: (0.9999...9 + 1) rounds to 2.0, giving u=0,
          // while fract gives u≈1. Both represent the same antimeridian longitude.
          const uDiff = Math.abs(cpu.u - gpu.u);
          // Either they're close, or one is near 0 and the other near 1 (antimeridian)
          return uDiff <= 1e-7 || Math.abs(uDiff - 1.0) <= 1e-7;
        }),
        { numRuns: 10000 },
      );
      expect(true).toBe(true); // fc.assert throws on failure; reaching here means success
    });
  });

  // ---------------------------------------------------------------------------
  // Specific example tests
  // ---------------------------------------------------------------------------

  describe('known values', () => {
    it('north pole (0,1,0) should give v=0', () => {
      const { v } = xyzToUV(0, 1, 0);
      expect(v).toBeCloseTo(0, 10);
    });

    it('south pole (0,-1,0) should give v=1', () => {
      const { v } = xyzToUV(0, -1, 0);
      expect(v).toBeCloseTo(1, 10);
    });

    it('prime meridian equator (1,0,0) should give u=0.5, v=0.5', () => {
      const { u, v } = xyzToUV(1, 0, 0);
      expect(u).toBeCloseTo(0.5, 10);
      expect(v).toBeCloseTo(0.5, 10);
    });

    it('antimeridian equator (-1,0,0) should give u=0 (or approaching 1)', () => {
      const { u, v } = xyzToUV(-1, 0, 0);
      // lon = atan2(0, -1) = π, so u = (π + π)/(2π) % 1 = 0
      expect(u).toBeCloseTo(0, 10);
      expect(v).toBeCloseTo(0.5, 10);
    });
  });
});
