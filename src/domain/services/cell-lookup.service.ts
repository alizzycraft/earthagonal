import { CellID } from '../models/cell-id'
import { GoldbergMesh } from '../geometry/models/geometry-types'

export interface Point3D {
  x: number
  y: number
  z: number
}

export class CellLookupService {
  private meshData: GoldbergMesh
  private cells: CellID[]

  constructor(meshData: GoldbergMesh, cells: CellID[]) {
    this.meshData = meshData
    this.cells = cells
  }

  /**
   * Get cell ID from triangle index
   */
  getCellFromTriangle(triangleIndex: number): CellID | null {
    if (triangleIndex < 0 || triangleIndex >= this.meshData.triangleToCell.length) {
      return null
    }

    const cellIndex = this.meshData.triangleToCell[triangleIndex]
    return this.cells[cellIndex] || null
  }

  /**
   * Get cell index from triangle index
   */
  getCellIndexFromTriangle(triangleIndex: number): number | null {
    if (triangleIndex < 0 || triangleIndex >= this.meshData.triangleToCell.length) {
      return null
    }

    return this.meshData.triangleToCell[triangleIndex]
  }

  /**
   * Get all triangles for a cell
   */
  getTrianglesForCell(cell: CellID): number[] {
    const cellIndex = this.cells.findIndex(c => 
      c.face === cell.face && 
      c.q === cell.q && 
      c.r === cell.r && 
      c.resolution === cell.resolution
    )

    if (cellIndex === -1) {
      return []
    }

    return this.getTrianglesForCellIndex(cellIndex)
  }

  /**
   * Get all triangles for a cell index
   */
  getTrianglesForCellIndex(cellIndex: number): number[] {
    const triangles: number[] = []

    for (let i = 0; i < this.meshData.triangleToCell.length; i++) {
      if (this.meshData.triangleToCell[i] === cellIndex) {
        triangles.push(i)
      }
    }

    return triangles
  }

  /**
   * Check if triangle index is valid
   */
  isValidTriangle(triangleIndex: number): boolean {
    return triangleIndex >= 0 && triangleIndex < this.meshData.triangleToCell.length
  }

  /**
   * Get total number of triangles
   */
  getTriangleCount(): number {
    return this.meshData.triangleToCell.length
  }

  /**
   * Get total number of cells
   */
  getCellCount(): number {
    return this.cells.length
  }

  /**
   * Get the ordered 3D vertices of the polygon for a given cell.
   * Extracts directly from the final geometry buffers.
   */
  getCellPolygonVertices(cellIndex: number): Point3D[] {
    const tris = this.getTrianglesForCellIndex(cellIndex)
    const vertices: Point3D[] = []

    for (const tri of tris) {
      // The secondary index of a fan triangle gives the polygon boundary vertex
      const vIdx = this.meshData.indices[tri * 3 + 1]
      vertices.push({
        x: this.meshData.vertices[vIdx * 3],
        y: this.meshData.vertices[vIdx * 3 + 1],
        z: this.meshData.vertices[vIdx * 3 + 2]
      })
    }

    return vertices
  }

  /**
   * Validate lookup service consistency
   */
  validate(): boolean {
    const triangleCount = this.meshData.triangleToCell.length
    const cellCount = this.cells.length

    // Check that all cell indices are valid
    for (let i = 0; i < triangleCount; i++) {
      const cellIndex = this.meshData.triangleToCell[i]
      if (cellIndex < 0 || cellIndex >= cellCount) {
        console.error(`Invalid cell index ${cellIndex} at triangle ${i}`)
        return false
      }
    }

    // Check that every cell has at least one triangle
    const cellTriangleCounts = new Map<number, number>()
    for (const cellIndex of this.meshData.triangleToCell) {
      cellTriangleCounts.set(cellIndex, (cellTriangleCounts.get(cellIndex) || 0) + 1)
    }

    for (let i = 0; i < cellCount; i++) {
      const tCount = cellTriangleCounts.get(i) || 0
      if (tCount === 0) {
        console.error(`Cell ${i} has no triangles`)
        return false
      }
    }

    console.log(`CellLookup validation passed: ${triangleCount} triangles, ${cellCount} cells`)
    return true
  }

  /**
   * Get statistics about the lookup
   */
  getStatistics(): {
    totalTriangles: number
    totalCells: number
    pentagonCount: number
    hexagonCount: number
    avgTrianglesPerCell: number
  } {
    let pentagonCount = 0
    let hexagonCount = 0

    const domainCells = this.meshData.cells
    for (const cell of domainCells) {
      if (cell.isPentagon) {
        pentagonCount++
      } else {
        hexagonCount++
      }
    }

    return {
      totalTriangles: this.meshData.triangleToCell.length,
      totalCells: this.cells.length,
      pentagonCount,
      hexagonCount,
      avgTrianglesPerCell: this.meshData.triangleToCell.length / this.cells.length
    }
  }
}
