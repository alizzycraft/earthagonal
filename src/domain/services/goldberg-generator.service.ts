import { Injectable } from '@angular/core'
import { GoldbergMesh, Vec3 } from '../geometry/models/geometry-types'
import { GeodesicGrid } from '../geometry/geodesic-grid'
import { DualMeshBuilder } from '../geometry/dual-mesh'
import { HexRelaxation, RelaxationWeights } from '../geometry/hex-relaxation'
import { GeometryGenerator } from '../geometry/geometry-generator'
import { TerrainDataService } from './terrain-data.service'
import { TerrainSampler } from '../utils/terrain-sampler'
import { SphereProjection, GPSCoords } from './sphere-projection'
import { CoastlineDetector } from '../utils/coastline-detector'

@Injectable({
  providedIn: 'root'
})
export class GoldbergGeneratorService {
  constructor(
    private terrainData: TerrainDataService
  ) {}

  generateSphere(subdivisions: number): GoldbergMesh {
    const projection = new SphereProjection()

    // 1. Geodesic Grid directly to arrays
    const mesh = GeodesicGrid.generate(subdivisions)

    // 2. Dual Mesh Construction
    const { cells, cellCenters, triangleCenters } = DualMeshBuilder.build(
      mesh.vertexBuffer,
      mesh.triangleIndices,
      mesh.vertexCount,
      mesh.triangleCount
    )

    // 3. Terrain-Aware Sampling & Relaxation
    
    // 3.1 Get initial GPS coordinates for sampling
    const cellGPS: GPSCoords[] = []
    for (let i = 0; i < cells.length; i++) {
      const idx = cells[i].centerIndex * 3
      cellGPS.push(projection.point3DToGPS({
        x: cellCenters[idx],
        y: cellCenters[idx + 1],
        z: cellCenters[idx + 2]
      }))
    }

    const triangleGPS: GPSCoords[] = []
    for (let i = 0; i < triangleCenters.length / 3; i++) {
      triangleGPS.push(projection.point3DToGPS({
        x: triangleCenters[i * 3],
        y: triangleCenters[i * 3 + 1],
        z: triangleCenters[i * 3 + 2]
      }))
    }

    // 3.2 Sample elevations
    const cellElevations = TerrainSampler.sampleElevations(cellGPS, this.terrainData)
    const triangleElevations = TerrainSampler.sampleElevations(triangleGPS, this.terrainData)

    // 3.3 Calculate relaxation weights
    const terrainWeights = new Float32Array(cells.length)
    const coastWeights = new Float32Array(cells.length)
    const coastDirections: Vec3[] = []

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      
      // Terrain variance weight
      let variance = 0
      const centerElev = cellElevations[i]
      for (const nIdx of cell.neighborIndices) {
        variance += Math.pow(cellElevations[nIdx] - centerElev, 2)
      }
      variance = Math.sqrt(variance / cell.neighborIndices.length)
      terrainWeights[i] = 1.0 / (1.0 + variance * 0.001)

      // Coastline alignment
      const isCoastal = CoastlineDetector.isCoastal(i, cells, cellElevations)
      if (isCoastal) {
        // Influence based on proximity to sea level
        // coastWeight = exp(-|elevation| / 200)
        coastWeights[i] = Math.exp(-Math.abs(centerElev) / 200.0)
        coastDirections.push(CoastlineDetector.calculateCoastlineDirection(i, cells, cellCenters, cellElevations))
      } else {
        coastWeights[i] = 0
        coastDirections.push({ x: 0, y: 0, z: 0 })
      }
    }

    const weights: RelaxationWeights = {
      terrainWeights,
      coastWeights,
      coastDirections
    }

    // 3.4 Relax grid with terrain awareness
    HexRelaxation.relax(cells, cellCenters, triangleCenters, weights)

    // 4. Final Fan Geometry with vertex displacement and coloring
    const goldbergMesh = GeometryGenerator.buildMesh(
      cells, 
      cellCenters, 
      triangleCenters,
      cellElevations,
      triangleElevations,
      cellGPS,
      triangleGPS
    )

    return goldbergMesh
  }
}
