import { CellID } from './cell-id'
import { GPSCoords } from '../services/sphere-projection'

export interface FaceMetadata {
  cell: CellID
  centroid: GPSCoords
  name?: string
  type?: string
  properties?: Record<string, any>
}

export interface FaceDataset {
  dataset: string
  version: string
  coordinateSystem: string
  faces: FaceMetadata[]
}

export function createEmptyMetadata(cell: CellID, centroid: GPSCoords): FaceMetadata {
  return {
    cell,
    centroid,
    properties: {}
  }
}

export function validateMetadata(metadata: FaceMetadata): boolean {
  if (!metadata.cell || !metadata.centroid) {
    return false
  }

  // Validate GPS coordinates
  const { lat, lon, alt } = metadata.centroid
  if (typeof lat !== 'number' || typeof lon !== 'number' || typeof alt !== 'number') {
    return false
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return false
  }

  return true
}
