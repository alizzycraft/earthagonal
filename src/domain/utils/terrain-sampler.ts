import { GPSCoords } from '../services/sphere-projection'
import { TerrainDataService } from '../services/terrain-data.service'

export class TerrainSampler {
  /**
   * Sample elevation at a specific GPS coordinate
   */
  static sampleElevation(gps: GPSCoords, terrainService: TerrainDataService): number {
    // Map lat/lon to 0-1 UV
    // Lat: -90 to 90 -> 0 to 1
    // Lon: -180 to 180 -> 0 to 1
    
    const u = (gps.lon + 180) / 360
    const v = (gps.lat + 90) / 180
    
    return terrainService.sampleNormalized(u, v)
  }

  /**
   * Sample elevation at multiple GPS coordinates
   */
  static sampleElevations(gpsCoords: GPSCoords[], terrainService: TerrainDataService): Float32Array {
    const result = new Float32Array(gpsCoords.length)
    for (let i = 0; i < gpsCoords.length; i++) {
      result[i] = this.sampleElevation(gpsCoords[i], terrainService)
    }
    return result
  }
}
