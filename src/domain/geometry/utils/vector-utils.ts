import { Vec3 } from '../models/geometry-types'

export class VectorUtils {
  static add(a: Vec3, b: Vec3): Vec3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
  }

  static scale(v: Vec3, s: number): Vec3 {
    return { x: v.x * s, y: v.y * s, z: v.z * s }
  }

  static normalize(v: Vec3): Vec3 {
    const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
    if (l === 0) return { x: 0, y: 0, z: 0 }
    return { x: v.x / l, y: v.y / l, z: v.z / l }
  }

  static midpoint(a: Vec3, b: Vec3): Vec3 {
    return this.normalize({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      z: (a.z + b.z) / 2
    })
  }

  static cross(a: Vec3, b: Vec3): Vec3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    }
  }

  static dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z
  }
}
