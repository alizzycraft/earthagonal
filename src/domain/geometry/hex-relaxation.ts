import { Cell, Vec3 } from './models/geometry-types'

const RELAXATION_FACTOR = 0.35
const RELAXATION_ITERATIONS = 5 // Increased for better alignment

export interface RelaxationWeights {
  terrainWeights: Float32Array   // [cellCount] - multiplier for movement
  coastWeights: Float32Array     // [cellCount] - multiplier for coastline alignment
  coastDirections: Vec3[]        // [cellCount] - directions for alignment
}

export class HexRelaxation {
  /**
   * Relax the centers of the cells toward their geometric polygon centroids.
   * Modifies cellCenters directly.
   */
  static relax(
    cells: Cell[], 
    cellCenters: Float32Array, 
    triangleCenters: Float32Array,
    weights?: RelaxationWeights
  ): void {
    const ALIGNMENT_STRENGTH = 0.015 // ~1.5% cell radius per iteration

    for (let iter = 0; iter < RELAXATION_ITERATIONS; iter++) {
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]
        if (cell.isPentagon) continue

        let cx = 0, cy = 0, cz = 0
        const len = cell.vertexIndices.length

        // Average the surrounding polygon vertices to find centroid
        for (const tIndex of cell.vertexIndices) {
          cx += triangleCenters[tIndex * 3]
          cy += triangleCenters[tIndex * 3 + 1]
          cz += triangleCenters[tIndex * 3 + 2]
        }
        
        cx /= len
        cy /= len
        cz /= len

        // Normalize projected centroid
        const lCent = Math.sqrt(cx * cx + cy * cy + cz * cz)
        cx /= lCent
        cy /= lCent
        cz /= lCent

        const vIdx = cell.centerIndex * 3
        const ox = cellCenters[vIdx]
        const oy = cellCenters[vIdx + 1]
        const oz = cellCenters[vIdx + 2]

        // Base move vector
        let moveX = cx - ox
        let moveY = cy - oy
        let moveZ = cz - oz

        // Apply terrain weight
        let tWeight = weights ? weights.terrainWeights[i] : 1.0
        
        // Damped interpolation: current + FACTOR * weight * move
        let nx = ox + RELAXATION_FACTOR * tWeight * moveX
        let ny = oy + RELAXATION_FACTOR * tWeight * moveY
        let nz = oz + RELAXATION_FACTOR * tWeight * moveZ

        // Apply coastline-aware bias
        if (weights && weights.coastWeights[i] > 0) {
          const cWeight = weights.coastWeights[i]
          const cDir = weights.coastDirections[i]
          
          nx += cWeight * cDir.x * ALIGNMENT_STRENGTH
          ny += cWeight * cDir.y * ALIGNMENT_STRENGTH
          nz += cWeight * cDir.z * ALIGNMENT_STRENGTH
        }

        // Project new center back to sphere
        const lNew = Math.sqrt(nx * nx + ny * ny + nz * nz)
        cellCenters[vIdx] = nx / lNew
        cellCenters[vIdx + 1] = ny / lNew
        cellCenters[vIdx + 2] = nz / lNew
      }
    }
  }
}
