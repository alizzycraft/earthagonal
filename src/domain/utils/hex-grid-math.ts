import { CellID } from '../models/cell-id'

export class HexGridMath {
  /**
   * Check if coordinates are valid within a triangular grid
   */
  static isValidCoordinate(q: number, r: number, n: number): boolean {
    return q >= 0 && r >= 0 && q + r <= n
  }

  /**
   * Get all valid coordinates for a triangular grid of resolution n
   */
  static getValidCoordinates(n: number): Array<{q: number, r: number}> {
    const coords: Array<{q: number, r: number}> = []
    
    for (let q = 0; q <= n; q++) {
      for (let r = 0; r <= n - q; r++) {
        coords.push({ q, r })
      }
    }
    
    return coords
  }

  /**
   * Get valid hexagonal cell centers for Goldberg grid
   * This generates a hexagonal pattern within each triangular face
   */
  static getGoldbergCoordinates(n: number): Array<{q: number, r: number}> {
    const coords: Array<{q: number, r: number}> = []
    const targetCellsPerFace = this.getCellCountPerFaceForGoldberg(n)
    
    // Generate a hexagonal pattern within the triangular face
    // Start from the center and work outward in rings
    for (let ring = 0; ring <= n; ring++) {
      for (let q = -ring; q <= ring; q++) {
        const r = ring - Math.abs(q)
        
        // Only include coordinates within triangular bounds
        if (q >= 0 && r >= 0 && q + r <= n) {
          coords.push({ q, r })
        }
      }
    }
    
    // Remove duplicates and trim to target count
    const uniqueCoords = coords.filter((coord, index, self) => 
      coords.findIndex(c => c.q === coord.q && c.r === coord.r) === index
    )
    
    while (uniqueCoords.length > targetCellsPerFace) {
      uniqueCoords.pop()
    }
    
    return uniqueCoords
  }

  /**
   * Check if a coordinate follows the Goldberg pattern
   */
  private static isGoldbergPatternCell(q: number, r: number, n: number): boolean {
    // Interior cells are always included
    if (q > 0 && r > 0 && q + r < n) {
      return true
    }
    
    // Edge cells follow a specific pattern
    // This is a simplified version - the true pattern is more complex
    const sum = q + r
    
    // Include every other cell on edges to create hexagonal pattern
    if (q === 0 || r === 0 || sum === n) {
      return (q + r) % 2 === 0
    }
    
    return false
  }

  /**
   * Get the target number of cells per face for Goldberg grid
   */
  static getCellCountPerFaceForGoldberg(n: number): number {
    const total = this.getCellCount(n)
    return Math.floor(total / 20)
  }

  /**
   * Calculate distance between two cells in the same face
   */
  static distance(a: CellID, b: CellID): number {
    if (a.face !== b.face || a.resolution !== b.resolution) {
      throw new Error('Cells must be in same face and resolution')
    }
    
    // Axial coordinate distance
    const dq = a.q - b.q
    const dr = a.r - b.r
    const dz = -dq - dr
    
    return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dz))
  }

  /**
   * Get all cells within distance k of origin cell
   */
  static getKDistance(origin: CellID, k: number): CellID[] {
    const cells: CellID[] = []
    
    for (let q = -k; q <= k; q++) {
      for (let r = Math.max(-k, -q - k); r <= Math.min(k, -q + k); r++) {
        const newQ = origin.q + q
        const newR = origin.r + r
        
        if (this.isValidCoordinate(newQ, newR, origin.resolution)) {
          cells.push({
            face: origin.face,
            q: newQ,
            r: newR,
            resolution: origin.resolution
          })
        }
      }
    }
    
    return cells
  }

  /**
   * Get the 6 neighbors of a hex cell (may include invalid coordinates)
   */
  static getHexNeighbors(cell: CellID): CellID[] {
    const directions = [
      { q: 1, r: 0 },   // east
      { q: -1, r: 0 },  // west
      { q: 0, r: 1 },   // southeast
      { q: 0, r: -1 },  // northwest
      { q: 1, r: -1 },  // northeast
      { q: -1, r: 1 }   // southwest
    ]

    return directions.map(dir => ({
      face: cell.face,
      q: cell.q + dir.q,
      r: cell.r + dir.r,
      resolution: cell.resolution
    }))
  }

  /**
   * Get all valid neighbors of a cell, handling face transitions
   */
  static getAllNeighbors(cell: CellID): CellID[] {
    const hexNeighbors = this.getHexNeighbors(cell)
    const validNeighbors: CellID[] = []

    for (const neighbor of hexNeighbors) {
      if (this.isValidCoordinate(neighbor.q, neighbor.r, neighbor.resolution)) {
        validNeighbors.push(neighbor)
      } else {
        // Handle face transition for coordinates outside the triangular boundary
        const transitionedNeighbor = this.handleFaceTransition(neighbor)
        if (transitionedNeighbor) {
          validNeighbors.push(transitionedNeighbor)
        }
      }
    }

    return validNeighbors
  }

  /**
   * Handle coordinate transition between icosahedron faces
   */
  private static handleFaceTransition(cell: CellID): CellID | null {
    const n = cell.resolution
    const { q, r } = cell

    // Define face transitions based on which edge we're crossing
    // This is a simplified version - full implementation requires careful mapping
    const faceTransitions: number[][] = [
      [1, 4, 5],   // Face 0 adjacent to faces 1, 4, 5
      [0, 2, 6],   // Face 1 adjacent to faces 0, 2, 6
      [1, 3, 7],   // Face 2 adjacent to faces 1, 3, 7
      [2, 4, 8],   // Face 3 adjacent to faces 2, 4, 8
      [0, 3, 9],   // Face 4 adjacent to faces 0, 3, 9
      [0, 6, 10],  // Face 5 adjacent to faces 0, 6, 10
      [1, 5, 11],  // Face 6 adjacent to faces 1, 5, 11
      [2, 8, 12],  // Face 7 adjacent to faces 2, 8, 12
      [3, 7, 13],  // Face 8 adjacent to faces 3, 7, 13
      [4, 14, 15], // Face 9 adjacent to faces 4, 14, 15
      [5, 11, 16], // Face 10 adjacent to faces 5, 11, 16
      [6, 10, 17], // Face 11 adjacent to faces 6, 10, 17
      [7, 12, 18], // Face 12 adjacent to faces 7, 12, 18
      [8, 13, 19], // Face 13 adjacent to faces 8, 13, 19
      [9, 15, 18], // Face 14 adjacent to faces 9, 15, 18
      [9, 14, 16], // Face 15 adjacent to faces 9, 14, 16
      [10, 15, 17],// Face 16 adjacent to faces 10, 15, 17
      [11, 16, 19],// Face 17 adjacent to faces 11, 16, 19
      [12, 14, 19],// Face 18 adjacent to faces 12, 14, 19
      [13, 17, 18] // Face 19 adjacent to faces 13, 17, 18
    ]

    // Determine which edge we're crossing and transform coordinates
    if (q < 0) {
      // Crossing west edge
      return this.transformToAdjacentFace(cell, 0, n)
    } else if (r < 0) {
      // Crossing northwest edge  
      return this.transformToAdjacentFace(cell, 1, n)
    } else if (q + r > n) {
      // Crossing southeast edge
      return this.transformToAdjacentFace(cell, 2, n)
    }

    return null
  }

  /**
   * Transform coordinates to adjacent face coordinate system
   */
  private static transformToAdjacentFace(cell: CellID, edgeIndex: number, n: number): CellID | null {
    // This is a simplified transformation - full implementation requires
    // careful mathematical transformation based on the specific edge geometry
    // For now, return null to indicate no transformation available
    
    // In a complete implementation, this would:
    // 1. Determine the adjacent face based on current face and edge
    // 2. Transform (q,r) coordinates to the new face's coordinate system
    // 3. Return the transformed CellID
    
    return null
  }

  /**
   * Check if a cell is at a pentagon position (icosahedron vertex)
   */
  static isPentagon(cell: CellID): boolean {
    const n = cell.resolution
    const face = cell.face
    
    // The 12 pentagons correspond to the 12 vertices of the icosahedron
    // Each vertex is shared by 5 faces, so we need to identify which corners
    // correspond to the actual vertices
    
    // Define the 12 icosahedron vertices and which face corners they correspond to
    // This is a simplified mapping - the exact mapping depends on the icosahedron orientation
    const pentagonPositions = [
      { face: 0, q: 0, r: 0 },           // Vertex 1
      { face: 1, q: 0, r: 0 },           // Vertex 2  
      { face: 2, q: 0, r: 0 },           // Vertex 3
      { face: 3, q: 0, r: 0 },           // Vertex 4
      { face: 4, q: 0, r: 0 },           // Vertex 5
      { face: 5, q: 0, r: 0 },           // Vertex 6
      { face: 6, q: 0, r: 0 },           // Vertex 7
      { face: 7, q: 0, r: 0 },           // Vertex 8
      { face: 8, q: 0, r: 0 },           // Vertex 9
      { face: 9, q: 0, r: 0 },           // Vertex 10
      { face: 10, q: 0, r: 0 },          // Vertex 11
      { face: 11, q: 0, r: 0 },          // Vertex 12
    ]
    
    // Check if this cell matches any pentagon position
    return pentagonPositions.some(pos => 
      pos.face === face && pos.q === cell.q && pos.r === cell.r
    )
  }

  /**
   * Get cell count for given resolution
   */
  static getCellCount(resolution: number): number {
    return 10 * resolution * resolution + 2
  }

  /**
   * Get cell count per face
   */
  static getCellCountPerFace(resolution: number): number {
    return (resolution + 1) * (resolution + 2) / 2
  }
}
