/**
 * Marching-squares contour extraction from a Signed Distance Field.
 *
 * Pipeline:
 *  1. Guard-column duplication — duplicate the first column as a right-side
 *     guard before running marching squares; discard segments that cross the
 *     seam so the ±180° longitude boundary is handled cleanly.
 *  2. 4-bit case index — classify each 2×2 quad by the sign of its four
 *     corner SDF values.
 *  3. Sub-pixel edge interpolation — linearly interpolate the zero-crossing
 *     position along each active edge.
 *  4. Segment stitching — build an adjacency map keyed by quantised endpoint
 *     coordinates and walk it to form polylines.
 *  5. Pixel → lat/lon → unit-sphere XYZ conversion.
 *  6. RDP simplification (ε ≈ 0.001).
 *  7. Loop classification — separate closed loops from open lines.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A point on the unit sphere expressed as [x, y, z].
 */
export type Vec3 = [number, number, number];

/**
 * The output of `extractContours`.
 *
 * - `loops`     — closed continent/island polylines; first ≈ last point.
 * - `openLines` — rare edge artefacts that could not be closed.
 *
 * All coordinates are unit-sphere XYZ.
 */
export interface CoastlineGraph {
  loops: Vec3[][];
  openLines: Vec3[];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Extract coastline contours from a signed distance field.
 *
 * @param sdf    Row-major Float32Array of length `width × height`.
 *               Negative values = ocean, positive = land, zero = coastline.
 * @param width  Number of columns in the SDF grid.
 * @param height Number of rows in the SDF grid.
 * @returns      A `CoastlineGraph` with all points on the unit sphere.
 */
export function extractContours(
  sdf: Float32Array,
  width: number,
  height: number,
): CoastlineGraph {
  // ------------------------------------------------------------------
  // Step 1: Guard-column duplication for the ±180° seam.
  //
  // We append the first column of the SDF as an extra column on the right.
  // This gives us a (width+1)-wide grid.  After marching squares we discard
  // any segment whose x-coordinate touches the seam column (x >= width-1).
  // ------------------------------------------------------------------
  const guardWidth = width + 1;
  const guardSDF = new Float32Array(guardWidth * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      guardSDF[y * guardWidth + x] = sdf[y * width + x];
    }
    // Duplicate first column as the guard column.
    guardSDF[y * guardWidth + width] = sdf[y * width + 0];
  }

  // ------------------------------------------------------------------
  // Step 2–3: Marching squares — emit raw pixel-space segments.
  // ------------------------------------------------------------------
  const rawSegments = marchingSquares(guardSDF, guardWidth, height, width);

  // ------------------------------------------------------------------
  // Step 4: Stitch segments into polylines.
  // ------------------------------------------------------------------
  const polylines = stitchSegments(rawSegments);

  // ------------------------------------------------------------------
  // Step 5: Convert pixel coordinates → unit-sphere XYZ.
  //
  // The guard grid has guardWidth columns and height rows.
  // We map pixel (px, py) to:
  //   lon = (px / width) * 2π - π          (use original width, not guardWidth)
  //   lat = π/2 - (py / height) * π
  //   xyz = (cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon))
  // ------------------------------------------------------------------
  const xyzPolylines: Vec3[][] = polylines.map(line =>
    line.map(([px, py]) => pixelToXYZ(px, py, width, height)),
  );

  // ------------------------------------------------------------------
  // Step 6: RDP simplification (ε ≈ 0.001 in XYZ space).
  // ------------------------------------------------------------------
  const simplified = xyzPolylines.map(line => rdpSimplify(line, 0.001));

  // ------------------------------------------------------------------
  // Step 7: Loop classification.
  // ------------------------------------------------------------------
  return classifyLoops(simplified);
}

// ---------------------------------------------------------------------------
// Marching-squares core
// ---------------------------------------------------------------------------

/**
 * A raw segment in pixel space: two endpoints, each [x, y].
 */
type Segment = [[number, number], [number, number]];

/**
 * Marching-squares lookup table.
 *
 * Each entry is an array of edge-pair indices.  An edge-pair [a, b] means
 * "draw a segment from edge a to edge b".
 *
 * Edge numbering for a 2×2 quad:
 *   0 = top    (A–B)
 *   1 = right  (B–C)
 *   2 = bottom (D–C)
 *   3 = left   (A–D)
 *
 * Corner layout:
 *   A (top-left)  B (top-right)
 *   D (bot-left)  C (bot-right)
 *
 * Case index bit assignment:
 *   bit 3 = A, bit 2 = B, bit 1 = C, bit 0 = D
 */
const MS_TABLE: ReadonlyArray<ReadonlyArray<[number, number]>> = [
  [],                   // 0000 — all ocean
  [[2, 3]],             // 0001 — D land
  [[1, 2]],             // 0010 — C land
  [[1, 3]],             // 0011 — C+D land
  [[0, 1]],             // 0100 — B land
  [[0, 3], [1, 2]],     // 0101 — B+D land (saddle — two segments)
  [[0, 2]],             // 0110 — B+C land
  [[0, 3]],             // 0111 — B+C+D land
  [[0, 3]],             // 1000 — A land
  [[0, 2]],             // 1001 — A+D land
  [[0, 1], [2, 3]],     // 1010 — A+C land (saddle — two segments)
  [[0, 1]],             // 1011 — A+C+D land
  [[1, 3]],             // 1100 — A+B land
  [[1, 2]],             // 1101 — A+B+D land
  [[2, 3]],             // 1110 — A+B+C land
  [],                   // 1111 — all land
];

/**
 * Run marching squares over the guard SDF and return raw pixel-space segments.
 * Segments that touch the seam column (x >= seamX - 1) are discarded.
 *
 * @param sdf       Guard SDF (guardWidth × height).
 * @param gw        Guard width (= original width + 1).
 * @param height    Grid height.
 * @param seamX     The x-index of the seam guard column (= original width).
 */
function marchingSquares(
  sdf: Float32Array,
  gw: number,
  height: number,
  seamX: number,
): Segment[] {
  const segments: Segment[] = [];

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < gw - 1; x++) {
      // Discard quads that touch the seam guard column.
      if (x >= seamX - 1) continue;

      // Sample the four corners.
      const vA = sdf[y * gw + x];           // top-left
      const vB = sdf[y * gw + x + 1];       // top-right
      const vC = sdf[(y + 1) * gw + x + 1]; // bottom-right
      const vD = sdf[(y + 1) * gw + x];     // bottom-left

      // Build 4-bit case index.
      const caseIdx =
        (vA >= 0 ? 8 : 0) |
        (vB >= 0 ? 4 : 0) |
        (vC >= 0 ? 2 : 0) |
        (vD >= 0 ? 1 : 0);

      if (caseIdx === 0 || caseIdx === 15) continue;

      // Interpolate the zero-crossing on each of the four edges.
      // Edge 0: top    A→B  (y = y,   x varies)
      // Edge 1: right  B→C  (x = x+1, y varies)
      // Edge 2: bottom D→C  (y = y+1, x varies)
      // Edge 3: left   A→D  (x = x,   y varies)
      const edgePoints: [number, number][] = [
        [x + lerp(vA, vB), y],           // edge 0
        [x + 1, y + lerp(vB, vC)],       // edge 1
        [x + lerp(vD, vC), y + 1],       // edge 2
        [x, y + lerp(vA, vD)],           // edge 3
      ];

      // Emit segments from the lookup table.
      for (const [e0, e1] of MS_TABLE[caseIdx]) {
        segments.push([edgePoints[e0], edgePoints[e1]]);
      }
    }
  }

  return segments;
}

/**
 * Linear interpolation factor for the zero-crossing between values `a` and `b`.
 * Returns a value in [0, 1].
 */
function lerp(a: number, b: number): number {
  if (a === b) return 0.5;
  return Math.abs(a) / (Math.abs(a) + Math.abs(b));
}

// ---------------------------------------------------------------------------
// Segment stitching
// ---------------------------------------------------------------------------

/**
 * Stitch raw segments into polylines using an adjacency map.
 *
 * Endpoints are quantised to a fixed precision before being used as map keys
 * so that floating-point noise does not prevent stitching.
 */
function stitchSegments(segments: Segment[]): [number, number][][] {
  if (segments.length === 0) return [];

  const PRECISION = 1e4; // quantise to 4 decimal places

  function key(x: number, y: number): string {
    return `${Math.round(x * PRECISION)},${Math.round(y * PRECISION)}`;
  }

  // Build adjacency map: endpoint key → list of segment indices that touch it.
  const adj = new Map<string, number[]>();

  function addAdj(k: string, idx: number): void {
    let list = adj.get(k);
    if (list === undefined) {
      list = [];
      adj.set(k, list);
    }
    list.push(idx);
  }

  for (let i = 0; i < segments.length; i++) {
    const [p0, p1] = segments[i];
    addAdj(key(p0[0], p0[1]), i);
    addAdj(key(p1[0], p1[1]), i);
  }

  const used = new Uint8Array(segments.length);
  const polylines: [number, number][][] = [];

  for (let startIdx = 0; startIdx < segments.length; startIdx++) {
    if (used[startIdx]) continue;

    // Start a new polyline from this segment.
    used[startIdx] = 1;
    const [p0, p1] = segments[startIdx];
    const line: [number, number][] = [p0, p1];

    // Extend forward from p1.
    let tip = p1;
    let extended = true;
    while (extended) {
      extended = false;
      const neighbours = adj.get(key(tip[0], tip[1]));
      if (!neighbours) break;
      for (const ni of neighbours) {
        if (used[ni]) continue;
        used[ni] = 1;
        const [a, b] = segments[ni];
        const aKey = key(a[0], a[1]);
        const tipKey = key(tip[0], tip[1]);
        if (aKey === tipKey) {
          line.push(b);
          tip = b;
        } else {
          line.push(a);
          tip = a;
        }
        extended = true;
        break;
      }
    }

    // Extend backward from p0.
    let tail = p0;
    extended = true;
    while (extended) {
      extended = false;
      const neighbours = adj.get(key(tail[0], tail[1]));
      if (!neighbours) break;
      for (const ni of neighbours) {
        if (used[ni]) continue;
        used[ni] = 1;
        const [a, b] = segments[ni];
        const bKey = key(b[0], b[1]);
        const tailKey = key(tail[0], tail[1]);
        if (bKey === tailKey) {
          line.unshift(a);
          tail = a;
        } else {
          line.unshift(b);
          tail = b;
        }
        extended = true;
        break;
      }
    }

    polylines.push(line);
  }

  return polylines;
}

// ---------------------------------------------------------------------------
// Coordinate conversion
// ---------------------------------------------------------------------------

/**
 * Convert a pixel coordinate in the SDF grid to a unit-sphere XYZ point.
 *
 * The equirectangular mapping used here matches the `xyzToUV` contract:
 *   lon = (px / width) * 2π - π
 *   lat = π/2 - (py / height) * π
 *   x   = cos(lat) * cos(lon)
 *   y   = sin(lat)
 *   z   = cos(lat) * sin(lon)
 */
function pixelToXYZ(px: number, py: number, width: number, height: number): Vec3 {
  const lon = (px / width) * 2 * Math.PI - Math.PI;
  const lat = Math.PI / 2 - (py / height) * Math.PI;
  const cosLat = Math.cos(lat);
  return [cosLat * Math.cos(lon), Math.sin(lat), cosLat * Math.sin(lon)];
}

// ---------------------------------------------------------------------------
// Ramer–Douglas–Peucker simplification
// ---------------------------------------------------------------------------

/**
 * Simplify a polyline using the Ramer–Douglas–Peucker algorithm.
 *
 * Distance is measured as the perpendicular distance from a point to the
 * chord between the two endpoints of the current sub-segment, computed in
 * 3-D XYZ space.
 *
 * @param points  Array of Vec3 points.
 * @param epsilon Maximum allowed deviation (≈ 0.001 for unit-sphere coords).
 */
function rdpSimplify(points: Vec3[], epsilon: number): Vec3[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    // Avoid duplicating the pivot point.
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

/**
 * Perpendicular distance from point `p` to the line defined by `a` and `b`,
 * computed in 3-D space using the cross-product formula.
 */
function perpendicularDistance(p: Vec3, a: Vec3, b: Vec3): number {
  // Vector from a to b.
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];

  // Vector from a to p.
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const apz = p[2] - a[2];

  // Cross product ab × ap.
  const cx = aby * apz - abz * apy;
  const cy = abz * apx - abx * apz;
  const cz = abx * apy - aby * apx;

  const crossMag = Math.sqrt(cx * cx + cy * cy + cz * cz);
  const abMag = Math.sqrt(abx * abx + aby * aby + abz * abz);

  if (abMag === 0) return Math.sqrt(apx * apx + apy * apy + apz * apz);
  return crossMag / abMag;
}

// ---------------------------------------------------------------------------
// Loop classification
// ---------------------------------------------------------------------------

/** Tolerance for considering the first and last point of a polyline equal. */
const LOOP_TOLERANCE = 1e-6;

/**
 * Classify simplified polylines into closed loops and open lines.
 *
 * A polyline is considered a closed loop when the distance between its first
 * and last point is within `LOOP_TOLERANCE`.  For loops we ensure the last
 * point is set equal to the first point so the "first ≈ last" invariant holds
 * exactly.
 */
function classifyLoops(polylines: Vec3[][]): CoastlineGraph {
  const loops: Vec3[][] = [];
  const openPoints: Vec3[] = [];

  for (const line of polylines) {
    if (line.length < 2) continue;

    const first = line[0];
    const last = line[line.length - 1];
    const dx = last[0] - first[0];
    const dy = last[1] - first[1];
    const dz = last[2] - first[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist <= LOOP_TOLERANCE) {
      // Already closed — ensure exact equality.
      const closed = [...line];
      closed[closed.length - 1] = first;
      loops.push(closed);
    } else {
      // Check if the endpoints are close enough to form a loop after stitching.
      // (This can happen when the seam guard discards the connecting segment.)
      // We treat it as an open line and expose the individual points.
      for (const pt of line) {
        openPoints.push(pt);
      }
    }
  }

  return { loops, openLines: openPoints };
}
