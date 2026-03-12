import { Injectable } from '@angular/core'
import { CellID } from '../models/cell-id'
import { GoldbergGridGenerator } from './goldberg-grid-generator'
import { SphereProjection } from './sphere-projection'
import { CellGeometryGenerator, TriangleData, CellGeometry } from './cell-geometry-generator'
import { CellLookupService } from './cell-lookup.service'
import { FaceRepository } from '../../infrastructure/repositories/face.repository'

@Injectable({
  providedIn: 'root'
})
export class GoldbergGridService {
  private cells: CellID[] = []
  private cellIndexMap: Map<string, number> = new Map()
  private cellLookupService: CellLookupService | null = null
  private triangleData: TriangleData | null = null
  private geometries: CellGeometry[] = []
  private isInitialized = false

  constructor(
    private faceRepository: FaceRepository
  ) {}

  /**
   * Initialize the Goldberg grid with specified resolution
   */
  async initializeGrid(resolution: number = 8): Promise<void> {
    console.log(`Initializing Goldberg grid with resolution ${resolution}`)

    // Step 1: Generate grid cells
    const generator = new GoldbergGridGenerator(resolution)
    const { cells, cellIndexMap } = generator.generateGrid()
    
    // Validate grid
    if (!generator.validateGrid(cells)) {
      throw new Error('Grid validation failed')
    }

    this.cells = cells
    this.cellIndexMap = cellIndexMap

    // Step 2: Generate cell geometries
    const geometryGenerator = new CellGeometryGenerator(cells, cellIndexMap)
    this.geometries = geometryGenerator.generateAllGeometries()

    // Step 3: Generate triangle data for Babylon.js
    this.triangleData = geometryGenerator.generateTriangleData(this.geometries)

    // Validate triangle data
    if (!geometryGenerator.validateTriangleData(this.triangleData)) {
      throw new Error('Triangle data validation failed')
    }

    // Step 4: Create cell lookup service
    this.cellLookupService = new CellLookupService(this.triangleData, cells)

    if (!this.cellLookupService.validate()) {
      throw new Error('Cell lookup service validation failed')
    }

    // Step 5: Initialize metadata for all cells
    await this.initializeMetadata()

    this.isInitialized = true

    console.log(`Goldberg grid initialized successfully:`)
    console.log(`- ${cells.length} cells`)
    console.log(`- ${this.triangleData.triangleToCell.length} triangles`)
    console.log(`- ${this.triangleData.vertices.length / 3} vertices`)
  }

  /**
   * Initialize metadata for all cells
   */
  private async initializeMetadata(): Promise<void> {
    const projection = new SphereProjection()
    const centroids = projection.getCellsGPS(this.cells)

    // Create metadata for cells that don't have it
    for (let i = 0; i < this.cells.length; i++) {
      const cell = this.cells[i]
      
      if (!this.faceRepository.hasMetadata(cell)) {
        const metadata = {
          cell,
          centroid: centroids[i],
          properties: {}
        }
        
        this.faceRepository.setMetadata(metadata)
      }
    }

    console.log(`Metadata initialized for ${this.cells.length} cells`)
  }

  /**
   * Get triangle data for Babylon.js mesh creation
   */
  getTriangleData(): TriangleData | null {
    return this.triangleData
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
   * Get cell geometries
   */
  getGeometries(): CellGeometry[] {
    return [...this.geometries]
  }

  /**
   * Get geometry for a specific cell
   */
  getCellGeometry(cell: CellID): CellGeometry | undefined {
    const index = this.getCellIndex(cell)
    if (index !== undefined) {
      return this.geometries[index]
    }
    return undefined
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
      totalVertices: this.triangleData ? this.triangleData.vertices.length / 3 : 0,
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

    // For now, return the first cell as a placeholder
    // In a full implementation, this would use spatial indexing
    // to find the closest cell to the GPS coordinates
    return this.cells[0] || null
  }

  /**
   * Get cells within distance of a target cell
   */
  getCellsInDistance(target: CellID, distance: number): CellID[] {
    // This would use the HexGridMath distance functions
    // For now, return empty array as placeholder
    return []
  }

  /**
   * Get neighbors of a cell
   */
  getCellNeighbors(cell: CellID): CellID[] {
    // This would use the HexGridMath neighbor functions
    // with proper face transition handling
    return []
  }

  /**
   * Validate the entire grid system
   */
  validate(): boolean {
    if (!this.isInitialized || !this.cellLookupService || !this.triangleData) {
      return false
    }

    // Basic consistency checks
    if (this.cells.length !== this.geometries.length) {
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
    this.triangleData = null
    this.geometries = []
    this.isInitialized = false
  }
}
