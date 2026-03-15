import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root'
})
export class TerrainDataService {
  private heightmap: Float32Array
  private width: number = 1024
  private height: number = 512

  constructor() {
    this.heightmap = this.generateProceduralHeightmap()
  }

  /**
   * Samples elevation at normalized UV coordinates (0-1)
   */
  sampleNormalized(u: number, v: number): number {
    const x = Math.max(0, Math.min(this.width - 1, u * this.width))
    const y = Math.max(0, Math.min(this.height - 1, v * this.height))
    
    // Bilinear interpolation
    const x1 = Math.floor(x)
    const y1 = Math.floor(y)
    const x2 = Math.min(x1 + 1, this.width - 1)
    const y2 = Math.min(y1 + 1, this.height - 1)
    
    const fx = x - x1
    const fy = y - y1
    
    const v11 = this.heightmap[y1 * this.width + x1]
    const v21 = this.heightmap[y1 * this.width + x2]
    const v12 = this.heightmap[y2 * this.width + x1]
    const v22 = this.heightmap[y2 * this.width + x2]
    
    const r1 = v11 * (1 - fx) + v21 * fx
    const r2 = v12 * (1 - fx) + v22 * fx
    
    return r1 * (1 - fy) + r2 * fy
  }

  /**
   * Generates a simple procedural world map for testing
   * (Simulating landmasses, oceans, and mountains)
   */
  private generateProceduralHeightmap(): Float32Array {
    const data = new Float32Array(this.width * this.height)
    
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const u = x / this.width
        const v = y / this.height
        
        // Use multiple octaves of "pseudo-perlin" or simple sine combinations
        // to create a world-like appearance
        const lat = (v - 0.5) * Math.PI
        const lon = (u - 0.5) * 2 * Math.PI
        
        const px = Math.cos(lat) * Math.cos(lon)
        const py = Math.sin(lat)
        const pz = Math.cos(lat) * Math.sin(lon)
        
        // Base landmasses
        let n = this.dummyNoise(px * 2, py * 2, pz * 2) * 1.5
        n += this.dummyNoise(px * 4, py * 4, pz * 4) * 0.5
        n += this.dummyNoise(px * 8, py * 8, pz * 8) * 0.25
        
        // Elevation mapping:
        // - negative: ocean
        // - positive: land
        let elevation = n * 2000 // Scale to meters
        
        // Add some mountain peaks
        if (elevation > 500) {
           elevation += this.dummyNoise(px * 16, py * 16, pz * 16) * 1500
        }
        
        // Deep oceans
        if (elevation < -500) {
           elevation -= Math.abs(this.dummyNoise(px * 8, py * 8, pz * 8)) * 3000
        }

        data[y * this.width + x] = elevation
      }
    }
    
    return data
  }

  /**
   * Deterministic pseudo-random noise for reproducibility
   */
  private dummyNoise(x: number, y: number, z: number): number {
    const floorX = Math.floor(x)
    const floorY = Math.floor(y)
    const floorZ = Math.floor(z)
    
    const fractX = x - floorX
    const fractY = y - floorY
    const fractZ = z - floorZ
    
    // Simple hash-based noise
    const hash = (nx: number, ny: number, nz: number) => {
      const s = Math.sin(nx * 12.9898 + ny * 78.233 + nz * 45.164) * 43758.5453123
      return s - Math.floor(s)
    }
    
    // Trilinear interpolation of hashes at corners
    const v000 = hash(floorX, floorY, floorZ)
    const v100 = hash(floorX + 1, floorY, floorZ)
    const v010 = hash(floorX, floorY + 1, floorZ)
    const v110 = hash(floorX + 1, floorY + 1, floorZ)
    const v001 = hash(floorX, floorY, floorZ + 1)
    const v101 = hash(floorX + 1, floorY, floorZ + 1)
    const v011 = hash(floorX, floorY + 1, floorZ + 1)
    const v111 = hash(floorX + 1, floorY + 1, floorZ + 1)
    
    const i1 = v000 * (1 - fractX) + v100 * fractX
    const i2 = v010 * (1 - fractX) + v110 * fractX
    const i3 = v001 * (1 - fractX) + v101 * fractX
    const i4 = v011 * (1 - fractX) + v111 * fractX
    
    const ii1 = i1 * (1 - fractY) + i2 * fractY
    const ii2 = i3 * (1 - fractY) + i4 * fractY
    
    return (ii1 * (1 - fractZ) + ii2 * fractZ) * 2 - 1
  }
}
