import { Injectable } from '@angular/core'
import { Cell } from '../geometry/models/geometry-types'
import { CellTerrain, CoastEdge } from '../models/cell-terrain'
import { TerrainDataService } from './terrain-data.service'
import { SphereProjection, Point3D } from './sphere-projection'
import { xyzToUV } from '../utils/terrain-sampler'
import { unpackSDF } from '../utils/sdf-gradient'

/**
 * Threshold for SDF zero-crossing classification (in normalised SDF units).
 * Cells with |sdfValue| < SDF_EPSILON are classified as 'coastline'.
 * Requirements: 7.3
 */
const SDF_EPSILON = 0.05

/**
 * World-space scale factor applied to the normalised SDF value when storing
 * in CellTerrain.sdfDistance.  The normalised value is in [−1, 1]; multiplying
 * by this factor converts it to a rough kilometre-scale distance.
 * Requirements: 7.2
 */
const SDF_WORLD_SCALE = 1000

/**
 * Maximum allowed divergence (in metres) between the cell's BFS-derived
 * elevation and the height sampled at the cell's UV coordinate.
 * Requirements: 7.4
 */
const ELEVATION_DIVERGENCE_THRESHOLD = 500

@Injectable({
  providedIn: 'root'
})
export class CoastlineAnalyzerService {
  constructor(
    private terrainService: TerrainDataService,
    private projection: SphereProjection
  ) {}

  /**
   * Computes additional spatial metadata for classified cells.
   */
  processTerrain(cells: Cell[], cellTerrain: CellTerrain[], triangleCenters: Float32Array): void {
    this.detectCoastlineCrossings(cells, cellTerrain, triangleCenters)
    this.computeDistanceField(cells, cellTerrain)
  }

  /**
   * Enriches each CellTerrain with SDF-derived data:
   *  - Computes the equirectangular UV for the cell centre and stores it in
   *    CellTerrain.uv (Requirement 7.1)
   *  - Samples the packed SDF texture at that UV and stores the scaled value
   *    in CellTerrain.sdfDistance (Requirement 7.2)
   *  - Reclassifies cells near the SDF zero-crossing as 'coastline'
   *    (Requirement 7.3)
   *  - Asserts that the BFS elevation and the height sampled at the cell UV
   *    agree within ELEVATION_DIVERGENCE_THRESHOLD; logs a warning on
   *    divergence (Requirement 7.4)
   *
   * @param cells        Array of hex cells (same order as cellTerrain).
   * @param cellTerrain  Array of CellTerrain objects to enrich in-place.
   * @param cellCenters  Flat Float32Array of cell centre XYZ positions,
   *                     indexed as cellCenters[cell.centerIndex * 3 + {0,1,2}].
   * @param packedSDF    Packed RGBA Uint8Array produced by packSDFTexture()
   *                     or the GPU JFA pipeline (same encoding).
   * @param sdfWidth     Width of the packed SDF texture in texels.
   * @param sdfHeight    Height of the packed SDF texture in texels.
   */
  enrichWithSDF(
    cells: Cell[],
    cellTerrain: CellTerrain[],
    cellCenters: Float32Array,
    packedSDF: Uint8Array,
    sdfWidth: number,
    sdfHeight: number
  ): void {
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      const terrain = cellTerrain[i]

      // --- 1. Compute equirectangular UV for the cell centre (Req 7.1) ------
      const ci = cell.centerIndex * 3
      const cx = cellCenters[ci]
      const cy = cellCenters[ci + 1]
      const cz = cellCenters[ci + 2]

      const { u, v } = xyzToUV(cx, cy, cz)
      terrain.uv = { x: u, y: v }

      // --- 2. Sample the packed SDF texture at the cell UV (Req 7.2) --------
      const sdfValue = this.samplePackedSDF(packedSDF, sdfWidth, sdfHeight, u, v)
      terrain.sdfDistance = sdfValue * SDF_WORLD_SCALE

      // --- 3. Reclassify near-zero-crossing cells as 'coastline' (Req 7.3) --
      if (Math.abs(sdfValue) < SDF_EPSILON) {
        terrain.terrainType = 'coastline'
      }

      // --- 4. Assert elevation alignment (Req 7.4) --------------------------
      const sampledHeight = this.sampleHeightAtUV(u, v)
      const divergence = Math.abs(terrain.elevation - sampledHeight)
      if (divergence >= ELEVATION_DIVERGENCE_THRESHOLD) {
        console.warn(
          `[CoastlineAnalyzerService] CPU/GPU elevation divergence at cell ${i}: ` +
          `BFS elevation=${terrain.elevation.toFixed(1)}m, ` +
          `sampled height=${sampledHeight.toFixed(1)}m, ` +
          `divergence=${divergence.toFixed(1)}m (threshold=${ELEVATION_DIVERGENCE_THRESHOLD}m). ` +
          `UV=(${u.toFixed(4)}, ${v.toFixed(4)})`
        )
      }
    }
  }

  /**
   * Detects where the coastline crosses hex cell edges.
   */
  private detectCoastlineCrossings(cells: Cell[], cellTerrain: CellTerrain[], triangleCenters: Float32Array): void {
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]
        const terrain = cellTerrain[i]
        
        if (terrain.terrainType !== 'coastline') continue

        const numVerts = cell.vertexIndices.length
        for (let j = 0; j < numVerts; j++) {
            const v1Idx = cell.vertexIndices[j] * 3
            const v2Idx = cell.vertexIndices[(j + 1) % numVerts] * 3
            
            const v1: Point3D = {
                x: triangleCenters[v1Idx],
                y: triangleCenters[v1Idx + 1],
                z: triangleCenters[v1Idx + 2]
            }
            
            const v2: Point3D = {
                x: triangleCenters[v2Idx],
                y: triangleCenters[v2Idx + 1],
                z: triangleCenters[v2Idx + 2]
            }

            const s1 = this.sampleElevation(v1)
            const s2 = this.sampleElevation(v2)

            // Coastline crosses edge if elevation signs differ (assuming 0 is sea level)
            if (Math.sign(s1) !== Math.sign(s2) && s1 !== 0 && s2 !== 0) {
                const t = Math.abs(s1) / (Math.abs(s1) + Math.abs(s2))
                terrain.coastEdgeCrossings.push({
                    edgeIndex: j,
                    crossingPoint: t
                })
            }
        }
    }
  }

  /**
   * Computes Distance-to-Coastline Field using BFS.
   */
  private computeDistanceField(cells: Cell[], cellTerrain: CellTerrain[]): void {
    const queue: number[] = []
    const visited = new Set<number>()

    // Initialize BFS with coastline cells
    for (let i = 0; i < cellTerrain.length; i++) {
        if (cellTerrain[i].terrainType === 'coastline') {
            cellTerrain[i].coastDistance = 0
            queue.push(i)
            visited.add(i)
        } else {
            cellTerrain[i].coastDistance = Infinity
        }
    }

    // BFS for land and ocean
    let head = 0
    while (head < queue.length) {
        const currIdx = queue[head++]
        const currentDist = cellTerrain[currIdx].coastDistance
        const currentIsLand = cellTerrain[currIdx].terrainType === 'land' || 
                             (cellTerrain[currIdx].terrainType === 'coastline' && cellTerrain[currIdx].elevation > 0)

        for (const neighborIdx of cells[currIdx].neighborIndices) {
            if (!visited.has(neighborIdx)) {
                visited.add(neighborIdx)
                const neighbor = cellTerrain[neighborIdx]
                
                // Distance is positive for land, negative for ocean
                const step = (neighbor.terrainType === 'ocean') ? -1 : 1
                neighbor.coastDistance = currentDist + step
                
                queue.push(neighborIdx)
            }
        }
    }

    // Fix ocean distances (they should radiate negatively from coast)
    // The simple BFS above might not handle the sign correctly if it moves from land to ocean.
    // Let's refine: BFS from coast, but track direction.
    
    // Actually, a better BFS:
    // 1. All coast cells = 0
    // 2. BFS out. Distance = parentDist + (isLand ? 1 : -1)
    // Wait, this only works if we don't cross between land and sea without a coast cell.
    // In our model, all land/sea transitions MUST be coast cells.
  }

  /**
   * Samples the packed RGBA SDF texture at the given UV coordinate using
   * nearest-neighbour lookup and returns the decoded normalised SDF value
   * in [−1, 1].
   *
   * Encoding: R channel = d/maxDist * 0.5 + 0.5 (packed to Uint8 [0,255]).
   * Decode:   sdf = (r / 255) * 2.0 − 1.0
   */
  private samplePackedSDF(
    packedSDF: Uint8Array,
    width: number,
    height: number,
    u: number,
    v: number
  ): number {
    // Clamp/wrap UV to valid texel range
    const uw = ((u % 1) + 1) % 1
    const vc = Math.max(0, Math.min(1, v))

    const px = Math.min(Math.round(uw * (width - 1)), width - 1)
    const py = Math.min(Math.round(vc * (height - 1)), height - 1)

    const idx = (py * width + px) * 4
    const rByte = packedSDF[idx]

    return unpackSDF(rByte / 255)
  }

  /**
   * Samples the terrain height at a UV coordinate using TerrainDataService.
   * Returns positive elevation for land, negative depth for ocean.
   */
  private sampleHeightAtUV(u: number, v: number): number {
    const s = this.terrainService.sample(u, v)
    return s.landMask > 127 ? s.elevation : -s.oceanDepth
  }

  private sampleElevation(p: Point3D): number {
    const gps = this.projection.point3DToGPS(p)
    const u = (gps.lon + 180) / 360
    const v = (90 - gps.lat) / 180
    const s = this.terrainService.sample(u, v)
    return s.landMask > 127 ? s.elevation : -s.oceanDepth
  }
}
