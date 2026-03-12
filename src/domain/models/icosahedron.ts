export interface IcosahedronFace {
  v1: number
  v2: number
  v3: number
}

export class Icosahedron {
  static readonly PHI = (1 + Math.sqrt(5)) / 2
  static readonly EARTH_RADIUS_KM = 6371
  
  /**
   * Generate icosahedron vertices (before normalization)
   */
  static generateVertices(): Array<[number, number, number]> {
    return [
      [0, 1, this.PHI],
      [0, -1, this.PHI],
      [0, 1, -this.PHI],
      [0, -1, -this.PHI],
      [1, this.PHI, 0],
      [-1, this.PHI, 0],
      [1, -this.PHI, 0],
      [-1, -this.PHI, 0],
      [this.PHI, 0, 1],
      [-this.PHI, 0, 1],
      [this.PHI, 0, -1],
      [-this.PHI, 0, -1]
    ]
  }

  /**
   * Normalize vertices to unit sphere
   */
  static normalizeVertices(vertices: Array<[number, number, number]>): Array<[number, number, number]> {
    return vertices.map(v => {
      const length = Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2)
      return [v[0]/length, v[1]/length, v[2]/length] as [number, number, number]
    })
  }

  /**
   * Define the 20 triangular faces using vertex indices
   */
  static getFaces(): IcosahedronFace[] {
    return [
      { v1: 0, v2: 11, v3: 5 },
      { v1: 0, v2: 5, v3: 1 },
      { v1: 0, v2: 1, v3: 7 },
      { v1: 0, v2: 7, v3: 10 },
      { v1: 0, v2: 10, v3: 11 },
      
      { v1: 1, v2: 5, v3: 9 },
      { v1: 5, v2: 11, v3: 4 },
      { v1: 11, v2: 10, v3: 2 },
      { v1: 10, v2: 7, v3: 6 },
      { v1: 7, v2: 1, v3: 8 },
      
      { v1: 3, v2: 9, v3: 4 },
      { v1: 3, v2: 4, v3: 2 },
      { v1: 3, v2: 2, v3: 6 },
      { v1: 3, v2: 6, v3: 8 },
      { v1: 3, v2: 8, v3: 9 },
      
      { v1: 4, v2: 9, v3: 5 },
      { v1: 2, v2: 4, v3: 11 },
      { v1: 6, v2: 2, v3: 10 },
      { v1: 8, v2: 6, v3: 7 },
      { v1: 9, v2: 8, v3: 1 }
    ]
  }

  /**
   * Get face transition table for neighbor computation
   * Maps each face edge to adjacent face
   */
  static getFaceTransitions(): number[][] {
    // This is a simplified version - in practice this needs careful mapping
    // of which faces share which edges
    return [
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
  }
}
