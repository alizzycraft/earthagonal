import { CellID } from '../models/cell-id'
import { Icosahedron, IcosahedronFace } from '../models/icosahedron'

export interface Point3D {
  x: number
  y: number
  z: number
}

export interface BarycentricCoords {
  a: number  // weight for vertex v1
  b: number  // weight for vertex v2
  c: number  // weight for vertex v3
}

export interface GPSCoords {
  lat: number
  lon: number
  alt: number
}

export class SphereProjection {
  private vertices: Array<[number, number, number]>
  private faces: IcosahedronFace[]

  constructor() {
    this.vertices = Icosahedron.normalizeVertices(Icosahedron.generateVertices())
    this.faces = Icosahedron.getFaces()
  }

  /**
   * Convert hex grid coordinates to barycentric coordinates
   */
  hexToBarycentric(cell: CellID): BarycentricCoords {
    const n = cell.resolution
    const a = cell.q / n
    const b = cell.r / n
    const c = 1 - a - b

    return { a, b, c }
  }

  /**
   * Convert barycentric coordinates to 3D position on icosahedron face
   */
  barycentricToTriangle(barycentric: BarycentricCoords, faceIndex: number): Point3D {
    const face = this.faces[faceIndex]
    const v1 = this.vertices[face.v1]
    const v2 = this.vertices[face.v2]
    const v3 = this.vertices[face.v3]

    return {
      x: barycentric.a * v1[0] + barycentric.b * v2[0] + barycentric.c * v3[0],
      y: barycentric.a * v1[1] + barycentric.b * v2[1] + barycentric.c * v3[1],
      z: barycentric.a * v1[2] + barycentric.b * v2[2] + barycentric.c * v3[2]
    }
  }

  /**
   * Normalize point to unit sphere
   */
  normalizeToSphere(point: Point3D): Point3D {
    const length = Math.sqrt(point.x * point.x + point.y * point.y + point.z * point.z)
    return {
      x: point.x / length,
      y: point.y / length,
      z: point.z / length
    }
  }

  /**
   * Scale point to Earth radius
   */
  scaleToEarthRadius(point: Point3D): Point3D {
    const radius = Icosahedron.EARTH_RADIUS_KM
    return {
      x: point.x * radius,
      y: point.y * radius,
      z: point.z * radius
    }
  }

  /**
   * Complete projection: hex grid → triangle → sphere → Earth radius
   */
  projectCellToSphere(cell: CellID): Point3D {
    // Convert hex to barycentric
    const barycentric = this.hexToBarycentric(cell)
    
    // Convert barycentric to triangle position
    const trianglePos = this.barycentricToTriangle(barycentric, cell.face)
    
    // Normalize to sphere
    const spherePos = this.normalizeToSphere(trianglePos)
    
    // Scale to Earth radius
    return this.scaleToEarthRadius(spherePos)
  }

  /**
   * Complete projection with calibration applied
   */
  projectCellToSphereWithCalibration(cell: CellID, calibration?: { rotation: [number, number, number, number] }): Point3D {
    const point = this.projectCellToSphere(cell)
    
    if (calibration) {
      return this.applyCalibration(point, calibration)
    }
    
    return point
  }

  /**
   * Apply calibration rotation to a point
   */
  private applyCalibration(point: Point3D, calibration: { rotation: [number, number, number, number] }): Point3D {
    const [w, x, y, z] = calibration.rotation

    // Quaternion rotation formula: p' = q * p * q^-1
    return {
      x: point.x * (w * w + x * x - y * y - z * z) +
          2 * point.y * (x * y - w * z) +
          2 * point.z * (x * z + w * y),
          
      y: point.y * (w * w - x * x + y * y - z * z) +
          2 * point.x * (x * y + w * z) +
          2 * point.z * (y * z - w * x),
          
      z: point.z * (w * w - x * x - y * y + z * z) +
          2 * point.x * (x * z - w * y) +
          2 * point.y * (y * z + w * x)
    }
  }

  /**
   * Convert 3D point to GPS coordinates
   */
  point3DToGPS(point: Point3D): GPSCoords {
    const normalized = this.normalizeToSphere(point)
    
    const lat = Math.asin(normalized.y) * (180 / Math.PI)
    const lon = Math.atan2(normalized.z, normalized.x) * (180 / Math.PI)
    
    return {
      lat,
      lon,
      alt: 0 // Sea level for now
    }
  }

  /**
   * Convert GPS coordinates to 3D point
   */
  gpsToPoint3D(gps: GPSCoords): Point3D {
    const latRad = gps.lat * (Math.PI / 180)
    const lonRad = gps.lon * (Math.PI / 180)
    
    return {
      x: Math.cos(latRad) * Math.cos(lonRad),
      y: Math.sin(latRad),
      z: Math.cos(latRad) * Math.sin(lonRad)
    }
  }

  /**
   * Get GPS coordinates for a cell
   */
  getCellGPS(cell: CellID): GPSCoords {
    const point3D = this.projectCellToSphere(cell)
    return this.point3DToGPS(point3D)
  }

  /**
   * Batch project multiple cells
   */
  projectCellsToSphere(cells: CellID[]): Point3D[] {
    return cells.map(cell => this.projectCellToSphere(cell))
  }

  /**
   * Batch get GPS coordinates for multiple cells
   */
  getCellsGPS(cells: CellID[]): GPSCoords[] {
    return cells.map(cell => this.getCellGPS(cell))
  }
}
