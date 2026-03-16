import { Injectable } from '@angular/core'
import { Cell } from '../geometry/models/geometry-types'
import { CellTerrain, CoastEdge } from '../models/cell-terrain'
import { TerrainDataService } from './terrain-data.service'
import { SphereProjection, Point3D } from './sphere-projection'

@Injectable({
  providedIn: 'root'
})
export class CoastlineAnalyzerService {
  constructor(
    private terrainService: TerrainDataService,
    private projection: SphereProjection
  ) {}

  /**
   * Computes additional spatial metadata for classified cells
   */
  processTerrain(cells: Cell[], cellTerrain: CellTerrain[], triangleCenters: Float32Array): void {
    this.detectCoastlineCrossings(cells, cellTerrain, triangleCenters)
    this.computeDistanceField(cells, cellTerrain)
  }

  /**
   * Detects where the coastline crosses hex cell edges
   */
  private detectCoastlineCrossings(cells: Cell[], cellTerrain: CellTerrain[], triangleCenters: Float32Array): void {
    for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]
        const terrain = cellTerrain[i]
        
        if (terrain.terrainType !== 'coastline') continue

        const numVerts = cell.vertexIndices.length
        for (let j = 0; j < numVerts; j++) {
            const v1Idx = cell.vertexIndices[j] * 3
            const v2Idx = cell.vertexIndices[(j + 1) % numVerts] * 3
            
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

            const s1 = this.sampleElevation(v1)
            const s2 = this.sampleElevation(v2)

            // Coastline crosses edge if elevation signs differ (assuming 0 is sea level)
            if (Math.sign(s1) !== Math.sign(s2) && s1 !== 0 && s2 !== 0) {
                const t = Math.abs(s1) / (Math.abs(s1) + Math.abs(s2))
                terrain.coastEdgeCrossings.push({
                    edgeIndex: j,
                    crossingPoint: t
                })
            }
        }
    }
  }

  /**
   * Computes Distance-to-Coastline Field using BFS
   */
  private computeDistanceField(cells: Cell[], cellTerrain: CellTerrain[]): void {
    const queue: number[] = []
    const visited = new Set<number>()

    // Initialize BFS with coastline cells
    for (let i = 0; i < cellTerrain.length; i++) {
        if (cellTerrain[i].terrainType === 'coastline') {
            cellTerrain[i].coastDistance = 0
            queue.push(i)
            visited.add(i)
        } else {
            cellTerrain[i].coastDistance = Infinity
        }
    }

    // BFS for land and ocean
    let head = 0
    while (head < queue.length) {
        const currIdx = queue[head++]
        const currentDist = cellTerrain[currIdx].coastDistance
        const currentIsLand = cellTerrain[currIdx].terrainType === 'land' || 
                             (cellTerrain[currIdx].terrainType === 'coastline' && cellTerrain[currIdx].elevation > 0)

        for (const neighborIdx of cells[currIdx].neighborIndices) {
            if (!visited.has(neighborIdx)) {
                visited.add(neighborIdx)
                const neighbor = cellTerrain[neighborIdx]
                
                // Distance is positive for land, negative for ocean
                const step = (neighbor.terrainType === 'ocean') ? -1 : 1
                neighbor.coastDistance = currentDist + step
                
                queue.push(neighborIdx)
            }
        }
    }

    // Fix ocean distances (they should radiate negatively from coast)
    // The simple BFS above might not handle the sign correctly if it moves from land to ocean.
    // Let's refine: BFS from coast, but track direction.
    
    // Actually, a better BFS:
    // 1. All coast cells = 0
    // 2. BFS out. Distance = parentDist + (isLand ? 1 : -1)
    // Wait, this only works if we don't cross between land and sea without a coast cell.
    // In our model, all land/sea transitions MUST be coast cells.
  }

  private sampleElevation(p: Point3D): number {
    const gps = this.projection.point3DToGPS(p)
    const u = (gps.lon + 180) / 360
    const v = (90 - gps.lat) / 180
    const s = this.terrainService.sample(u, v)
    return s.landMask > 127 ? s.elevation : -s.oceanDepth
  }
}
