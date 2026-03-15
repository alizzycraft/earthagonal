import { Cell } from './models/geometry-types'

const RELAXATION_FACTOR = 0.35
const RELAXATION_ITERATIONS = 3

export class HexRelaxation {
  /**
   * Relax the centers of the cells toward their geometric polygon centroids.
   * Modifies cellCenters directly.
   */
  static relax(cells: Cell[], cellCenters: Float32Array, triangleCenters: Float32Array): void {
    for (let iter = 0; iter < RELAXATION_ITERATIONS; iter++) {
      for (const cell of cells) {
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

        // Damped interpolation: current + FACTOR * (centroid - current)
        let nx = ox + RELAXATION_FACTOR * (cx - ox)
        let ny = oy + RELAXATION_FACTOR * (cy - oy)
        let nz = oz + RELAXATION_FACTOR * (cz - oz)

        // Project new center back to sphere
        const lNew = Math.sqrt(nx * nx + ny * ny + nz * nz)
        cellCenters[vIdx] = nx / lNew
        cellCenters[vIdx + 1] = ny / lNew
        cellCenters[vIdx + 2] = nz / lNew
      }
    }
  }
}
