import { Vec3, Triangle } from './models/geometry-types'
import { VectorUtils } from './utils/vector-utils'

export class GeodesicSubdivision {
  static subdivide(vertices: Vec3[], faces: Triangle[], level: number): { vertices: Vec3[], faces: Triangle[] } {
    const midCache = new Map<string, number>()

    function midpointIndex(a: number, b: number): number {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`

      if (midCache.has(key)) {
        return midCache.get(key)!
      }

      const v = VectorUtils.midpoint(vertices[a], vertices[b])
      const i = vertices.push(v) - 1
      midCache.set(key, i)
      return i
    }

    let currentFaces = faces

    for (let i = 0; i < level; i++) {
      const newFaces: Triangle[] = []

      for (const f of currentFaces) {
        const ab = midpointIndex(f.a, f.b)
        const bc = midpointIndex(f.b, f.c)
        const ca = midpointIndex(f.c, f.a)

        newFaces.push({ a: f.a, b: ab, c: ca })
        newFaces.push({ a: f.b, b: bc, c: ab })
        newFaces.push({ a: f.c, b: ca, c: bc })
        newFaces.push({ a: ab, b: bc, c: ca })
      }

      currentFaces = newFaces
    }

    return { vertices, faces: currentFaces }
  }
}
