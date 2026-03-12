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
    
    // Quick validation check
    if (neighborCenters.length < 5) {
      console.warn("Invalid cell neighbors", cell, neighborCenters.length);
    }
    
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

    // Face Transition Table: [Face Index]: [{face, rotation}, ...] for edges [0,1,2]
    const FACE_TRANSITIONS = [
      /*0*/ [{face:1,rotation:2},{face:4,rotation:4},{face:5,rotation:0}],
      /*1*/ [{face:0,rotation:4},{face:2,rotation:2},{face:7,rotation:0}],
      /*2*/ [{face:1,rotation:4},{face:3,rotation:2},{face:8,rotation:0}],
      /*3*/ [{face:2,rotation:4},{face:4,rotation:2},{face:9,rotation:0}],
      /*4*/ [{face:0,rotation:2},{face:3,rotation:4},{face:10,rotation:0}],
      /*5*/ [{face:0,rotation:0},{face:6,rotation:2},{face:11,rotation:4}],
      /*6*/ [{face:5,rotation:4},{face:7,rotation:2},{face:12,rotation:0}],
      /*7*/ [{face:1,rotation:0},{face:6,rotation:4},{face:8,rotation:2}],
      /*8*/ [{face:2,rotation:0},{face:7,rotation:4},{face:9,rotation:2}],
      /*9*/ [{face:3,rotation:0},{face:8,rotation:4},{face:10,rotation:2}],
      /*10*/ [{face:4,rotation:0},{face:9,rotation:4},{face:15,rotation:2}],
      /*11*/ [{face:5,rotation:2},{face:12,rotation:4},{face:16,rotation:0}],
      /*12*/ [{face:6,rotation:2},{face:11,rotation:4},{face:13,rotation:0}],
      /*13*/ [{face:12,rotation:2},{face:14,rotation:4},{face:17,rotation:0}],
      /*14*/ [{face:13,rotation:2},{face:15,rotation:4},{face:18,rotation:0}],
      /*15*/ [{face:10,rotation:2},{face:14,rotation:4},{face:19,rotation:0}],
      /*16*/ [{face:11,rotation:2},{face:17,rotation:4},{face:19,rotation:0}],
      /*17*/ [{face:13,rotation:2},{face:16,rotation:4},{face:18,rotation:0}],
      /*18*/ [{face:14,rotation:2},{face:17,rotation:4},{face:19,rotation:0}],
      /*19*/ [{face:15,rotation:2},{face:16,rotation:4},{face:18,rotation:0}]
    ];

    // Case 1: Outside Top/Northwest Edge (r < 0) - Edge 0
    if (r < 0) {
      const transition = FACE_TRANSITIONS[face][0];
      if (!transition) return null;
      
      // Apply rotation and coordinate transform
      const rotated = this.rotateCoordinates(q, r, transition.rotation);
      return { face: transition.face, q: rotated.q, r: rotated.r, resolution: n };
    }
    
    // Case 2: Outside Right/Southeast Edge (q + r > n) - Edge 1  
    if (q + r > n) {
      const transition = FACE_TRANSITIONS[face][1];
      if (!transition) return null;
      
      // Edge-specific coordinate transform for q+r>n
      const transformed = { q: r, r: n - q };
      const rotated = this.rotateCoordinates(transformed.q, transformed.r, transition.rotation);
      return { face: transition.face, q: rotated.q, r: rotated.r, resolution: n };
    }

    // Case 3: Outside Left/West Edge (q < 0) - Edge 2
    if (q < 0) {
      const transition = FACE_TRANSITIONS[face][2];
      if (!transition) return null;
      
      // Apply rotation and coordinate transform
      const rotated = this.rotateCoordinates(q, r, transition.rotation);
      return { face: transition.face, q: rotated.q, r: rotated.r, resolution: n };
    }

    return null;
  }

  /**
   * Rotate hex coordinates by 60° increments
   */
  private rotateCoordinates(q: number, r: number, steps: number): {q: number, r: number} {
    // Convert axial to cube coordinates
    let x = q;
    let z = r;
    let y = -x - z;

    // Apply rotation steps
    for (let i = 0; i < steps; i++) {
      const newX = -z;
      const newY = -x;
      const newZ = -y;
      x = newX;
      y = newY;
      z = newZ;
    }

    // Convert back to axial coordinates
    return { q: x, r: z };
  }

  /**
   * Compute cell vertices from center and neighbor centers
   */
  private computeCellVertices(center: Point3D, neighborCenters: Point3D[]): Point3D[] {
    // 1. Sort neighbors in tangent plane of sphere
    const normal = this.projection.normalizeToSphere(center)
    const up = { x: 0, y: 1, z: 0 }
    
    // Create tangent basis
    const tangent = this.projection.normalizeToSphere({
      x: normal.y * up.z - normal.z * up.y,
      y: normal.z * up.x - normal.x * up.z,
      z: normal.x * up.y - normal.y * up.x
    })
    
    const bitangent = this.projection.normalizeToSphere({
      x: normal.y * tangent.z - normal.z * tangent.y,
      y: normal.z * tangent.x - normal.x * tangent.z,
      z: normal.x * tangent.y - normal.y * tangent.x
    })

    // Sort neighbors by angle in tangent plane
    const sortedNeighbors = [...neighborCenters].sort((a, b) => {
      const dxA = (a.x - center.x) * tangent.x + (a.y - center.y) * tangent.y + (a.z - center.z) * tangent.z
      const dyA = (a.x - center.x) * bitangent.x + (a.y - center.y) * bitangent.y + (a.z - center.z) * bitangent.z
      const dxB = (b.x - center.x) * tangent.x + (b.y - center.y) * tangent.y + (b.z - center.z) * tangent.z
      const dyB = (b.x - center.x) * bitangent.x + (b.y - center.y) * bitangent.y + (b.z - center.z) * bitangent.z
      
      const angleA = Math.atan2(dyA, dxA)
      const angleB = Math.atan2(dyB, dxB)
      return angleA - angleB
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
