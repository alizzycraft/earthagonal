import { CellID } from '../models/cell-id'
import { Point3D } from './sphere-projection'
import { Cell, Vec3, GoldbergSphereGenerator } from '../geometry'

export interface CellGeometry {
  cell: CellID
  center: Point3D
  vertices: Point3D[]
  isPentagon: boolean
  index: number
}

export interface TriangleData {
  indices: number[]
  vertices: Float32Array
  triangleToCell: Uint32Array
}

export class CellGeometryGenerator {
  private cells: Cell[]
  private resolution: number
  private earthRadius: number

  constructor(resolution: number, earthRadius: number = 6371) {
    console.log(`Starting CellGeometryGenerator with resolution ${resolution}`)
    const startTime = performance.now()
    
    this.resolution = resolution
    this.earthRadius = earthRadius
    
    // Add timeout safeguard
    const timeoutMs = 10000 // 10 seconds
    const timeoutId = setTimeout(() => {
      console.error('CellGeometryGenerator timed out! This might indicate an infinite loop.')
      throw new Error(`CellGeometryGenerator timed out after ${timeoutMs}ms`)
    }, timeoutMs)
    
    try {
      this.cells = GoldbergSphereGenerator.generate(resolution)
      clearTimeout(timeoutId)
      
      const endTime = performance.now()
      console.log(`CellGeometryGenerator completed in ${endTime - startTime}ms`)
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }
    
    GoldbergSphereGenerator.validateTopology(this.cells)
    console.log(`Generated ${this.cells.length} cells for resolution ${resolution}`)
  }

  /**
   * Generate geometry for all cells using Goldberg polyhedron
   */
  generateAllGeometries(): CellGeometry[] {
    return this.cells.map((cell, index) => this.convertCellToGeometry(cell, index))
  }

  /**
   * Convert a Goldberg cell to CellGeometry format
   */
  private convertCellToGeometry(cell: Cell, index: number): CellGeometry {
    const center = this.scaleToEarth(cell.center)
    const vertices = cell.vertices.map(v => this.scaleToEarth(v))
    
    return {
      cell: this.createCellID(index),
      center,
      vertices,
      isPentagon: cell.isPentagon,
      index
    }
  }

  /**
   * Create a mock CellID for compatibility (not used in new approach)
   */
  private createCellID(index: number): CellID {
    return {
      face: 0,
      q: index % this.resolution,
      r: Math.floor(index / this.resolution),
      resolution: this.resolution
    }
  }

  /**
   * Scale vector to Earth radius
   */
  private scaleToEarth(vec: Vec3): Point3D {
    return {
      x: vec.x * this.earthRadius,
      y: vec.y * this.earthRadius,
      z: vec.z * this.earthRadius
    }
  }

  /**
   * Get cell count
   */
  getCellCount(): number {
    return this.cells.length
  }

  /**
   * Get cell by index
   */
  getCell(index: number): Cell | undefined {
    return this.cells[index]
  }

  /**
   * Get cell index for CellID (mock implementation)
   */
  getCellIndex(cell: CellID): number | undefined {
    // For now, return a simple hash-based index
    // In practice, this might need a proper mapping if CellID is used elsewhere
    return (cell.face * this.resolution + cell.q + cell.r) % this.cells.length
  }

  /**
   * Get CellID for cell index (mock implementation)
   */
  getCellID(index: number): CellID | undefined {
    if (index < 0 || index >= this.cells.length) return undefined
    return this.createCellID(index)
  }

  /**
   * Convert cell geometries to triangle data for Babylon.js
   */
  generateTriangleData(geometries: CellGeometry[]): TriangleData {
    const indices: number[] = []
    const vertices: number[] = []
    const triangleToCell: number[] = []

    let vertexIndex = 0
    let triangleIndex = 0

    for (let cellIndex = 0; cellIndex < geometries.length; cellIndex++) {
      const geometry = geometries[cellIndex]
      const center = geometry.center
      const cellVertices = geometry.vertices

      // Add center vertex
      vertices.push(center.x, center.y, center.z)

      // Add cell vertices
      for (const vertex of cellVertices) {
        vertices.push(vertex.x, vertex.y, vertex.z)
      }

      // Create triangles (fan from center)
      for (let i = 0; i < cellVertices.length; i++) {
        const next = (i + 1) % cellVertices.length
        
        // Triangle indices
        indices.push(
          vertexIndex,        // center
          vertexIndex + 1 + i, // current vertex
          vertexIndex + 1 + next // next vertex
        )

        // Map triangle to cell
        triangleToCell.push(cellIndex)
        triangleIndex++
      }

      // Move to next cell (center + vertices)
      vertexIndex += 1 + cellVertices.length
    }

    return {
      indices,
      vertices: new Float32Array(vertices),
      triangleToCell: new Uint32Array(triangleToCell)
    }
  }

  /**
   * Validate triangle data consistency
   */
  validateTriangleData(data: TriangleData): boolean {
    const expectedTriangles = data.triangleToCell.length
    const actualTriangles = data.indices.length / 3

    if (expectedTriangles !== actualTriangles) {
      console.error(`Triangle validation failed: expected ${expectedTriangles}, got ${actualTriangles}`)
      return false
    }

    // Check that all triangle indices are valid
    const maxVertexIndex = data.vertices.length / 3 - 1
    for (const index of data.indices) {
      if (index < 0 || index > maxVertexIndex) {
        console.error(`Invalid vertex index: ${index} (max: ${maxVertexIndex})`)
        return false
      }
    }

    // Check that all triangle-to-cell mappings are valid
    const maxCellIndex = this.cells.length - 1
    for (const cellIndex of data.triangleToCell) {
      if (cellIndex > maxCellIndex) {
        console.error(`Invalid cell index: ${cellIndex} (max: ${maxCellIndex})`)
        return false
      }
    }

    console.log(`Triangle validation passed: ${actualTriangles} triangles, ${data.vertices.length/3} vertices`)
    return true
  }

  /**
   * Get topology information
   */
  getTopologyInfo(): { pentagons: number, hexagons: number, total: number } {
    let pentagons = 0
    let hexagons = 0

    for (const cell of this.cells) {
      if (cell.isPentagon) {
        pentagons++
      } else {
        hexagons++
      }
    }

    return { pentagons, hexagons, total: this.cells.length }
  }
}
