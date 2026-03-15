import { Vec3 } from './models/geometry-types'

// Scratch buffers for in-place mathematical operations
export const tmp1: Vec3 = { x: 0, y: 0, z: 0 }
export const tmp2: Vec3 = { x: 0, y: 0, z: 0 }
export const tmp3: Vec3 = { x: 0, y: 0, z: 0 }

export function add(a: Vec3, b: Vec3, out: Vec3): void {
  out.x = a.x + b.x
  out.y = a.y + b.y
  out.z = a.z + b.z
}

export function sub(a: Vec3, b: Vec3, out: Vec3): void {
  out.x = a.x - b.x
  out.y = a.y - b.y
  out.z = a.z - b.z
}

export function scale(v: Vec3, s: number, out: Vec3): void {
  out.x = v.x * s
  out.y = v.y * s
  out.z = v.z * s
}

export function normalize(v: Vec3, out: Vec3): void {
  const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
  if (l > 0) {
    out.x = v.x / l
    out.y = v.y / l
    out.z = v.z / l
  } else {
    out.x = 0
    out.y = 0
    out.z = 0
  }
}

export function cross(a: Vec3, b: Vec3, out: Vec3): void {
  const ax = a.x, ay = a.y, az = a.z
  const bx = b.x, by = b.y, bz = b.z
  out.x = ay * bz - az * by
  out.y = az * bx - ax * bz
  out.z = ax * by - ay * bx
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

export function midpoint(a: Vec3, b: Vec3, out: Vec3): void {
  out.x = (a.x + b.x) / 2
  out.y = (a.y + b.y) / 2
  out.z = (a.z + b.z) / 2
}
