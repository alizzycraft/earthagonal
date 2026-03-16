import { Injectable } from '@angular/core'
import { GoldbergMesh, Vec3 } from '../geometry/models/geometry-types'
import { GeodesicGrid } from '../geometry/geodesic-grid'
import { DualMeshBuilder } from '../geometry/dual-mesh'
import { HexRelaxation, RelaxationWeights } from '../geometry/hex-relaxation'
import { GeometryGenerator } from '../geometry/geometry-generator'
import { TerrainDataService } from './terrain-data.service'
import { TerrainSampler } from '../utils/terrain-sampler'
import { SphereProjection, GPSCoords } from './sphere-projection'
import { CoastlineAnalyzerService } from './coastline-analyzer.service'
import { CellTerrain } from '../models/cell-terrain'

@Injectable({
  providedIn: 'root'
})
export class GoldbergGeneratorService {
  constructor(
    private terrainData: TerrainDataService,
    private coastlineAnalyzer: CoastlineAnalyzerService,
    private projection: SphereProjection
  ) {}

  async generateSphere(subdivisions: number): Promise<GoldbergMesh> {
    // 0. Ensure terrain data is ready
    await this.terrainData.ensureReady()

    // 1. Geodesic Grid directly to arrays
    const mesh = GeodesicGrid.generate(subdivisions)

    // 2. Dual Mesh Construction
    const { cells, cellCenters, triangleCenters } = DualMeshBuilder.build(
      mesh.vertexBuffer,
      mesh.triangleIndices,
      mesh.vertexCount,
      mesh.triangleCount
    )

    // 3. Terrain-Aware Sampling & Analysis
    
    // 3.1 Sample Cell Terrain (19-point strategy)
    const cellTerrain: CellTerrain[] = []
    for (let i = 0; i < cells.length; i++) {
        cellTerrain.push(TerrainSampler.sampleCellTerrain(
            cells[i],
            cellCenters,
            triangleCenters,
            this.terrainData,
            this.projection
        ))
    }

    // 3.2 Sample Vertex (Triangle) Elevations for displacement
    const triangleGPS: GPSCoords[] = []
    for (let i = 0; i < triangleCenters.length / 3; i++) {
      triangleGPS.push(this.projection.point3DToGPS({
        x: triangleCenters[i * 3],
        y: triangleCenters[i * 3 + 1],
        z: triangleCenters[i * 3 + 2]
      }))
    }
    const vertexElevations = TerrainSampler.sampleElevations(triangleGPS, this.terrainData)

    // 3.3 Spatial Analysis (Edge crossings & Distance Field)
    this.coastlineAnalyzer.processTerrain(cells, cellTerrain, triangleCenters)

    // 4. Calculate relaxation weights (Dynamic adjustment)
    const relaxationWeights = this.calculateRelaxationWeights(cells, cellCenters, cellTerrain)
    
    // 5. Relax grid with terrain awareness
    HexRelaxation.relax(cells, cellCenters, triangleCenters, relaxationWeights)

    // 6. Final Fan Geometry with vertex displacement and coloring
    const goldbergMesh = GeometryGenerator.buildMesh(
      cells, 
      cellCenters, 
      triangleCenters,
      cellTerrain,
      vertexElevations,
      triangleGPS
    )

    return goldbergMesh
  }

  private calculateRelaxationWeights(cells: any[], cellCenters: Float32Array, cellTerrain: CellTerrain[]): RelaxationWeights {
    const terrainWeights = new Float32Array(cells.length)
    const coastWeights = new Float32Array(cells.length)
    const coastDirections: Vec3[] = []

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]
      const terrain = cellTerrain[i]
      
      // Terrain variance weight
      let variance = 0
      const centerElev = terrain.elevation
      for (const nIdx of cell.neighborIndices) {
        variance += Math.pow(cellTerrain[nIdx].elevation - centerElev, 2)
      }
      variance = Math.sqrt(variance / cell.neighborIndices.length)
      terrainWeights[i] = 1.0 / (1.0 + variance * 0.001)

      // Coastline alignment
      if (terrain.terrainType === 'coastline') {
        coastWeights[i] = Math.exp(-Math.abs(centerElev) / 200.0)
        
        // Simple direction toward inland
        const inlandDir = { x: 0, y: 0, z: 0 }
        for (const nIdx of cell.neighborIndices) {
            if (cellTerrain[nIdx].terrainType === 'land') {
                const nIdx3 = nIdx * 3
                const cIdx3 = i * 3
                inlandDir.x += cellCenters[nIdx3] - cellCenters[cIdx3]
                inlandDir.y += cellCenters[nIdx3+1] - cellCenters[cIdx3+1]
                inlandDir.z += cellCenters[nIdx3+2] - cellCenters[cIdx3+2]
            }
        }
        const mag = Math.sqrt(inlandDir.x**2 + inlandDir.y**2 + inlandDir.z**2)
        if (mag > 0) {
            coastDirections.push({ x: inlandDir.x / mag, y: inlandDir.y / mag, z: inlandDir.z / mag })
        } else {
            coastDirections.push({ x: 0, y: 0, z: 0 })
        }
      } else {
        coastWeights[i] = 0
        coastDirections.push({ x: 0, y: 0, z: 0 })
      }
    }

    return { terrainWeights, coastWeights, coastDirections }
  }
}

