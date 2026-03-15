export interface Vec3 {
  x: number
  y: number
  z: number
}

// Memory-efficient structure for dual mesh cells
export interface Cell {
  centerIndex: number
  vertexIndices: number[]
  neighborIndices: number[]
  isPentagon: boolean
}

// Final output of the optimized generator pipeline
export interface GoldbergMesh {
  vertices: Float32Array
  normals: Float32Array
  indices: Uint32Array
  cells: Cell[]
  triangleToCell: Uint32Array
}
