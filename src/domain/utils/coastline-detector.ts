import { Cell } from '../geometry/models/geometry-types'
import { Vec3 } from '../geometry/models/geometry-types'

export class CoastlineDetector {
  /**
   * Detect if a cell is coastal based on elevation of its neighbors.
   * A cell is coastal if it has both land (>0) and water (<=0) neighbors.
   */
  static isCoastal(cellIndex: number, cells: Cell[], elevations: Float32Array): boolean {
    const cell = cells[cellIndex]
    let hasLand = elevations[cellIndex] > 0
    let hasWater = elevations[cellIndex] <= 0
    
    for (const neighborIndex of cell.neighborIndices) {
      if (elevations[neighborIndex] > 0) hasLand = true
      else hasWater = true
      
      if (hasLand && hasWater) return true
    }
    
    return false
  }

  /**
   * Calculate coastline direction for a cell using elevation gradient.
   * Direction is perpendicular to the gradient (points along the coast).
   */
  static calculateCoastlineDirection(
    cellIndex: number, 
    cells: Cell[], 
    cellCenters: Float32Array, 
    elevations: Float32Array
  ): Vec3 {
    const cell = cells[cellIndex]
    const centerIdx = cell.centerIndex * 3
    const cx = cellCenters[centerIdx]
    const cy = cellCenters[centerIdx + 1]
    const cz = cellCenters[centerIdx + 2]
    const centerElevation = elevations[cellIndex]
    
    let gx = 0, gy = 0, gz = 0
    
    // Gradient points uphill: Sum((neighborElev - centerElev) * dirToNeighbor)
    for (const neighborIndex of cell.neighborIndices) {
      const nCell = cells[neighborIndex]
      const nIdx = nCell.centerIndex * 3
      const dx = cellCenters[nIdx] - cx
      const dy = cellCenters[nIdx + 1] - cy
      const dz = cellCenters[nIdx + 2] - cz
      
      const diff = elevations[neighborIndex] - centerElevation
      gx += diff * dx
      gy += diff * dy
      gz += diff * dz
    }
    
    // Coastline direction is perpendicular to gradient and surface normal
    // surfaceNormal = normalized(cx, cy, cz)
    // coastDir = cross(surfaceNormal, gradient)
    
    // Cross product: (a2b3 - a3b2, a3b1 - a1b3, a1b2 - a2b1)
    const cdx = cy * gz - cz * gy
    const cdy = cz * gx - cx * gz
    const cdz = cx * gy - cy * gx
    
    const len = Math.sqrt(cdx * cdx + cdy * cdy + cdz * cdz)
    if (len < 0.0001) return { x: 0, y: 0, z: 0 }
    
    return {
      x: cdx / len,
      y: cdy / len,
      z: cdz / len
    }
  }
}
