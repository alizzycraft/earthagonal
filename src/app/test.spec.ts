import { TestBed } from '@angular/core/testing'
import { GoldbergGridService } from '../domain/services/goldberg-grid.service'
import { FaceRepository } from '../infrastructure/repositories/face.repository'
import { CalibrationService } from '../infrastructure/services/calibration.service'
import { HexGridMath } from '../domain/utils/hex-grid-math'
import { CellID } from '../domain/models/cell-id'

describe('Earthagonal Implementation Tests', () => {
  let gridService: GoldbergGridService
  let faceRepository: FaceRepository
  let calibrationService: CalibrationService

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        GoldbergGridService,
        FaceRepository,
        CalibrationService
      ]
    })
    
    gridService = TestBed.inject(GoldbergGridService)
    faceRepository = TestBed.inject(FaceRepository)
    calibrationService = TestBed.inject(CalibrationService)
  })

  describe('Grid Core', () => {
    it('should generate correct cell count for resolution 2', () => {
      const expectedCount = HexGridMath.getCellCount(2)
      expect(expectedCount).toBe(42) // 10*2^2 + 2
    })

    it('should generate correct cell count for resolution 8', () => {
      const expectedCount = HexGridMath.getCellCount(8)
      expect(expectedCount).toBe(642) // 10*8^2 + 2
    })

    it('should identify pentagon positions correctly', () => {
      const pentagonCell: CellID = { face: 0, q: 0, r: 0, resolution: 8 }
      const hexCell: CellID = { face: 0, q: 1, r: 1, resolution: 8 }
      
      expect(HexGridMath.isPentagon(pentagonCell)).toBe(true)
      expect(HexGridMath.isPentagon(hexCell)).toBe(false)
    })

    it('should calculate distance correctly within same face', () => {
      const cell1: CellID = { face: 0, q: 0, r: 0, resolution: 8 }
      const cell2: CellID = { face: 0, q: 1, r: 0, resolution: 8 }
      
      const distance = HexGridMath.distance(cell1, cell2)
      expect(distance).toBe(1)
    })
  })

  describe('Calibration System', () => {
    it('should have default calibration as identity quaternion', () => {
      const calibration = calibrationService.getCalibration()
      expect(calibration.rotation).toEqual([1, 0, 0, 0])
    })

    it('should validate calibration correctly', () => {
      const validCalibration: { rotation: [number, number, number, number] } = { rotation: [1, 0, 0, 0] }
      const invalidCalibration: { rotation: [number, number, number, number] } = { rotation: [2, 0, 0, 0] } // Not normalized
      
      expect(calibrationService.setCalibration(validCalibration)).toBe(true)
      expect(calibrationService.setCalibration(invalidCalibration)).toBe(false)
    })

    it('should apply calibration rotation to point', () => {
      const point = { x: 1, y: 0, z: 0 }
      const rotatedPoint = calibrationService.applyCalibration(point)
      
      // With identity quaternion, point should remain unchanged
      expect(rotatedPoint).toEqual(point)
    })
  })

  describe('Grid Service Integration', () => {
    it('should initialize grid successfully', async () => {
      await gridService.initializeGrid(4)
      expect(gridService.isReady()).toBe(true)
    })

    it('should generate correct statistics', async () => {
      await gridService.initializeGrid(4)
      const stats = gridService.getStatistics()
      
      expect(stats.totalCells).toBe(162) // 10*4^2 + 2
      expect(stats.resolution).toBe(4)
      expect(stats.pentagonCount).toBe(12)
    })
  })

  describe('Face Repository', () => {
    it('should load metadata from JSON', () => {
      const metadata = faceRepository.getMetadata({ face: 0, q: 0, r: 0, resolution: 8 })
      expect(metadata).toBeDefined()
      expect(metadata?.name).toBe('North Pole Cell')
    })

    it('should return null for non-existent cell', () => {
      const metadata = faceRepository.getMetadata({ face: 99, q: 0, r: 0, resolution: 8 })
      expect(metadata).toBeNull()
    })
  })
})
