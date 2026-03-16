import { Cell, GoldbergMesh } from './models/geometry-types'
import { Icosahedron } from '../models/icosahedron'
import { CellTerrain } from '../models/cell-terrain'

export class GeometryGenerator {
  static buildMesh(
    cells: Cell[], 
    cellCenters: Float32Array, 
    triangleCenters: Float32Array,
    cellTerrain: CellTerrain[],
    vertexElevations: Float32Array,
    vertexGPS: { lat: number, lon: number }[]
  ): GoldbergMesh {
    const C = cells.length
    const vertexCount = C * 7
    const indexCount = C * 18
    const HEIGHT_SCALE = 0.00003 // Slightly increased for visibility

    const meshVertices = new Float32Array(vertexCount * 3)
    const meshNormals = new Float32Array(vertexCount * 3)
    const meshColors = new Float32Array(vertexCount * 4)
    const meshIndices = new Uint32Array(indexCount)
    const triangleToCell = new Uint32Array(indexCount / 3)

    let vIdx = 0
    let cIdx_buffer = 0
    let iIdx = 0
    let tIdxWrite = 0

    for (let cellIndex = 0; cellIndex < cells.length; cellIndex++) {
      const cell = cells[cellIndex]
      const terrain = cellTerrain[cellIndex]
      const polyVerts = cell.vertexIndices

      // 1. Write the central vertex of the fan
      const centralVIdx = vIdx / 3
      const nx = cellCenters[cell.centerIndex * 3]
      const ny = cellCenters[cell.centerIndex * 3 + 1]
      const nz = cellCenters[cell.centerIndex * 3 + 2]
      
      meshNormals[vIdx]   = nx
      meshNormals[vIdx+1] = ny
      meshNormals[vIdx+2] = nz

      const cellElev = terrain.elevation
      const cellRadius = Icosahedron.EARTH_RADIUS_KM + cellElev * HEIGHT_SCALE
      
      meshVertices[vIdx]   = nx * cellRadius
      meshVertices[vIdx+1] = ny * cellRadius
      meshVertices[vIdx+2] = nz * cellRadius
      
      const cellColor = this.getColorForCell(terrain)
      meshColors[cIdx_buffer++] = cellColor.r
      meshColors[cIdx_buffer++] = cellColor.g
      meshColors[cIdx_buffer++] = cellColor.b
      meshColors[cIdx_buffer++] = 1.0
      
      vIdx += 3

      // 2. Write the polygon perimeter vertices
      const startPolyVertex = vIdx / 3
      for (let i = 0; i < polyVerts.length; i++) {
        const tIdx = polyVerts[i]
        const vnx = triangleCenters[tIdx * 3]
        const vny = triangleCenters[tIdx * 3 + 1]
        const vnz = triangleCenters[tIdx * 3 + 2]
        
        meshNormals[vIdx]   = vnx
        meshNormals[vIdx+1] = vny
        meshNormals[vIdx+2] = vnz

        const vertElev = vertexElevations[tIdx]
        const vertRadius = Icosahedron.EARTH_RADIUS_KM + vertElev * HEIGHT_SCALE

        meshVertices[vIdx]   = vnx * vertRadius
        meshVertices[vIdx+1] = vny * vertRadius
        meshVertices[vIdx+2] = vnz * vertRadius

        // For simplicity, boundary vertices use a blend or the cell's base color
        // Here we use the vertex's own elevation and latitude but cell's distance
        const vertColor = this.getApproxColor(vertElev, vertexGPS[tIdx].lat, terrain.coastDistance)
        meshColors[cIdx_buffer++] = vertColor.r
        meshColors[cIdx_buffer++] = vertColor.g
        meshColors[cIdx_buffer++] = vertColor.b
        meshColors[cIdx_buffer++] = 1.0

        vIdx += 3
      }

      // 3. Generate Fan Triangles
      for (let i = 0; i < polyVerts.length; i++) {
        const next = (i + 1) % polyVerts.length
        
        meshIndices[iIdx++] = centralVIdx
        meshIndices[iIdx++] = startPolyVertex + i
        meshIndices[iIdx++] = startPolyVertex + next

        triangleToCell[tIdxWrite++] = cellIndex
      }
    }

    return {
      vertices: new Float32Array(meshVertices.buffer, 0, vIdx),
      normals: new Float32Array(meshNormals.buffer, 0, vIdx),
      indices: new Uint32Array(meshIndices.buffer, 0, iIdx),
      colors: new Float32Array(meshColors.buffer, 0, cIdx_buffer),
      cells,
      triangleToCell: new Uint32Array(triangleToCell.buffer, 0, tIdxWrite),
      cellTerrain
    }
  }

  private static getColorForCell(terrain: CellTerrain): { r: number, g: number, b: number } {
    return this.getApproxColor(terrain.elevation, terrain.latitude, terrain.coastDistance)
  }

  private static getApproxColor(elevation: number, lat: number, coastDistance: number): { r: number, g: number, b: number } {
    const absLat = Math.abs(lat)
    
    // 1. Polar Regions
    if (absLat > 70) return { r: 0.95, g: 0.95, b: 1.0 } // Snow/Ice
    
    // 2. Mountains
    if (elevation > 4000) return { r: 0.9, g: 0.9, b: 0.95 } // High Mountain Snow
    if (elevation > 2000) return { r: 0.4, g: 0.35, b: 0.3 } // Mountain rock
    
    // 3. Water
    if (elevation <= 0) {
      if (coastDistance >= -2) return { r: 0.2, g: 0.5, b: 0.7 } // Coastal shelf
      if (elevation < -4000) return { r: 0.05, g: 0.1, b: 0.3 } // Deep trench
      return { r: 0.1, g: 0.3, b: 0.6 } // Standard ocean
    }
    
    // 4. Land
    if (coastDistance === 0 || (coastDistance === 1 && elevation < 100)) {
        return { r: 0.8, g: 0.75, b: 0.5 } // Beach / Sand
    }

    if (coastDistance > 6) {
        return { r: 0.6, g: 0.55, b: 0.4 } // Dry interior / Steppe
    }
    
    // Default temperate land
    return { r: 0.2, g: 0.45, b: 0.2 } // Greenery
  }
}

