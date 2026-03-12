import { Injectable } from '@angular/core'
import { CellID } from '../../domain/models/cell-id'
import { FaceMetadata, FaceDataset, validateMetadata } from '../../domain/models/face-metadata'
import { cellIDToString, cellIDFromString } from '../../domain/models/cell-id'

@Injectable({
  providedIn: 'root'
})
export class FaceRepository {
  private metadata: Map<string, FaceMetadata> = new Map()
  private dataUrl = '/assets/data/faces.json'
  private isLoaded = false

  constructor() {
    this.loadMetadata()
  }

  /**
   * Load metadata from JSON file
   */
  async loadMetadata(): Promise<void> {
    try {
      const response = await fetch(this.dataUrl)
      if (!response.ok) {
        console.warn('Could not load face metadata, using empty dataset')
        return
      }

      const dataset: FaceDataset = await response.json()
      
      // Validate dataset structure
      if (!dataset.faces || !Array.isArray(dataset.faces)) {
        console.error('Invalid face metadata format')
        return
      }

      // Clear existing metadata
      this.metadata.clear()

      // Load each face metadata
      for (const faceData of dataset.faces) {
        if (validateMetadata(faceData)) {
          const key = cellIDToString(faceData.cell)
          this.metadata.set(key, faceData)
        } else {
          console.warn('Invalid face metadata entry:', faceData)
        }
      }

      this.isLoaded = true
      console.log(`Loaded ${this.metadata.size} face metadata entries`)
      
    } catch (error) {
      console.error('Error loading face metadata:', error)
      this.isLoaded = false
    }
  }

  /**
   * Save metadata to JSON file (in a real app, this would call an API)
   */
  async saveMetadata(): Promise<void> {
    if (!this.isLoaded) {
      console.warn('Cannot save metadata before loading')
      return
    }

    const dataset: FaceDataset = {
      dataset: 'earthagonal-grid',
      version: '1.0',
      coordinateSystem: 'WGS84',
      faces: Array.from(this.metadata.values())
    }

    try {
      // In a real application, this would be an API call
      // For now, we'll just log the data that would be saved
      console.log('Saving metadata:', JSON.stringify(dataset, null, 2))
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 100))
      
      console.log(`Saved ${this.metadata.size} face metadata entries`)
      
    } catch (error) {
      console.error('Error saving face metadata:', error)
    }
  }

  /**
   * Get metadata for a specific cell
   */
  getMetadata(cell: CellID): FaceMetadata | undefined {
    const key = cellIDToString(cell)
    return this.metadata.get(key)
  }

  /**
   * Set metadata for a cell
   */
  setMetadata(metadata: FaceMetadata): void {
    if (!validateMetadata(metadata)) {
      throw new Error('Invalid metadata format')
    }

    const key = cellIDToString(metadata.cell)
    this.metadata.set(key, metadata)
  }

  /**
   * Update metadata for a cell (partial update)
   */
  updateMetadata(cell: CellID, updates: Partial<FaceMetadata>): void {
    const existing = this.getMetadata(cell)
    if (!existing) {
      throw new Error('No existing metadata for cell')
    }

    const updated: FaceMetadata = {
      ...existing,
      ...updates,
      cell, // Ensure cell ID is preserved
      centroid: updates.centroid || existing.centroid
    }

    if (!validateMetadata(updated)) {
      throw new Error('Invalid updated metadata')
    }

    this.setMetadata(updated)
  }

  /**
   * Delete metadata for a cell
   */
  deleteMetadata(cell: CellID): boolean {
    const key = cellIDToString(cell)
    return this.metadata.delete(key)
  }

  /**
   * Check if metadata exists for a cell
   */
  hasMetadata(cell: CellID): boolean {
    const key = cellIDToString(cell)
    return this.metadata.has(key)
  }

  /**
   * Get all metadata
   */
  getAllMetadata(): FaceMetadata[] {
    return Array.from(this.metadata.values())
  }

  /**
   * Get metadata by name
   */
  getMetadataByName(name: string): FaceMetadata[] {
    return Array.from(this.metadata.values()).filter(m => m.name === name)
  }

  /**
   * Get metadata by type
   */
  getMetadataByType(type: string): FaceMetadata[] {
    return Array.from(this.metadata.values()).filter(m => m.type === type)
  }

  /**
   * Search metadata by property
   */
  searchMetadata(property: string, value: any): FaceMetadata[] {
    return Array.from(this.metadata.values()).filter(m => 
      m.properties && m.properties[property] === value
    )
  }

  /**
   * Get metadata count
   */
  getCount(): number {
    return this.metadata.size
  }

  /**
   * Clear all metadata
   */
  clear(): void {
    this.metadata.clear()
    this.isLoaded = false
  }

  /**
   * Check if repository is loaded
   */
  isReady(): boolean {
    return this.isLoaded
  }

  /**
   * Create metadata for multiple cells
   */
  createMetadataBatch(cells: CellID[], centroids: any[]): void {
    if (cells.length !== centroids.length) {
      throw new Error('Cells and centroids arrays must have same length')
    }

    for (let i = 0; i < cells.length; i++) {
      const metadata = {
        cell: cells[i],
        centroid: centroids[i],
        properties: {}
      }
      
      if (validateMetadata(metadata)) {
        this.setMetadata(metadata)
      }
    }
  }

  /**
   * Get statistics about the metadata
   */
  getStatistics(): {
    totalFaces: number
    namedFaces: number
    typedFaces: number
    types: Record<string, number>
  } {
    const allMetadata = this.getAllMetadata()
    const types: Record<string, number> = {}

    for (const metadata of allMetadata) {
      if (metadata.type) {
        types[metadata.type] = (types[metadata.type] || 0) + 1
      }
    }

    return {
      totalFaces: allMetadata.length,
      namedFaces: allMetadata.filter(m => m.name).length,
      typedFaces: allMetadata.filter(m => m.type).length,
      types
    }
  }
}
