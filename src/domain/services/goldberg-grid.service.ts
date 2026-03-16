import { Injectable } from '@angular/core'
import { CellID } from '../models/cell-id'
import { GoldbergGeneratorService } from './goldberg-generator.service'
import { SphereProjection } from './sphere-projection'
import { CellLookupService } from './cell-lookup.service'
import { FaceRepository } from '../../infrastructure/repositories/face.repository'
import { GoldbergMesh } from '../geometry/models/geometry-types'

@Injectable({
  providedIn: 'root'
})
export class GoldbergGridService {
  private cells: CellID[] = []
  private cellIndexMap: Map<string, number> = new Map()
  private cellLookupService: CellLookupService | null = null
  private meshData: GoldbergMesh | null = null
  private isInitialized = false

  constructor(
    private faceRepository: FaceRepository,
    private goldbergGenerator: GoldbergGeneratorService
  ) {}

  /**
   * Initialize the Goldberg grid with specified resolution
   */
  async initializeGrid(resolution: number = 0): Promise<void> {
    console.log(`Initializing Goldberg grid with resolution ${resolution}`)
    
    // Prevent extremely high resolutions that cause memory issues
    if (resolution > 30) {
      console.warn(`Resolution ${resolution} is too high for current hardware. Using 30 instead.`)
      resolution = 30
    }
    
    const start = performance.now()

    // Generate mesh using the optimized deterministic pipeline
    this.meshData = await this.goldbergGenerator.generateSphere(resolution)

    console.log(`Generation took ${performance.now() - start}ms`)

    // Create mock cells for compatibility with existing tracking/selection systems
    // In a real implementation, these would be derived from the generator's cell structure
    this.cells = this.meshData.cells.map((_, index) => {
       return {
         face: 0,
         q: index % 100, // Dummy Q/R for legacy CellID format
         r: Math.floor(index / 100),
         resolution
       }
    })
    
    this.cellIndexMap = new Map()
    this.cells.forEach((cell, index) => {
      const key = `${cell.face}:${cell.q}:${cell.r}:${cell.resolution}`
      this.cellIndexMap.set(key, index)
    })

    // Create cell lookup service with the optimized buffers
    this.cellLookupService = new CellLookupService(this.meshData, this.cells)

    if (!this.cellLookupService.validate()) {
      throw new Error('Cell lookup service validation failed')
    }

    // Initialize metadata for all cells
    await this.initializeMetadata()

    this.isInitialized = true

    const stats = this.getStatistics()
    console.log(`Goldberg grid initialized successfully:`)
    console.log(`- ${stats.totalCells} cells`)
    console.log(`- ${stats.pentagonCount} pentagons, ${stats.hexagonCount} hexagons`)
    console.log(`- ${stats.totalTriangles} triangles`)
    console.log(`- ${stats.totalVertices} vertices`)
  }

  /**
   * Initialize metadata for all cells
   */
  private async initializeMetadata(): Promise<void> {
    if (!this.meshData) return

    // Create metadata for cells using the newly generated terrain data
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      const terrain = this.meshData.cellTerrain[i]
      
      const metadata = {
        cell,
        centroid: { lat: terrain.latitude, lon: terrain.longitude, alt: terrain.elevation },
        type: terrain.terrainType,
        terrain: terrain,
        properties: {
            landRatio: terrain.landRatio,
            coastDistance: terrain.coastDistance
        }
      }
      
      this.faceRepository.setMetadata(metadata)
    }

    console.log(`Metadata initialized for ${this.cells.length} cells`)
  }

  /**
   * Get generated mesh data
   */
  getMeshData(): GoldbergMesh | null {
    return this.meshData
  }

  /**
   * Get cell lookup service for picking
   */
  getCellLookupService(): CellLookupService | null {
    return this.cellLookupService
  }

  /**
   * Get all cells
   */
  getCells(): CellID[] {
    return [...this.cells]
  }

  /**
   * Get cell by index
   */
  getCell(index: number): CellID | undefined {
    return this.cells[index]
  }

  /**
   * Get cell index for CellID
   */
  getCellIndex(cell: CellID): number | undefined {
    const key = `${cell.face}:${cell.q}:${cell.r}:${cell.resolution}`
    return this.cellIndexMap.get(key)
  }

  /**
   * Check if service is initialized
   */
  isReady(): boolean {
    return this.isInitialized
  }

  /**
   * Get grid statistics
   */
  getStatistics(): {
    totalCells: number
    totalTriangles: number
    totalVertices: number
    pentagonCount: number
    hexagonCount: number
    resolution: number
  } {
    if (!this.isInitialized || !this.cellLookupService) {
      throw new Error('Grid not initialized')
    }

    const stats = this.cellLookupService.getStatistics()
    const resolution = this.cells[0]?.resolution || 0

    return {
      totalCells: stats.totalCells,
      totalTriangles: stats.totalTriangles,
      totalVertices: this.meshData ? this.meshData.vertices.length / 3 : 0,
      pentagonCount: stats.pentagonCount,
      hexagonCount: stats.hexagonCount,
      resolution
    }
  }

  /**
   * Find cell by GPS coordinates (approximate)
   */
  findCellByGPS(lat: number, lon: number): CellID | null {
    if (!this.isInitialized) {
      return null
    }
    return this.cells[0] || null
  }

  /**
   * Get cells within distance of a target cell
   */
  getCellsInDistance(target: CellID, distance: number): CellID[] {
    return []
  }

  /**
   * Get neighbors of a cell
   */
  getCellNeighbors(cell: CellID): CellID[] {
    return []
  }

  /**
   * Validate the entire grid system
   */
  validate(): boolean {
    if (!this.isInitialized || !this.cellLookupService || !this.meshData) {
      return false
    }

    if (this.cells.length !== this.meshData.cells.length) {
      console.error('Cells and geometries count mismatch')
      return false
    }

    if (this.cells.length !== this.cellIndexMap.size) {
      console.error('Cells and index map size mismatch')
      return false
    }

    return true
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.cells = []
    this.cellIndexMap.clear()
    this.cellLookupService = null
    this.meshData = null
    this.isInitialized = false
  }
}
