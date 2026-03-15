import { ICOSAHEDRON_VERTICES, ICOSAHEDRON_FACES } from './icosahedron'
import { tmp1, tmp2, scale, add, normalize } from './vec3'

export interface GeodesicMesh {
  vertexBuffer: Float32Array
  triangleIndices: Uint32Array
  vertexCount: number
  triangleCount: number
}

const MAX_SUBDIVISION = 20

export class GeodesicGrid {
  static generate(n: number): GeodesicMesh {
    if (n < 1 || n > MAX_SUBDIVISION) {
      throw Error(`Invalid subdivision level: ${n}. Must be 1-${MAX_SUBDIVISION}`)
    }

    const Vf = ((n + 1) * (n + 2)) / 2
    const V = 20 * Vf
    const T = 20 * n * n

    const rawVertexBuffer = new Float32Array(V * 3)
    const rawTriangleIndices = new Uint32Array(T * 3)

    let vertexWrite = 0
    let triangleWrite = 0

    function index(i: number, j: number): number {
      return (i * (i + 1)) / 2 + j
    }

    for (let faceIndex = 0; faceIndex < 20; faceIndex++) {
      const face = ICOSAHEDRON_FACES[faceIndex]
      const A = ICOSAHEDRON_VERTICES[face[0]]
      const B = ICOSAHEDRON_VERTICES[face[1]]
      const C = ICOSAHEDRON_VERTICES[face[2]]

      const faceVertexOffset = faceIndex * Vf

      // Generate vertices via barycentric interpolation
      for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= i; j++) {
          const wA = n - i
          const wB = i - j
          const wC = j

          scale(A, wA, tmp1)
          scale(B, wB, tmp2)
          add(tmp1, tmp2, tmp1)
          
          scale(C, wC, tmp2)
          add(tmp1, tmp2, tmp1)
          
          scale(tmp1, 1 / n, tmp1)
          normalize(tmp1, tmp1)

          rawVertexBuffer[vertexWrite++] = tmp1.x
          rawVertexBuffer[vertexWrite++] = tmp1.y
          rawVertexBuffer[vertexWrite++] = tmp1.z
        }
      }

      // Generate triangles explicitly within the triangular grid domain
      for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
          const v0 = faceVertexOffset + index(i, j)
          const v1 = faceVertexOffset + index(i + 1, j)
          const v2 = faceVertexOffset + index(i + 1, j + 1)

          // Upright triangle (v0, v1, v2)
          rawTriangleIndices[triangleWrite++] = v0
          rawTriangleIndices[triangleWrite++] = v1
          rawTriangleIndices[triangleWrite++] = v2

          // Inverted triangle
          if (j < i) {
            const v3 = faceVertexOffset + index(i, j + 1)
            rawTriangleIndices[triangleWrite++] = v0
            rawTriangleIndices[triangleWrite++] = v2
            rawTriangleIndices[triangleWrite++] = v3
          }
        }
      }
    }

    // Deduplicate vertices across icosahedron face seams (crucial for dual mesh topological walks)
    const map = new Map<bigint, number>()
    const remap = new Uint32Array(V)
    let uniqueCount = 0

    for (let i = 0; i < V; i++) {
      // Quantize vertices to merge duplicates accurately across boundaries
      // Scale by 1M and add 1M to shift positive, ensuring 21 bits fits all coordinate possibilities
      const x = Math.round(rawVertexBuffer[i * 3] * 1e6 + 1e6) >>> 0
      const y = Math.round(rawVertexBuffer[i * 3 + 1] * 1e6 + 1e6) >>> 0
      const z = Math.round(rawVertexBuffer[i * 3 + 2] * 1e6 + 1e6) >>> 0
      
      const px = BigInt(x) & 0x1FFFFFn
      const py = BigInt(y) & 0x1FFFFFn
      const pz = BigInt(z) & 0x1FFFFFn
      const h = (px << 42n) | (py << 21n) | pz

      if (map.has(h)) {
        remap[i] = map.get(h)!
      } else {
        remap[i] = uniqueCount
        map.set(h, uniqueCount)
        rawVertexBuffer[uniqueCount * 3] = rawVertexBuffer[i * 3]
        rawVertexBuffer[uniqueCount * 3 + 1] = rawVertexBuffer[i * 3 + 1]
        rawVertexBuffer[uniqueCount * 3 + 2] = rawVertexBuffer[i * 3 + 2]
        uniqueCount++
      }
    }

    for (let i = 0; i < T * 3; i++) {
      rawTriangleIndices[i] = remap[rawTriangleIndices[i]]
    }

    // Allocate tight arrays
    const vertexBuffer = new Float32Array(rawVertexBuffer.buffer, 0, uniqueCount * 3)
    const triangleIndices = rawTriangleIndices

    return { vertexBuffer, triangleIndices, vertexCount: uniqueCount, triangleCount: T }
  }
}
