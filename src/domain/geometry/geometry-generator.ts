import { Cell, GoldbergMesh } from './models/geometry-types'
import { Icosahedron } from '../models/icosahedron'

export class GeometryGenerator {
  static buildMesh(cells: Cell[], cellCenters: Float32Array, triangleCenters: Float32Array): GoldbergMesh {
    const C = cells.length
    // Max capacity assuming all hexagons. (Center + 6 polygon verts) = 7 verts per hex.
    // 6 triangles per hex * 3 indices = 18 indices per hex.
    const vertexCount = C * 7
    const indexCount = C * 18

    // Float32Arrays for raw unindexed position/normals buffers
    // Note: We're building duplicate vertices for Babylon per-triangle flat smoothing! 
    // Wait, flat shading usually requires duplicate vertices. For a smooth globe?
    // The previous implementation used unindexed buffers for triangle fan?
    // "Each cell polygon is triangulated using a fan originating from the relaxed cell center."
    
    // Create new tight buffers
    const meshVertices = new Float32Array(vertexCount * 3)
    const meshNormals = new Float32Array(vertexCount * 3)
    const meshIndices = new Uint32Array(indexCount)
    const triangleToCell = new Uint32Array(indexCount / 3)

    let vIdx = 0
    let iIdx = 0
    let tIdxWrite = 0

    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      const cell = cells[cellIndex]
      const polyVerts = cell.vertexIndices

      // 1. Write the central vertex of the fan
      const cIdx = vIdx / 3
      meshNormals[vIdx]   = cellCenters[cell.centerIndex * 3]
      meshNormals[vIdx+1] = cellCenters[cell.centerIndex * 3 + 1]
      meshNormals[vIdx+2] = cellCenters[cell.centerIndex * 3 + 2]

      meshVertices[vIdx]   = meshNormals[vIdx] * Icosahedron.EARTH_RADIUS_KM
      meshVertices[vIdx+1] = meshNormals[vIdx+1] * Icosahedron.EARTH_RADIUS_KM
      meshVertices[vIdx+2] = meshNormals[vIdx+2] * Icosahedron.EARTH_RADIUS_KM
      
      vIdx += 3

      // 2. Write the polygon perimeter vertices
      const startPolyVertex = vIdx / 3
      for (const tIdx of polyVerts) {
        meshNormals[vIdx]   = triangleCenters[tIdx * 3]
        meshNormals[vIdx+1] = triangleCenters[tIdx * 3 + 1]
        meshNormals[vIdx+2] = triangleCenters[tIdx * 3 + 2]

        meshVertices[vIdx]   = meshNormals[vIdx] * Icosahedron.EARTH_RADIUS_KM
        meshVertices[vIdx+1] = meshNormals[vIdx+1] * Icosahedron.EARTH_RADIUS_KM
        meshVertices[vIdx+2] = meshNormals[vIdx+2] * Icosahedron.EARTH_RADIUS_KM

        vIdx += 3
      }

      // 3. Generate Fan Triangles
      for (let i = 0; i < polyVerts.length; i++) {
        const next = (i + 1) % polyVerts.length
        
        meshIndices[iIdx++] = cIdx
        meshIndices[iIdx++] = startPolyVertex + i
        meshIndices[iIdx++] = startPolyVertex + next

        triangleToCell[tIdxWrite++] = cellIndex
      }
    }

    // Shrink arrays in case of pentagon capacity unused
    const finalVBuf = new Float32Array(meshVertices.buffer, 0, vIdx)
    const finalNBuf = new Float32Array(meshNormals.buffer, 0, vIdx)
    const finalIBuf = new Uint32Array(meshIndices.buffer, 0, iIdx)
    const finalT2CBuf = new Uint32Array(triangleToCell.buffer, 0, tIdxWrite)

    return {
      vertices: finalVBuf,
      normals: finalNBuf,
      indices: finalIBuf,
      cells,
      triangleToCell: finalT2CBuf
    }
  }
}
