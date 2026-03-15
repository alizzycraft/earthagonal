import { Cell } from './models/geometry-types'

function edgeKey(a: number, b: number): bigint {
  return a < b
    ? (BigInt(a) << 32n) | BigInt(b)
    : (BigInt(b) << 32n) | BigInt(a)
}

export class DualMeshBuilder {
  static build(vertexBuffer: Float32Array, triangleIndices: Uint32Array, vertexCount: number, triangleCount: number): {
    cells: Cell[], cellCenters: Float32Array, triangleCenters: Float32Array
  } {
    // Compute triangle centers
    const triangleCenters = new Float32Array(triangleCount * 3)
    for (let i = 0; i < triangleCount; i++) {
      const idxA = triangleIndices[i * 3]
      const idxB = triangleIndices[i * 3 + 1]
      const idxC = triangleIndices[i * 3 + 2]

      const cx = vertexBuffer[idxA * 3] + vertexBuffer[idxB * 3] + vertexBuffer[idxC * 3]
      const cy = vertexBuffer[idxA * 3 + 1] + vertexBuffer[idxB * 3 + 1] + vertexBuffer[idxC * 3 + 1]
      const cz = vertexBuffer[idxA * 3 + 2] + vertexBuffer[idxB * 3 + 2] + vertexBuffer[idxC * 3 + 2]

      const l = Math.sqrt(cx * cx + cy * cy + cz * cz)
      triangleCenters[i * 3] = cx / l
      triangleCenters[i * 3 + 1] = cy / l
      triangleCenters[i * 3 + 2] = cz / l
    }

    // Build vertex adjacency lists and edge maps
    const vertexTriangles: number[][] = Array.from({ length: vertexCount }, () => [])
    const edgeToTriangle = new Map<bigint, number[]>()

    for (let t = 0; t < triangleCount; t++) {
      const a = triangleIndices[t * 3]
      const b = triangleIndices[t * 3 + 1]
      const c = triangleIndices[t * 3 + 2]

      vertexTriangles[a].push(t)
      vertexTriangles[b].push(t)
      vertexTriangles[c].push(t)

      const e1 = edgeKey(a, b)
      const e2 = edgeKey(b, c)
      const e3 = edgeKey(c, a)

      if (!edgeToTriangle.has(e1)) edgeToTriangle.set(e1, [])
      edgeToTriangle.get(e1)!.push(t)

      if (!edgeToTriangle.has(e2)) edgeToTriangle.set(e2, [])
      edgeToTriangle.get(e2)!.push(t)

      if (!edgeToTriangle.has(e3)) edgeToTriangle.set(e3, [])
      edgeToTriangle.get(e3)!.push(t)
    }

    const cells: Cell[] = []
    const cellCenters = new Float32Array(vertexCount * 3)

    // Construct cells via triangle walks
    for (let v = 0; v < vertexCount; v++) {
      const tris = vertexTriangles[v]
      
      // Store Cell Center
      cellCenters[v * 3] = vertexBuffer[v * 3]
      cellCenters[v * 3 + 1] = vertexBuffer[v * 3 + 1]
      cellCenters[v * 3 + 2] = vertexBuffer[v * 3 + 2]

      // Start Triangle walk to order the vertices polygonally
      if (tris.length === 0) continue

      const startTri = tris[0]
      let currentTri = startTri

      const vertexIndices: number[] = []
      const neighborIndices: number[] = []

      do {
        vertexIndices.push(currentTri)

        // Find the next triangle around vertex v in CCW order
        const a = triangleIndices[currentTri * 3]
        const b = triangleIndices[currentTri * 3 + 1]
        const c = triangleIndices[currentTri * 3 + 2]

        // Given CCW winding, if v == a -> next edge is (a, b)
        let nextEdgeV1 = -1, nextEdgeV2 = -1, oppV = -1
        if (v === a) { nextEdgeV1 = a; nextEdgeV2 = b; oppV = b }
        else if (v === b) { nextEdgeV1 = b; nextEdgeV2 = c; oppV = c }
        else if (v === c) { nextEdgeV1 = c; nextEdgeV2 = a; oppV = a }

        // Find the triangle sharing this edge that is NOT currentTri
        const edge = edgeKey(nextEdgeV1, nextEdgeV2)
        const sharingTris = edgeToTriangle.get(edge)

        let nextTri = -1
        if (sharingTris) {
          nextTri = sharingTris[0] === currentTri ? sharingTris[1] : sharingTris[0]
        }

        neighborIndices.push(oppV)
        
        // Safety break for unexpected topological boundaries/holes
        if (nextTri === undefined || nextTri === -1) {
           break
        }

        currentTri = nextTri

      } while (currentTri !== startTri && vertexIndices.length < 10)

      cells.push({
        centerIndex: v,
        vertexIndices,
        neighborIndices,
        isPentagon: vertexIndices.length === 5
      })
    }

    return { cells, cellCenters, triangleCenters }
  }
}
