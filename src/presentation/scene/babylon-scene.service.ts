import { Injectable, ElementRef, DestroyRef } from '@angular/core'
import * as BABYLON from '@babylonjs/core'
import { effect } from '@angular/core'
import { SelectionService } from '../services/selection.service'
import { CellID } from '../../domain/models/cell-id'
import { TriangleData } from '../../domain/services/cell-geometry-generator'
import { CellLookupService } from '../../domain/services/cell-lookup.service'
import { Icosahedron } from '../../domain/models/icosahedron'

@Injectable({
  providedIn: 'root'
})
export class BabylonSceneService {
  private engine: BABYLON.Engine | null = null
  private scene: BABYLON.Scene | null = null
  private camera: BABYLON.ArcRotateCamera | null = null
  private gridMesh: BABYLON.Mesh | null = null
  private earthSphere: BABYLON.Mesh | null = null
  private edgeLines: BABYLON.Mesh[] = []
  private cellLookupService: CellLookupService | null = null

  // Materials for highlighting
  private originalMaterial: BABYLON.StandardMaterial | null = null
  private highlightMaterial: BABYLON.StandardMaterial | null = null
  private hoverMaterial: BABYLON.StandardMaterial | null = null
  private multiMaterial: BABYLON.MultiMaterial | null = null

  constructor(
    private selectionService: SelectionService,
    private destroyRef: DestroyRef
  ) {
    // Set up reactive effects
    this.setupSelectionEffects()
  }

  /**
   * Initialize Babylon scene with canvas
   */
  async initializeScene(canvas: HTMLCanvasElement): Promise<void> {
    if (this.engine) return

    // Initialize engine
    this.engine = new BABYLON.Engine(canvas, true)
    this.scene = new BABYLON.Scene(this.engine)

    // Create camera
    this.createCamera(canvas)

    // Create lighting
    this.createLighting()

    // Create earth sphere
    this.createEarthSphere()

    // Setup cleanup on destroy
    this.destroyRef.onDestroy(() => {
      this.dispose()
    })

    // Start render loop
    this.engine.runRenderLoop(() => {
      if (this.scene) {
        this.scene.render()
      }
    })

    // Handle window resize
    window.addEventListener('resize', () => {
      if (this.engine) {
        this.engine.resize()
      }
    })
  }

  /**
   * Create the grid mesh from triangle data
   */
  createGridMesh(triangleData: TriangleData, cellLookupService: CellLookupService): void {
    if (!this.scene) {
      throw new Error('Scene not initialized')
    }

    // Dispose of existing grid mesh
    if (this.gridMesh) {
      this.gridMesh.dispose()
    }

    // Create materials
    this.createMaterials()

    // Create mesh from triangle data
    this.gridMesh = new BABYLON.Mesh('gridMesh', this.scene)
    
    // Set vertex data
    const vertexData = new BABYLON.VertexData()
    vertexData.indices = triangleData.indices
    vertexData.positions = Array.from(triangleData.vertices)
    
    vertexData.applyToMesh(this.gridMesh)

    // Apply multi-material
    this.gridMesh.material = this.multiMaterial

    // Enable picking on the mesh
    this.gridMesh.isPickable = true
    this.gridMesh.checkCollisions = false

    // Create submeshes for each triangle
    this.createSubmeshes(triangleData)

    // Store cell lookup service
    this.cellLookupService = cellLookupService

    // Initialize selection service
    this.selectionService.initialize(cellLookupService)

    // Setup picking
    this.setupPicking()

    // Enable scene-level picking for this mesh
    if (this.scene) {
      this.scene.pointerDownPredicate = (mesh) => mesh === this.gridMesh
      this.scene.pointerUpPredicate = (mesh) => mesh === this.gridMesh
      this.scene.pointerMovePredicate = (mesh) => mesh === this.gridMesh
    }

    // Create edge lines for hexagon borders
    this.createEdgeLines(triangleData)

    console.log(`Grid mesh created with ${triangleData.triangleToCell.length} triangles`)
  }

  /**
   * Create camera
   */
  private createCamera(canvas: HTMLCanvasElement): void {
    if (!this.scene) return

    this.camera = new BABYLON.ArcRotateCamera(
      'camera',
      0,
      Math.PI / 3,
      Icosahedron.EARTH_RADIUS_KM * 1.8, // Closer to Earth surface
      BABYLON.Vector3.Zero(),
      this.scene
    )
    this.camera.attachControl(canvas, true)
    this.camera.wheelPrecision = 50
    
    // Set camera limits to prevent getting too far or too close
    this.camera.lowerRadiusLimit = Icosahedron.EARTH_RADIUS_KM * 1.1 // Minimum zoom
    this.camera.upperRadiusLimit = Icosahedron.EARTH_RADIUS_KM * 5   // Maximum zoom
  }

  /**
   * Create lighting
   */
  private createLighting(): void {
    if (!this.scene) return

    const light1 = new BABYLON.HemisphericLight(
      'light1',
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    )
    light1.intensity = 0.7

    const light2 = new BABYLON.DirectionalLight(
      'light2',
      new BABYLON.Vector3(-1, -2, -1),
      this.scene
    )
    light2.intensity = 0.3
  }

  /**
   * Create edge lines for hexagon borders
   */
  private createEdgeLines(triangleData: TriangleData): void {
    if (!this.scene) return

    // Dispose of existing edge lines
    for (const line of this.edgeLines) {
      line.dispose()
    }
    this.edgeLines = []

    // Create line material with better visibility
    const lineMaterial = new BABYLON.StandardMaterial('edgeMaterial', this.scene)
    lineMaterial.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.8)
    lineMaterial.emissiveColor = new BABYLON.Color3(0.5, 0.5, 0.5)
    lineMaterial.disableLighting = true
    lineMaterial.alpha = 1.0

    // Collect unique edges from all triangles
    const edges = new Map<string, { start: number[], end: number[] }>()
    
    for (let i = 0; i < triangleData.indices.length; i += 3) {
      const v1 = triangleData.indices[i] * 3
      const v2 = triangleData.indices[i + 1] * 3
      const v3 = triangleData.indices[i + 2] * 3
      
      // Create edges for this triangle
      this.addEdge(edges, v1, v2)
      this.addEdge(edges, v2, v3)
      this.addEdge(edges, v3, v1)
    }

    console.log(`Creating ${edges.size} edge lines for hexagon borders`)

    // Create lines mesh using individual lines
    for (const edge of edges.values()) {
      const startPos = new BABYLON.Vector3(
        triangleData.vertices[edge.start[0]],
        triangleData.vertices[edge.start[1]], 
        triangleData.vertices[edge.start[2]]
      )
      const endPos = new BABYLON.Vector3(
        triangleData.vertices[edge.end[0]],
        triangleData.vertices[edge.end[1]], 
        triangleData.vertices[edge.end[2]]
      )
      
      // Create lines with increased thickness for visibility
      const line = BABYLON.MeshBuilder.CreateLines(
        `edge_${edge.start[0]}_${edge.start[1]}`,
        { 
          points: [startPos, endPos],
          updatable: false,
          useVertexAlpha: false
        },
        this.scene
      )
      
      // Make lines more visible
      line.color = new BABYLON.Color3(0.8, 0.8, 0.8)
      line.alpha = 1.0
      line.isPickable = false // Don't interfere with picking
      
      // Apply material
      line.material = lineMaterial
      
      this.edgeLines.push(line)
    }
    
    console.log(`Created ${this.edgeLines.length} edge lines`)
  }

  /**
   * Add edge to the edge map (avoiding duplicates)
   */
  private addEdge(edges: Map<string, { start: number[], end: number[] }>, v1: number, v2: number): void {
    const key1 = `${v1}-${v2}`
    const key2 = `${v2}-${v1}`
    
    if (!edges.has(key1) && !edges.has(key2)) {
      edges.set(key1, { start: [v1, v1 + 1, v1 + 2], end: [v2, v2 + 1, v2 + 2] })
    }
  }
  private createEarthSphere(): void {
    if (!this.scene) return

    this.earthSphere = BABYLON.MeshBuilder.CreateSphere(
      'earthSphere',
      { diameter: Icosahedron.EARTH_RADIUS_KM * 2 * 0.95 }, // Slightly smaller than grid
      this.scene
    )

    const earthMaterial = new BABYLON.StandardMaterial('earthMaterial', this.scene)
    earthMaterial.diffuseColor = new BABYLON.Color3(0.1, 0.3, 0.6)
    earthMaterial.specularColor = new BABYLON.Color3(0, 0, 0)
    earthMaterial.alpha = 0.3

    this.earthSphere.material = earthMaterial
    this.earthSphere.renderingGroupId = 0
  }

  /**
   * Create materials for highlighting
   */
  private createMaterials(): void {
    if (!this.scene) return

    this.originalMaterial = new BABYLON.StandardMaterial('originalMaterial', this.scene)
    this.originalMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.4, 0.8)
    this.originalMaterial.specularColor = new BABYLON.Color3(0, 0, 0)
    this.originalMaterial.backFaceCulling = false

    this.highlightMaterial = new BABYLON.StandardMaterial('highlightMaterial', this.scene)
    this.highlightMaterial.diffuseColor = new BABYLON.Color3(1, 1, 0)
    this.highlightMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0)
    this.highlightMaterial.backFaceCulling = false

    this.hoverMaterial = new BABYLON.StandardMaterial('hoverMaterial', this.scene)
    this.hoverMaterial.diffuseColor = new BABYLON.Color3(0.8, 0.8, 0.2)
    this.hoverMaterial.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0)
    this.hoverMaterial.backFaceCulling = false

    this.multiMaterial = new BABYLON.MultiMaterial('gridMultiMaterial', this.scene)
    this.multiMaterial.subMaterials.push(this.originalMaterial)
    this.multiMaterial.subMaterials.push(this.highlightMaterial)
    this.multiMaterial.subMaterials.push(this.hoverMaterial)
  }

  /**
   * Create submeshes for each triangle
   */
  private createSubmeshes(triangleData: TriangleData): void {
    if (!this.gridMesh) return

    this.gridMesh.subMeshes = []
    const triangleCount = triangleData.triangleToCell.length

    for (let i = 0; i < triangleCount; i++) {
      const startIndex = i * 3
      const indexCount = 3
      const materialIndex = 0 // Start with original material

      new BABYLON.SubMesh(materialIndex, 0, triangleCount, startIndex, indexCount, this.gridMesh)
    }
  }

  /**
   * Setup picking interactions
   */
  private setupPicking(): void {
    if (!this.scene || !this.gridMesh) return

    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERPICK && 
          pointerInfo.pickInfo?.hit && 
          pointerInfo.pickInfo.faceId !== undefined) {
        
        const faceId = pointerInfo.pickInfo.faceId
        console.log(`Pointer pick hit faceId: ${faceId}`)
        
        if (pointerInfo.event.button === 0) { // Left click
          console.log('Left click - selecting cell')
          this.selectionService.selectCellByTriangle(faceId)
        }
      } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
        // Handle hover
        if (pointerInfo.pickInfo?.hit && pointerInfo.pickInfo.faceId !== undefined) {
          console.log(`Hover faceId: ${pointerInfo.pickInfo.faceId}`)
          this.selectionService.setHoveredByTriangle(pointerInfo.pickInfo.faceId)
        } else {
          console.log('Hover cleared')
          this.selectionService.clearHover()
        }
      }
    })
  }

  /**
   * Setup reactive effects for selection changes
   */
  private setupSelectionEffects(): void {
    // Effect for single selection
    effect(() => {
      const selectedCell = this.selectionService.selectedCell()
      this.updateHighlighting()
    })

    // Effect for multi-selection
    effect(() => {
      const selectedCells = this.selectionService.selectedCells()
      this.updateHighlighting()
    })

    // Effect for hover
    effect(() => {
      const hoveredCell = this.selectionService.hoveredCell()
      this.updateHighlighting()
    })
  }

  /**
   * Update mesh highlighting based on selection state
   */
  private updateHighlighting(): void {
    if (!this.gridMesh || !this.cellLookupService) return

    const selectedCell = this.selectionService.selectedCell()
    const selectedCells = this.selectionService.selectedCells()
    const hoveredCell = this.selectionService.hoveredCell()

    console.log('Updating highlighting:', { selectedCell, selectedCells: selectedCells.length, hoveredCell })

    // Reset all triangles to original material
    for (let i = 0; i < this.gridMesh.subMeshes.length; i++) {
      this.gridMesh.subMeshes[i].materialIndex = 0
    }

    // Apply hover highlighting
    if (hoveredCell && !this.isCellSelected(hoveredCell)) {
      const triangles = this.cellLookupService.getTrianglesForCell(hoveredCell)
      console.log(`Hovering cell, triangles:`, triangles)
      for (const triangle of triangles) {
        if (triangle < this.gridMesh.subMeshes.length) {
          this.gridMesh.subMeshes[triangle].materialIndex = 2 // Hover material
        }
      }
    }

    // Apply selection highlighting
    if (selectedCell) {
      const triangles = this.cellLookupService.getTrianglesForCell(selectedCell)
      console.log(`Selected single cell, triangles:`, triangles)
      for (const triangle of triangles) {
        if (triangle < this.gridMesh.subMeshes.length) {
          this.gridMesh.subMeshes[triangle].materialIndex = 1 // Highlight material
        }
      }
    }

    // Apply multi-selection highlighting
    for (const cell of selectedCells) {
      const triangles = this.cellLookupService.getTrianglesForCell(cell)
      console.log(`Selected multi cell, triangles:`, triangles)
      for (const triangle of triangles) {
        if (triangle < this.gridMesh.subMeshes.length) {
          this.gridMesh.subMeshes[triangle].materialIndex = 1 // Highlight material
        }
      }
    }

    // Refresh mesh
    this.gridMesh.refreshBoundingInfo()
  }

  /**
   * Check if a cell is currently selected
   */
  private isCellSelected(cell: CellID): boolean {
    const selectedCell = this.selectionService.selectedCell()
    const selectedCells = this.selectionService.selectedCells()

    if (selectedCell) {
      return selectedCell.face === cell.face && 
             selectedCell.q === cell.q && 
             selectedCell.r === cell.r
    }

    return selectedCells.some(c => 
      c.face === cell.face && 
      c.q === cell.q && 
      c.r === cell.r
    )
  }

  /**
   * Dispose of all Babylon resources
   */
  dispose(): void {
    if (this.gridMesh) {
      this.gridMesh.dispose()
      this.gridMesh = null
    }
    
    if (this.earthSphere) {
      this.earthSphere.dispose()
      this.earthSphere = null
    }
    
    if (this.edgeLines) {
      for (const line of this.edgeLines) {
        line.dispose()
      }
      this.edgeLines = []
    }
    
    if (this.originalMaterial) {
      this.originalMaterial.dispose()
      this.originalMaterial = null
    }
    
    if (this.highlightMaterial) {
      this.highlightMaterial.dispose()
      this.highlightMaterial = null
    }
    
    if (this.hoverMaterial) {
      this.hoverMaterial.dispose()
      this.hoverMaterial = null
    }
    
    if (this.multiMaterial) {
      this.multiMaterial.dispose()
      this.multiMaterial = null
    }
    
    if (this.scene) {
      this.scene.dispose()
      this.scene = null
    }
    
    if (this.engine) {
      this.engine.dispose()
      this.engine = null
    }
  }
}
