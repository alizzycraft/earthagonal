export interface Calibration {
  rotation: [number, number, number, number] // Quaternion [w, x, y, z]
}

export interface CalibrationData {
  version: string
  calibration: Calibration
  timestamp: number
}

export function createDefaultCalibration(): Calibration {
  return {
    rotation: [1, 0, 0, 0] // Identity quaternion
  }
}

export function createCalibrationData(calibration: Calibration): CalibrationData {
  return {
    version: "1.0",
    calibration,
    timestamp: Date.now()
  }
}

export function validateCalibration(calibration: Calibration): boolean {
  if (!Array.isArray(calibration.rotation) || calibration.rotation.length !== 4) {
    return false
  }

  const [w, x, y, z] = calibration.rotation
  
  // Check if all values are numbers
  if (typeof w !== 'number' || typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') {
    return false
  }

  // Check if quaternion is approximately normalized (length should be 1)
  const length = Math.sqrt(w * w + x * x + y * y + z * z)
  return Math.abs(length - 1.0) < 0.001 // Allow small tolerance
}
