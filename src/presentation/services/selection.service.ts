import { Injectable, signal, computed, effect } from '@angular/core'
import { CellID } from '../../domain/models/cell-id'
import { CellLookupService } from '../../domain/services/cell-lookup.service'

@Injectable({
  providedIn: 'root'
})
export class SelectionService {
  // Signals for reactive state management
  readonly selectedCell = signal<CellID | null>(null)
  readonly hoveredCell = signal<CellID | null>(null)
  readonly isSelected = computed(() => this.selectedCell() !== null)
  readonly isHovered = computed(() => this.hoveredCell() !== null)

  // Multi-selection support
  readonly selectedCells = signal<CellID[]>([])
  readonly selectionMode = signal<'single' | 'multi'>('single')

  private cellLookupService: CellLookupService | null = null

  constructor() {
    // Effect to handle single/multi selection mode changes
    effect(() => {
      const mode = this.selectionMode()
      if (mode === 'single') {
        // Clear multi-selection when switching to single mode
        this.selectedCells.set([])
      }
    })
  }

  /**
   * Initialize with cell lookup service
   */
  initialize(cellLookupService: CellLookupService): void {
    this.cellLookupService = cellLookupService
  }

  /**
   * Select a cell (handles both single and multi-selection modes)
   */
  selectCell(cell: CellID): void {
    const mode = this.selectionMode()
    
    if (mode === 'single') {
      this.selectedCell.set(cell)
    } else {
      // Multi-selection mode
      const current = this.selectedCells()
      const isAlreadySelected = current.some(c => 
        c.face === cell.face && c.q === cell.q && c.r === cell.r
      )
      
      if (isAlreadySelected) {
        // Deselect if already selected
        this.selectedCells.set(current.filter(c => 
          !(c.face === cell.face && c.q === cell.q && c.r === cell.r)
        ))
      } else {
        // Add to selection
        this.selectedCells.set([...current, cell])
      }
    }
  }

  /**
   * Select cell by triangle index (for picking)
   */
  selectCellByTriangle(triangleIndex: number): boolean {
    if (!this.cellLookupService) {
      console.error('SelectionService not initialized with CellLookupService')
      return false
    }

    const cell = this.cellLookupService.getCellFromTriangle(triangleIndex)
    if (cell) {
      this.selectCell(cell)
      return true
    }

    return false
  }

  /**
   * Deselect current selection(s)
   */
  deselect(): void {
    this.selectedCell.set(null)
    this.selectedCells.set([])
  }

  /**
   * Deselect a specific cell
   */
  deselectCell(cell: CellID): void {
    const mode = this.selectionMode()
    
    if (mode === 'single') {
      if (this.selectedCell()) {
        const current = this.selectedCell()!
        if (current.face === cell.face && current.q === cell.q && current.r === cell.r) {
          this.selectedCell.set(null)
        }
      }
    } else {
      const current = this.selectedCells()
      this.selectedCells.set(current.filter(c => 
        !(c.face === cell.face && c.q === cell.q && c.r === cell.r)
      ))
    }
  }

  /**
   * Set hover state
   */
  setHoveredCell(cell: CellID | null): void {
    this.hoveredCell.set(cell)
  }

  /**
   * Set hover by triangle index
   */
  setHoveredByTriangle(triangleIndex: number): boolean {
    if (!this.cellLookupService) {
      return false
    }

    const cell = this.cellLookupService.getCellFromTriangle(triangleIndex)
    if (cell) {
      this.setHoveredCell(cell)
      return true
    }

    this.setHoveredCell(null)
    return false
  }

  /**
   * Clear hover state
   */
  clearHover(): void {
    this.hoveredCell.set(null)
  }

  /**
   * Check if a cell is selected
   */
  isCellSelected(cell: CellID): boolean {
    const mode = this.selectionMode()
    
    if (mode === 'single') {
      const selected = this.selectedCell()
      return selected !== null && 
             selected.face === cell.face && 
             selected.q === cell.q && 
             selected.r === cell.r
    } else {
      return this.selectedCells().some(c => 
        c.face === cell.face && c.q === cell.q && c.r === cell.r
      )
    }
  }

  /**
   * Check if a cell is hovered
   */
  isCellHovered(cell: CellID): boolean {
    const hovered = this.hoveredCell()
    return hovered !== null && 
           hovered.face === cell.face && 
           hovered.q === cell.q && 
           hovered.r === cell.r
  }

  /**
   * Get selection state for a cell
   */
  getCellState(cell: CellID): 'selected' | 'hovered' | 'normal' {
    if (this.isCellSelected(cell)) return 'selected'
    if (this.isCellHovered(cell)) return 'hovered'
    return 'normal'
  }

  /**
   * Get all selected cells (works for both single and multi mode)
   */
  getAllSelectedCells(): CellID[] {
    const mode = this.selectionMode()
    
    if (mode === 'single') {
      const selected = this.selectedCell()
      return selected ? [selected] : []
    } else {
      return this.selectedCells()
    }
  }

  /**
   * Get selection count
   */
  getSelectionCount(): number {
    const mode = this.selectionMode()
    
    if (mode === 'single') {
      return this.selectedCell() ? 1 : 0
    } else {
      return this.selectedCells().length
    }
  }

  /**
   * Clear all selection and hover states
   */
  clearAll(): void {
    this.selectedCell.set(null)
    this.selectedCells.set([])
    this.hoveredCell.set(null)
  }

  /**
   * Toggle selection mode
   */
  toggleSelectionMode(): void {
    const current = this.selectionMode()
    this.selectionMode.set(current === 'single' ? 'multi' : 'single')
  }

  /**
   * Get current selection mode
   */
  getSelectionMode(): 'single' | 'multi' {
    return this.selectionMode()
  }
}
