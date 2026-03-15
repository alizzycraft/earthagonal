import { TestBed } from '@angular/core/testing'
import { GoldbergGeneratorService } from '../domain/services/goldberg-generator.service'
import { GoldbergGridService } from '../domain/services/goldberg-grid.service'
import { FaceRepository } from '../infrastructure/repositories/face.repository'
import { CalibrationService } from '../infrastructure/services/calibration.service'
import { GeodesicGrid } from '../domain/geometry/geodesic-grid'

describe('Optimized Earthagonal Implementation Tests', () => {
  let generatorService: GoldbergGeneratorService
  let gridService: GoldbergGridService
  let faceRepository: FaceRepository
  let calibrationService: CalibrationService

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        GoldbergGeneratorService,
        GoldbergGridService,
        FaceRepository,
        CalibrationService
      ]
    })
    
    generatorService = TestBed.inject(GoldbergGeneratorService)
    gridService = TestBed.inject(GoldbergGridService)
    faceRepository = TestBed.inject(FaceRepository)
    calibrationService = TestBed.inject(CalibrationService)
  })

  // Test 1: Geodesic Topology
  describe('§11.1 Geodesic Topology', () => {
    it('should generate correct Euler characteristic for geodesic grid (n=5)', () => {
      const n = 5
      const mesh = GeodesicGrid.generate(n)
      
      const V = mesh.vertexCount
      const F = mesh.triangleCount // Number of triangles
      // By Euler characteristic for sphere: V - E + F = 2 => E = V + F - 2
      // Since it's a triangle mesh, 3*F = 2*E
      // Let's verify: 3*F / 2 should equal V + F - 2
      const E = (3 * F) / 2
      
      expect(V - E + F).toBe(2)
      
      // Also verify exact structural counts for Geodesic grid n=5:
      // A geodesic grid with frequency n has 10n^2 + 2 vertices.
      expect(V).toBe(10 * n * n + 2)
      // And 20n^2 faces
      expect(F).toBe(20 * n * n)
    })
  })

  // Test 2: Goldberg Cell Count
  describe('§11.2 Goldberg Cell Count', () => {
    it('should generate correct cell counts for n=3, 5, 8', () => {
      const testCases = [3, 5, 8]
      
      for (const n of testCases) {
        const mesh = generatorService.generateSphere(n)
        const expectedCount = 10 * n * n + 2
        
        expect(mesh.cells.length).toBe(expectedCount)
      }
    })
  })

  // Test 3: Cell Types
  describe('§11.3 Cell Types', () => {
    it('should generate exactly 12 pentagons and the rest hexagons for n=5', () => {
      const n = 5
      const mesh = generatorService.generateSphere(n)
      
      let pentagons = 0
      let hexagons = 0
      let others = 0
      
      for (const cell of mesh.cells) {
        // Validation check for domain logic marking
        if (cell.isPentagon) {
          expect(cell.vertexIndices.length).toBe(5)
          pentagons++
        } else if (cell.vertexIndices.length === 6) {
          hexagons++
        } else {
          others++
        }
      }
      
      expect(pentagons).toBe(12)
      const expectedTotal = 10 * n * n + 2
      expect(hexagons).toBe(expectedTotal - 12)
      expect(others).toBe(0)
    })
  })

  // Test 4: Neighbor Count
  describe('§11.4 Neighbor Count', () => {
    it('should have 5 neighbors for pentagons and 6 neighbors for hexagons', () => {
      const mesh = generatorService.generateSphere(4) // Test with n=4
      
      for (const cell of mesh.cells) {
        if (cell.isPentagon) {
          expect(cell.neighborIndices.length).toBe(5)
        } else {
          expect(cell.neighborIndices.length).toBe(6)
        }
      }
    })
  })

  describe('Grid Service Integration', () => {
    it('should initialize grid successfully with n=4', async () => {
      await gridService.initializeGrid(4)
      expect(gridService.isReady()).toBe(true)
    })

    it('should generate correct statistics', async () => {
      await gridService.initializeGrid(4)
      const stats = gridService.getStatistics()
      
      expect(stats.totalCells).toBe(162) // 10*4^2 + 2
      expect(stats.resolution).toBe(4)
      expect(stats.pentagonCount).toBe(12)
      expect(stats.hexagonCount).toBe(150)
    })
  })
})
