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
    const { q, r, face, resolution: n } = cell;

    // Icosahedron Adjacency Map: [Face Index]: [Edge 0 (Top), Edge 1 (Right), Edge 2 (Left)]
    const neighbors: Record<number, number[]> = {
      0: [4, 1, 5],   1: [0, 2, 6],   2: [1, 3, 7],   3: [2, 4, 8],   4: [3, 0, 9],
      5: [0, 10, 14], 6: [1, 11, 10], 7: [2, 12, 11], 8: [3, 13, 12], 9: [4, 14, 13],
      10: [5, 6, 15], 11: [6, 7, 16], 12: [7, 8, 17], 13: [8, 9, 18], 14: [9, 5, 19],
      15: [10, 19, 16], 16: [11, 15, 17], 17: [12, 16, 18], 18: [13, 17, 19], 19: [14, 18, 15]
    };

    const adj = neighbors[face];
    if (!adj) return null;

    // Case 1: Outside Top/Northwest Edge (r < 0)
    if (r < 0) {
      return { face: adj[0], q: q, r: n + r, resolution: n };
    }
    
    // Case 2: Outside Right/Southeast Edge (q + r >= n)
    // Note: Goldberg Class II (n=0) usually aligns hexes with edge q+r=n
    if (q + r >= n) {
      return { face: adj[1], q: 0, r: r, resolution: n };
    }

    // Case 3: Outside Left/West Edge (q < 0)
    if (q < 0) {
      return { face: adj[2], q: n + q, r: r, resolution: n };
    }

    return null;
  }

  /**
   * Compute cell vertices from center and neighbor centers
   */
  private computeCellVertices(center: Point3D, neighborCenters: Point3D[]): Point3D[] {
    // 1. Sort neighbors clockwise/counter-clockwise around center
    const sortedNeighbors = [...neighborCenters].sort((a, b) => {
      const angleA = Math.atan2(a.y - center.y, a.x - center.x);
      const angleB = Math.atan2(b.y - center.y, b.x - center.x);
      return angleA - angleB;
    });

    const vertices: Point3D[] = [];
    const numNeighbors = sortedNeighbors.length;

    for (let i = 0; i < numNeighbors; i++) {
      const n1 = sortedNeighbors[i];
      const n2 = sortedNeighbors[(i + 1) % numNeighbors];

      // Standard Dual-Graph vertex: Average of center and two adjacent neighbors
      const vertex = {
        x: (center.x + n1.x + n2.x) / 3,
        y: (center.y + n1.y + n2.y) / 3,
        z: (center.z + n1.z + n2.z) / 3
      };

      const normalized = this.projection.normalizeToSphere(vertex);
      vertices.push(this.projection.scaleToEarthRadius(normalized));
    }

    return vertices;
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
