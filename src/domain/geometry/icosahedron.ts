import { Vec3 } from './models/geometry-types'

const PHI = (1 + Math.sqrt(5)) / 2

function normalizeArray(vertices: number[][]): Vec3[] {
  return vertices.map(v => {
    const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    return { x: v[0] / l, y: v[1] / l, z: v[2] / l }
  })
}

// 12 Normalized vertices of the base icosahedron
export const ICOSAHEDRON_VERTICES: Vec3[] = normalizeArray([
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1]
])

// 20 Triangular faces (vertex indices)
export const ICOSAHEDRON_FACES: [number, number, number][] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1]
]
