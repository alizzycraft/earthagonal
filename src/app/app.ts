import { Component, effect, ElementRef, inject, ViewChild, OnInit, DestroyRef } from '@angular/core'
import { BabylonSceneService } from '../presentation/scene/babylon-scene.service'
import { GoldbergGridService } from '../domain/services/goldberg-grid.service'
import { SelectionService } from '../presentation/services/selection.service'
import { FaceRepository } from '../infrastructure/repositories/face.repository'
import { CalibrationService } from '../infrastructure/services/calibration.service'
import { CellID } from '../domain/models/cell-id'
import { CellHudComponent } from './cell-hud.component'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CellHudComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  @ViewChild('babylonCanvas', { static: true }) 
  canvas!: ElementRef<HTMLCanvasElement>

  private isInitialized = false
  private error: string | null = null

  constructor(
    private babylonScene: BabylonSceneService,
    private gridService: GoldbergGridService,
    public selectionService: SelectionService,
    private faceRepository: FaceRepository,
    private calibrationService: CalibrationService,
    private destroyRef: DestroyRef
  ) {
    // Set up reactive effects
    effect(() => {
      if (this.selectionService.selectedCell()) {
        this.logSelection()
      }
    })

    // Cleanup on destroy
    destroyRef.onDestroy(() => {
      this.dispose()
    })
  }

  async ngOnInit(): Promise<void> {
    try {
      console.log('Initializing Earthagonal with deterministic grid architecture...')
      
      // Initialize Babylon scene
      console.log('Step 1: Initializing Babylon scene...')
      await this.babylonScene.initializeScene(this.canvas.nativeElement)
      
      // Initialize Goldberg grid
      console.log('Step 2: Initializing Goldberg grid...')
      await this.gridService.initializeGrid(16) // Resolution 16 (2,562 faces)
      
      // Create mesh from optimization data
      console.log('Step 3: Getting generation data...')
      const meshData = this.gridService.getMeshData()
      const cellLookupService = this.gridService.getCellLookupService()
      
      console.log('Step 4: Generation data:', meshData ? 'found' : 'missing')
      console.log('Step 5: Cell lookup service:', cellLookupService ? 'found' : 'missing')
      
      if (meshData && cellLookupService) {
        console.log('Step 6: Creating grid mesh...')
        this.babylonScene.createGridMesh(meshData, cellLookupService)
        this.isInitialized = true
        
        // Log statistics
        const stats = this.gridService.getStatistics()
        console.log('Grid initialized successfully:', stats)
      } else {
        console.error('Failed to generate triangle data')
        throw new Error('Failed to generate triangle data')
      }
      
    } catch (error) {
      console.error('Failed to initialize Earthagonal:', error)
      this.error = error instanceof Error ? error.message : 'Unknown error'
    }
  }

  ngOnDestroy(): void {
    this.dispose()
  }

  private dispose(): void {
    this.babylonScene.dispose()
    this.gridService.dispose()
  }

  private logSelection(): void {
    const selectedCell = this.selectionService.selectedCell()
    if (!selectedCell) return
    
    console.log(`Selected cell:`, selectedCell)
    
    // Cell metadata fetching
    const metadata = this.faceRepository.getMetadata(selectedCell)
    if (metadata) {
      console.log('Cell metadata:', metadata)
    } else {
      console.log('No metadata found for this cell')
    }
  }

  // Public API for external components
  getSelectedCell(): CellID | null {
    return this.selectionService.selectedCell()
  }
  
  getSelectedCells(): CellID[] {
    return this.selectionService.getAllSelectedCells()
  }
  
  isGridReady(): boolean {
    return this.isInitialized && this.gridService.isReady()
  }
  
  getError(): string | null {
    return this.error
  }
  
  getGridStatistics() {
    if (this.isGridReady()) {
      return this.gridService.getStatistics()
    }
    return null
  }

  // Calibration API
  getCalibration() {
    return this.calibrationService.getCalibration()
  }

  setCalibration(rotation: [number, number, number, number]): boolean {
    return this.calibrationService.setCalibration({ rotation })
  }

  resetCalibration(): void {
    this.calibrationService.resetToDefault()
  }

  exportCalibration(): string {
    return this.calibrationService.exportCalibration()
  }

  importCalibration(jsonString: string): boolean {
    return this.calibrationService.importCalibration(jsonString)
  }
}
