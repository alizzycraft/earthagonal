import { Injectable } from '@angular/core'
import { Calibration, CalibrationData, createDefaultCalibration, createCalibrationData, validateCalibration } from '../../domain/models/calibration'

@Injectable({
  providedIn: 'root'
})
export class CalibrationService {
  private calibration: Calibration = createDefaultCalibration()
  private readonly CALIBRATION_KEY = 'earthagonal-calibration'

  constructor() {
    this.loadCalibration()
  }

  /**
   * Get current calibration settings
   */
  getCalibration(): Calibration {
    return { ...this.calibration } // Return copy to prevent mutation
  }

  /**
   * Set new calibration settings
   */
  setCalibration(calibration: Calibration): boolean {
    if (!validateCalibration(calibration)) {
      console.error('Invalid calibration data:', calibration)
      return false
    }

    this.calibration = { ...calibration }
    this.saveCalibration()
    return true
  }

  /**
   * Reset to default calibration (identity quaternion)
   */
  resetToDefault(): void {
    this.calibration = createDefaultCalibration()
    this.saveCalibration()
  }

  /**
   * Apply calibration rotation to a point
   */
  applyCalibration(point: { x: number, y: number, z: number }): { x: number, y: number, z: number } {
    const [w, x, y, z] = this.calibration.rotation

    // Quaternion rotation formula: p' = q * p * q^-1
    // For pure rotation (unit quaternion), q^-1 = [w, -x, -y, -z]
    
    const result = {
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

    return result
  }

  /**
   * Load calibration from localStorage
   */
  private loadCalibration(): void {
    try {
      const stored = localStorage.getItem(this.CALIBRATION_KEY)
      if (stored) {
        const data: CalibrationData = JSON.parse(stored)
        if (validateCalibration(data.calibration)) {
          this.calibration = data.calibration
          console.log('Loaded calibration from storage:', this.calibration)
        } else {
          console.warn('Invalid calibration in storage, using default')
          this.resetToDefault()
        }
      }
    } catch (error) {
      console.error('Failed to load calibration:', error)
      this.resetToDefault()
    }
  }

  /**
   * Save calibration to localStorage
   */
  private saveCalibration(): void {
    try {
      const data = createCalibrationData(this.calibration)
      localStorage.setItem(this.CALIBRATION_KEY, JSON.stringify(data))
      console.log('Saved calibration to storage:', this.calibration)
    } catch (error) {
      console.error('Failed to save calibration:', error)
    }
  }

  /**
   * Export calibration data as JSON string
   */
  exportCalibration(): string {
    const data = createCalibrationData(this.calibration)
    return JSON.stringify(data, null, 2)
  }

  /**
   * Import calibration from JSON string
   */
  importCalibration(jsonString: string): boolean {
    try {
      const data: CalibrationData = JSON.parse(jsonString)
      if (validateCalibration(data.calibration)) {
        this.setCalibration(data.calibration)
        console.log('Imported calibration:', this.calibration)
        return true
      } else {
        console.error('Invalid calibration data in import')
        return false
      }
    } catch (error) {
      console.error('Failed to import calibration:', error)
      return false
    }
  }
}
