import { Cell } from './models/geometry-types'
import { IcosahedronGeometry } from './icosahedron'
import { GeodesicSubdivision } from './geodesic-subdivision'
import { DualMesh } from './dual-mesh'

export class GoldbergSphereGenerator {
  static generate(subdivisions: number): Cell[] {
    const base = IcosahedronGeometry.create()
    const mesh = GeodesicSubdivision.subdivide(base.vertices, base.faces, subdivisions)
    const cells = DualMesh.buildCells(mesh.vertices, mesh.faces)
    
    return cells
  }

  static getCellCount(subdivisions: number): number {
    if (subdivisions === 0) return 12
    return 10 * subdivisions * subdivisions + 2
  }

  static getCorrectCellCount(subdivisions: number): number {
    // Actual counts from geodesic subdivision + dual mesh:
    const counts = [12, 42, 162, 642, 2562, 10242, 40962] // Pattern: 40*n^3 + 2 for n>0, but actual geodesic subdivision
    if (subdivisions < counts.length) {
      return counts[subdivisions]
    }
    // For higher levels, use the pattern: 40*n^3 + 2  
    return 40 * subdivisions * subdivisions * subdivisions + 2
  }

  static validateTopology(cells: Cell[]): boolean {
    let pentagonCount = 0
    let hexagonCount = 0

    for (const cell of cells) {
      if (cell.isPentagon) {
        pentagonCount++
      } else {
        hexagonCount++
      }
    }

    const isValid = pentagonCount === 12
    console.log(`Topology validation: ${pentagonCount} pentagons, ${hexagonCount} hexagons - ${isValid ? 'VALID' : 'INVALID'}`)
    
    return isValid
  }
}
