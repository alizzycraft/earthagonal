import { Injectable } from '@angular/core'
import { GoldbergMesh } from '../geometry/models/geometry-types'
import { GeodesicGrid } from '../geometry/geodesic-grid'
import { DualMeshBuilder } from '../geometry/dual-mesh'
import { HexRelaxation } from '../geometry/hex-relaxation'
import { GeometryGenerator } from '../geometry/geometry-generator'

@Injectable({
  providedIn: 'root'
})
export class GoldbergGeneratorService {
  generateSphere(subdivisions: number): GoldbergMesh {
    // 1. Geodesic Grid directly to arrays
    const mesh = GeodesicGrid.generate(subdivisions)

    // 2. Dual Mesh Construction
    const { cells, cellCenters, triangleCenters } = DualMeshBuilder.build(
      mesh.vertexBuffer,
      mesh.triangleIndices,
      mesh.vertexCount,
      mesh.triangleCount
    )

    // 3. Hex Uniformity Relaxation
    HexRelaxation.relax(cells, cellCenters, triangleCenters)

    // 4. Final Fan Geometry
    const goldbergMesh = GeometryGenerator.buildMesh(cells, cellCenters, triangleCenters)

    return goldbergMesh
  }
}
