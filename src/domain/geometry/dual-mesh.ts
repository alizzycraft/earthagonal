import { Vec3, Triangle, Cell } from './models/geometry-types'
import { VectorUtils } from './utils/vector-utils'

export class DualMesh {
  static buildCells(vertices: Vec3[], faces: Triangle[]): Cell[] {
    const centers = this.triangleCenters(vertices, faces)
    const vertexTris = this.buildVertexTriangles(faces, vertices.length)

    const cells: Cell[] = []

    vertexTris.forEach((tris, i) => {
      const center = vertices[i]
      const poly = tris.map(t => centers[t])
      const sorted = this.sortPolygon(center, poly)

      cells.push({
        center,
        vertices: sorted,
        neighbors: [],
        isPentagon: poly.length === 5
      })
    })

    return cells
  }

  private static triangleCenters(vertices: Vec3[], faces: Triangle[]): Vec3[] {
    return faces.map(f => 
      VectorUtils.normalize(
        VectorUtils.scale(
          VectorUtils.add(
            VectorUtils.add(vertices[f.a], vertices[f.b]), 
            vertices[f.c]
          ),
          1/3
        )
      )
    )
  }

  private static buildVertexTriangles(faces: Triangle[], vertexCount: number): number[][] {
    const map: number[][] = Array.from({ length: vertexCount }, () => [])

    faces.forEach((f, i) => {
      map[f.a].push(i)
      map[f.b].push(i)
      map[f.c].push(i)
    })

    return map
  }

  private static sortPolygon(center: Vec3, points: Vec3[]): Vec3[] {
    if (points.length <= 2) {
      return points.slice() // No sorting needed for lines or points
    }

    const up = Math.abs(center.y) > 0.9
      ? { x: 1, y: 0, z: 0 }
      : { x: 0, y: 1, z: 0 }

    const tangent = VectorUtils.normalize({
      x: center.y * up.z - center.z * up.y,
      y: center.z * up.x - center.x * up.z,
      z: center.x * up.y - center.y * up.x
    })

    const bitangent = VectorUtils.normalize({
      x: center.y * tangent.z - center.z * tangent.y,
      y: center.z * tangent.x - center.x * tangent.z,
      z: center.x * tangent.y - center.y * tangent.x
    })

    // Add safety check for degenerate cases
    if (!tangent || !bitangent || isNaN(tangent.x) || isNaN(bitangent.x)) {
      console.warn('Degenerate polygon detected, returning original order')
      return points.slice()
    }

    return points.slice().sort((a, b) => {
      const ax = (a.x - center.x) * tangent.x + (a.y - center.y) * tangent.y + (a.z - center.z) * tangent.z
      const ay = (a.x - center.x) * bitangent.x + (a.y - center.y) * bitangent.y + (a.z - center.z) * bitangent.z
      const bx = (b.x - center.x) * tangent.x + (b.y - center.y) * tangent.y + (b.z - center.z) * tangent.z
      const by = (b.x - center.x) * bitangent.x + (b.y - center.y) * bitangent.y + (b.z - center.z) * bitangent.z

      const angleA = Math.atan2(ay, ax)
      const angleB = Math.atan2(by, bx)
      
      // Handle NaN angles
      if (isNaN(angleA) || isNaN(angleB)) {
        return 0
      }
      
      return angleA - angleB
    })
  }
}
