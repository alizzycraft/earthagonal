import { GPSCoords, SphereProjection, Point3D } from '../services/sphere-projection'
import { TerrainDataService } from '../services/terrain-data.service'
import { CellTerrain, TerrainType } from '../models/cell-terrain'
import { Cell } from '../geometry/models/geometry-types'

export class TerrainSampler {
  /**
   * Samples terrain data for a specific cell using the 19-point strategy
   */
  static sampleCellTerrain(
    cell: Cell,
    cellCenters: Float32Array,
    triangleCenters: Float32Array,
    terrainService: TerrainDataService,
    projection: SphereProjection
  ): CellTerrain {
    const samples: { landMask: number, elevation: number, oceanDepth: number }[] = []
    
    const centerIdx = cell.centerIndex * 3
    const center: Point3D = {
      x: cellCenters[centerIdx],
      y: cellCenters[centerIdx + 1],
      z: cellCenters[centerIdx + 2]
    }

    // 1. Center Sample
    samples.push(this.sampleAtPoint(center, terrainService, projection))

    // 2. Vertices & Edge Midpoints & Radials
    const numVerts = cell.vertexIndices.length
    for (let i = 0; i < numVerts; i++) {
      const v1Idx = cell.vertexIndices[i] * 3
      const v2Idx = cell.vertexIndices[(i + 1) % numVerts] * 3
      
      const v1: Point3D = {
        x: triangleCenters[v1Idx],
        y: triangleCenters[v1Idx + 1],
        z: triangleCenters[v1Idx + 2]
      }
      
      const v2: Point3D = {
        x: triangleCenters[v2Idx],
        y: triangleCenters[v2Idx + 1],
        z: triangleCenters[v2Idx + 2]
      }

      // Vertex Sample
      samples.push(this.sampleAtPoint(v1, terrainService, projection))

      // Edge Midpoint Sample
      const midpoint = this.normalizePoint({
        x: (v1.x + v2.x) / 2,
        y: (v1.y + v2.y) / 2,
        z: (v1.z + v2.z) / 2
      })
      samples.push(this.sampleAtPoint(midpoint, terrainService, projection))

      // Radial Sample (halfway between center and vertex)
      const radial = this.normalizePoint({
        x: (center.x + v1.x) / 2,
        y: (center.y + v1.y) / 2,
        z: (center.z + v1.z) / 2
      })
      samples.push(this.sampleAtPoint(radial, terrainService, projection))
    }

    // Classification
    const landSamples = samples.filter(s => s.landMask > 127).length
    const landRatio = landSamples / samples.length
    
    let terrainType: TerrainType = 'ocean'
    if (landRatio > 0.65) {
      terrainType = 'land'
    } else if (landRatio >= 0.35 || samples[0].landMask > 127) {
      // Force coastline if center is land or ratio is in range
      terrainType = 'coastline'
    }

    // Weighted Elevation Aggregation
    // Weights: Center(3), Radial(2), Vertex/Midpoint(1)
    let totalElevation = 0
    let totalWeight = 0

    // Center is index 0
    const centerElev = samples[0].landMask > 127 ? samples[0].elevation : -samples[0].oceanDepth
    totalElevation += centerElev * 3
    totalWeight += 3

    for (let i = 0; i < numVerts; i++) {
        // Vertex Sample (1 + 3*i)
        // Midpoint Sample (2 + 3*i)
        // Radial Sample (3 + 3*i)
        const vElev = samples[1 + 3*i].landMask > 127 ? samples[1 + 3*i].elevation : -samples[1 + 3*i].oceanDepth
        const mElev = samples[2 + 3*i].landMask > 127 ? samples[2 + 3*i].elevation : -samples[2 + 3*i].oceanDepth
        const rElev = samples[3 + 3*i].landMask > 127 ? samples[3 + 3*i].elevation : -samples[3 + 3*i].oceanDepth
        
        totalElevation += vElev * 1 + mElev * 1 + rElev * 2
        totalWeight += 4
    }

    const gps = projection.point3DToGPS(center)

    return {
      terrainType,
      elevation: totalElevation / totalWeight,
      landRatio,
      coastDistance: 0, // Computed later
      latitude: gps.lat,
      longitude: gps.lon,
      coastEdgeCrossings: [] // Computed later
    }
  }

  /**
   * Sample elevation at a specific GPS coordinate (Legacy compatibility)
   */
  static sampleElevation(gps: GPSCoords, terrainService: TerrainDataService): number {
    const u = (gps.lon + 180) / 360
    const v = (90 - gps.lat) / 180 // Corrected parity from spec: 0 lat = 0.5 v, 90 lat = 0 v
    
    const s = terrainService.sample(u, v)
    return s.landMask > 127 ? s.elevation : -s.oceanDepth
  }

  /**
   * Sample elevation at multiple GPS coordinates (Legacy compatibility)
   */
  static sampleElevations(gpsCoords: GPSCoords[], terrainService: TerrainDataService): Float32Array {
    const result = new Float32Array(gpsCoords.length)
    for (let i = 0; i < gpsCoords.length; i++) {
      result[i] = this.sampleElevation(gpsCoords[i], terrainService)
    }
    return result
  }

  private static sampleAtPoint(p: Point3D, terrainService: TerrainDataService, projection: SphereProjection) {
    const gps = projection.point3DToGPS(p)
    const u = (gps.lon + 180) / 360
    const v = (90 - gps.lat) / 180
    return terrainService.sample(u, v)
  }

  private static normalizePoint(p: Point3D): Point3D {
    const l = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)
    return { x: p.x / l, y: p.y / l, z: p.z / l }
  }
}

