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
  async initializeGrid(resolution: number = 0): Promise<void> {
    console.log(`Initializing Goldberg grid with resolution ${resolution}`)
    
    // Prevent extremely high resolutions that cause memory issues
    if (resolution > 5) {
      console.warn(`Resolution ${resolution} is too high for current hardware. Using 5 instead.`)
      resolution = 5
    }
    
    // Log memory estimates
    const cellCounts = [12, 42, 162, 642, 2562, 10242] // resolutions 0-5
    const triangleCounts = [60, 240, 960, 3840, 15360, 61440] // corresponding triangles
    const vertexCounts = [72, 282, 1122, 4582, 18342, 73482] // corresponding vertices
    
    if (resolution < cellCounts.length) {
      const estimatedMemoryMB = (triangleCounts[resolution] * 3 * 4 + vertexCounts[resolution] * 3 * 4) / (1024 * 1024)
      console.log(`Memory estimate: ~${estimatedMemoryMB.toFixed(1)}MB for ${triangleCounts[resolution]} triangles`)
      console.log(`Expected: ${cellCounts[resolution]} cells (${resolution === 4 ? 'matches m=16,n=0' : 'Goldberg polyhedron'})`)
    }

    // Step 1: Generate cell geometries using new Goldberg approach
    const geometryGenerator = new CellGeometryGenerator(resolution)
    this.geometries = geometryGenerator.generateAllGeometries()

    // Step 2: Generate triangle data for Babylon.js
    this.triangleData = geometryGenerator.generateTriangleData(this.geometries)

    // Validate triangle data
    if (!geometryGenerator.validateTriangleData(this.triangleData)) {
      throw new Error('Triangle data validation failed')
    }

    // Step 3: Create mock cells for compatibility
    this.cells = this.geometries.map(g => g.cell)
    this.cellIndexMap = new Map()
    this.cells.forEach((cell, index) => {
      const key = `${cell.face}:${cell.q}:${cell.r}:${cell.resolution}`
      this.cellIndexMap.set(key, index)
    })

    // Step 3: Create cell lookup service with geometries
    this.cellLookupService = new CellLookupService(this.triangleData, this.cells, this.geometries)

    if (!this.cellLookupService.validate()) {
      throw new Error('Cell lookup service validation failed')
    }

    // Step 5: Initialize metadata for all cells
    await this.initializeMetadata()

    this.isInitialized = true

    const topology = geometryGenerator.getTopologyInfo()
    console.log(`Goldberg grid initialized successfully:`)
    console.log(`- ${this.cells.length} cells`)
    console.log(`- ${topology.pentagons} pentagons, ${topology.hexagons} hexagons`)
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
