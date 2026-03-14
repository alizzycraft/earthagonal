import { Vec3, Triangle } from './models/geometry-types'
import { VectorUtils } from './utils/vector-utils'

export class IcosahedronGeometry {
  static readonly PHI = (1 + Math.sqrt(5)) / 2

  static create(): { vertices: Vec3[], faces: Triangle[] } {
    const vertices = this.createVertices()
    const faces = this.createFaces()
    return { vertices, faces }
  }

  private static createVertices(): Vec3[] {
    const rawVertices = [
      { x: -1, y: this.PHI, z: 0 },
      { x: 1, y: this.PHI, z: 0 },
      { x: -1, y: -this.PHI, z: 0 },
      { x: 1, y: -this.PHI, z: 0 },
      { x: 0, y: -1, z: this.PHI },
      { x: 0, y: 1, z: this.PHI },
      { x: 0, y: -1, z: -this.PHI },
      { x: 0, y: 1, z: -this.PHI },
      { x: this.PHI, y: 0, z: -1 },
      { x: this.PHI, y: 0, z: 1 },
      { x: -this.PHI, y: 0, z: -1 },
      { x: -this.PHI, y: 0, z: 1 }
    ]

    return rawVertices.map(v => VectorUtils.normalize(v))
  }

  private static createFaces(): Triangle[] {
    return [
      { a: 0, b: 11, c: 5 },
      { a: 0, b: 5, c: 1 },
      { a: 0, b: 1, c: 7 },
      { a: 0, b: 7, c: 10 },
      { a: 0, b: 10, c: 11 },
      { a: 1, b: 5, c: 9 },
      { a: 5, b: 11, c: 4 },
      { a: 11, b: 10, c: 2 },
      { a: 10, b: 7, c: 6 },
      { a: 7, b: 1, c: 8 },
      { a: 3, b: 9, c: 4 },
      { a: 3, b: 4, c: 2 },
      { a: 3, b: 2, c: 6 },
      { a: 3, b: 6, c: 8 },
      { a: 3, b: 8, c: 9 },
      { a: 4, b: 9, c: 5 },
      { a: 2, b: 4, c: 11 },
      { a: 6, b: 2, c: 10 },
      { a: 8, b: 6, c: 7 },
      { a: 9, b: 8, c: 1 }
    ]
  }
}
