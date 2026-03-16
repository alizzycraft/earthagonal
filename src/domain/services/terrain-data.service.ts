import { Injectable } from '@angular/core'

@Injectable({
  providedIn: 'root'
})
export class TerrainDataService {
  private data: Uint8ClampedArray | null = null
  private width: number = 0
  private height: number = 0
  private readyPromise: Promise<void>

  constructor() {
    this.readyPromise = this.loadHeightmap('assets/data/height-combined.png')
  }

  /**
   * Ensures the heightmap is loaded and ready for sampling
   */
  async ensureReady(): Promise<void> {
    return this.readyPromise
  }

  /**
   * Samples terrain data at normalized UV coordinates (0-1)
   * Returns { landMask, elevation, oceanDepth }
   */
  sample(u: number, v: number): { landMask: number, elevation: number, oceanDepth: number } {
    if (!this.data) return { landMask: 0, elevation: 0, oceanDepth: 0 }

    // Longitude wrapping (U coordinate)
    u = ((u % 1) + 1) % 1
    
    // Latitude clamping (V coordinate)
    v = Math.max(0, Math.min(1, v))

    const x = u * (this.width - 1)
    const y = v * (this.height - 1)
    
    const x1 = Math.floor(x)
    const y1 = Math.floor(y)
    const x2 = (x1 + 1) % this.width
    const y2 = Math.min(y1 + 1, this.height - 1)
    
    const fx = x - x1
    const fy = y - y1
    
    const s11 = this.getPixel(x1, y1)
    const s21 = this.getPixel(x2, y1)
    const s12 = this.getPixel(x1, y2)
    const s22 = this.getPixel(x2, y2)
    
    return {
      landMask: this.lerpBilinear(s11.r, s21.r, s12.r, s22.r, fx, fy),
      elevation: this.lerpBilinear(s11.g, s21.g, s12.g, s22.g, fx, fy) * (9000 / 255),
      oceanDepth: this.lerpBilinear(s11.b, s21.b, s12.b, s22.b, fx, fy) * (11000 / 255)
    }
  }

  /**
   * Legacy method for compatibility with existing procedural-only calls
   */
  sampleNormalized(u: number, v: number): number {
    const s = this.sample(u, v)
    return s.landMask > 127 ? s.elevation : -s.oceanDepth
  }

  private getPixel(x: number, y: number): { r: number, g: number, b: number } {
    if (!this.data) return { r: 0, g: 0, b: 0 }
    const idx = (y * this.width + x) * 4
    return {
      r: this.data[idx],
      g: this.data[idx + 1],
      b: this.data[idx + 2]
    }
  }

  private lerpBilinear(v11: number, v21: number, v12: number, v22: number, fx: number, fy: number): number {
    const r1 = v11 * (1 - fx) + v21 * fx
    const r2 = v12 * (1 - fx) + v22 * fx
    return r1 * (1 - fy) + r2 * fy
  }

  private loadHeightmap(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        this.width = img.width
        this.height = img.height
        const canvas = document.createElement('canvas')
        canvas.width = this.width
        canvas.height = this.height
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) {
          reject(new Error('Could not get canvas context'))
          return
        }
        ctx.drawImage(img, 0, 0)
        this.data = ctx.getImageData(0, 0, this.width, this.height).data
        resolve()
      }
      img.onerror = () => reject(new Error(`Failed to load heightmap: ${url}`))
      img.src = url
    })
  }
}

