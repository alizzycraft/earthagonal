import { CellID } from '../models/cell-id'
import { HexGridMath } from '../utils/hex-grid-math'
import { SphereProjection, Point3D } from './sphere-projection'
import { Icosahedron } from '../models/icosahedron'

export interface CellGeometry {
  cell: CellID
  center: Point3D
  vertices: Point3D[]
  isPentagon: boolean
}

export interface TriangleData {
  indices: number[]
  vertices: Float32Array
  triangleToCell: Uint32Array
}

export class CellGeometryGenerator {
  private projection: SphereProjection
  private cells: CellID[]
  private cellIndexMap: Map<string, number>

  constructor(cells: CellID[], cellIndexMap: Map<string, number>) {
    this.projection = new SphereProjection()
    this.cells = cells
    this.cellIndexMap = cellIndexMap
  }

  /**
   * Generate geometry for all cells
   */
  generateAllGeometries(): CellGeometry[] {
    return this.cells.map(cell => this.generateCellGeometry(cell))
  }

  /**
   * Generate geometry for a single cell
   */
  generateCellGeometry(cell: CellID): CellGeometry {
    const center = this.projection.projectCellToSphere(cell)
    const neighborCenters = this.getCellNeighbors(cell).map(neighbor => 
      this.projection.projectCellToSphere(neighbor)
    )
    
    console.log(`Cell ${cell.face}:${cell.q},${cell.r} has ${neighborCenters.length} neighbors`)
    
    const vertices = this.computeCellVertices(center, neighborCenters)
    const isPentagon = HexGridMath.isPentagon(cell)
    
    console.log(`Cell ${cell.face}:${cell.q},${cell.r} has ${vertices.length} vertices, isPentagon: ${isPentagon}`)
    
    return {
      cell,
      center,
      vertices,
      isPentagon
    }
  }

  /**
   * Get neighbors of a cell (including face transitions)
   */
  private getCellNeighbors(cell: CellID): CellID[] {
    const neighbors = HexGridMath.getHexNeighbors(cell)
    const validNeighbors: CellID[] = []

    for (const neighbor of neighbors) {
      if (HexGridMath.isValidCoordinate(neighbor.q, neighbor.r, cell.resolution)) {
        validNeighbors.push(neighbor)
      } else {
        // Handle face transition for edge cases
        const transitionedNeighbor = this.handleFaceTransition(neighbor)
        if (transitionedNeighbor) {
          validNeighbors.push(transitionedNeighbor)
        }
      }
    }

    return validNeighbors
  }

  /**
   * Handle face transition when coordinate goes outside triangular bounds
   */
  private handleFaceTransition(cell: CellID): CellID | null {
    // Basic face transition mapping for icosahedron
    // This is a simplified implementation - full mapping would be more complex
    const { q, r, face, resolution: n } = cell
    
    // Define which edges transition to which faces
    // These are simplified transitions for demonstration
    if (q < 0) { // West edge
      // Map to adjacent face based on current face number
      const adjacentFaces = [1, 5, 6, 10, 11, 14, 15, 16, 17, 18, 19]
      const targetFace = adjacentFaces[face % adjacentFaces.length]
      return { face: targetFace, q: n, r: r, resolution: n }
    }
    
    if (r < 0) { // Northwest edge  
      const adjacentFaces = [4, 8, 9, 13, 14, 15, 16, 17, 18, 19, 0]
      const targetFace = adjacentFaces[face % adjacentFaces.length]
      return { face: targetFace, q: q, r: n, resolution: n }
    }
    
    if (q + r > n) { // Southeast edge
      const adjacentFaces = [2, 3, 7, 8, 9, 13, 14, 15, 16, 17, 18]
      const targetFace = adjacentFaces[face % adjacentFaces.length]
      return { face: targetFace, q: 0, r: 0, resolution: n }
    }
    
    return null // No transition needed
  }

  /**
   * Compute cell vertices from center and neighbor centers
   */
  private computeCellVertices(center: Point3D, neighborCenters: Point3D[]): Point3D[] {
    const vertices: Point3D[] = []
    
    // For a proper hexagon, we need exactly 6 vertices (or 5 for pentagons)
    // Create vertices by interpolating between center and edge midpoints
    const numVertices = neighborCenters.length
    
    for (let i = 0; i < numVertices; i++) {
      const neighbor1 = neighborCenters[i]
      const neighbor2 = neighborCenters[(i + 1) % numVertices]
      
      // Compute vertex as weighted average: more weight on center for stability
      // This creates more regular hexagonal shapes
      const weight = 0.4 // Center weight
      const neighborWeight = (1 - weight) / 2 // Split between two neighbors
      
      const vertex = {
        x: weight * center.x + neighborWeight * (neighbor1.x + neighbor2.x),
        y: weight * center.y + neighborWeight * (neighbor1.y + neighbor2.y),
        z: weight * center.z + neighborWeight * (neighbor1.z + neighbor2.z)
      }
      
      // Normalize to sphere surface and scale to Earth radius
      const normalized = this.projection.normalizeToSphere(vertex)
      vertices.push(this.projection.scaleToEarthRadius(normalized))
    }

    return vertices
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
   * Get cell index for CellID
   */
  getCellIndex(cell: CellID): number | undefined {
    const key = `${cell.face}:${cell.q}:${cell.r}:${cell.resolution}`
    return this.cellIndexMap.get(key)
  }

  /**
   * Get CellID for cell index
   */
  getCellID(index: number): CellID | undefined {
    return this.cells[index]
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
}
