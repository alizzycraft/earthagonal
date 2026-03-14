export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Triangle {
  a: number
  b: number
  c: number
}

export interface Cell {
  center: Vec3
  vertices: Vec3[]
  neighbors: number[]
  isPentagon: boolean
}
