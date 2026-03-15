import { Injectable, ElementRef, DestroyRef } from '@angular/core'
import * as BABYLON from '@babylonjs/core'
import { effect } from '@angular/core'
import { SelectionService } from '../services/selection.service'
import { CellID } from '../../domain/models/cell-id'
import { GoldbergMesh } from '../../domain/geometry/models/geometry-types'
import { CellLookupService, Point3D } from '../../domain/services/cell-lookup.service'
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
  private baseColors: Float32Array | null = null

  // Single material
  private gridMaterial: BABYLON.StandardMaterial | null = null

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
   * Create the grid mesh from generated mesh data
   */
  createGridMesh(meshData: GoldbergMesh, cellLookupService: CellLookupService): void {
    if (!this.scene) {
      throw new Error('Scene not initialized')
    }

    // Dispose of existing grid mesh
    if (this.gridMesh) {
      this.gridMesh.dispose()
    }

    // Create material if needed
    if (!this.gridMaterial) {
      this.gridMaterial = new BABYLON.StandardMaterial('gridMaterial', this.scene)
      this.gridMaterial.specularColor = new BABYLON.Color3(0, 0, 0)
      this.gridMaterial.backFaceCulling = false
    }

    // Create mesh from triangle data
    this.gridMesh = new BABYLON.Mesh('gridMesh', this.scene)

    // Set vertex data
    const vertexData = new BABYLON.VertexData()
    vertexData.indices = Array.from(meshData.indices)
    vertexData.positions = Array.from(meshData.vertices)
    vertexData.normals = Array.from(meshData.normals)

    // Use generated terrain colors
    vertexData.colors = meshData.colors
    this.baseColors = new Float32Array(meshData.colors)

    // applyToMesh(mesh, updatable) -> true for dynamic colors
    vertexData.applyToMesh(this.gridMesh!, true)

    // Setup Mesh
    this.gridMesh!.material = this.gridMaterial
    this.gridMesh!.useVertexColors = true
    this.gridMesh!.isPickable = true
    this.gridMesh!.checkCollisions = false

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
    this.createEdgeLines(meshData.cells.length)

    console.log(`Grid mesh created with ${meshData.triangleToCell.length} triangles`)
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
    this.camera.wheelPrecision = 0.1 // Balanced fast zoom (user requested)
    
    // Decrease rotation speed to account for massive Earth radius
    this.camera.angularSensibilityX = 5000 // Higher number = slower rotation
    this.camera.angularSensibilityY = 5000 

    // Set camera limits to prevent getting too far or too close
    this.camera.lowerRadiusLimit = Icosahedron.EARTH_RADIUS_KM * 1.05 // Closer minimum zoom
    this.camera.upperRadiusLimit = Icosahedron.EARTH_RADIUS_KM * 20  // Much further maximum zoom

    // Increase far plane to prevent disappearing at distance
    this.camera.maxZ = 100000 // Much higher far plane for distant viewing
    this.camera.minZ = 100    // Higher near plane for vastly improved depth buffer precision at scale
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
   * Create edge lines for hexagon/pentagon borders only using LineSystem for massive performance
   */
  private createEdgeLines(cellCount: number): void {
    if (!this.scene || !this.cellLookupService) return

    // Dispose of existing edge lines
    for (const line of this.edgeLines) {
      line.dispose()
    }
    this.edgeLines = []

    console.log(`Creating edge LineSystem for ${cellCount} cells...`)

    const linePaths: BABYLON.Vector3[][] = []
    const LINE_OFFSET = 1.0005 // Push lines outward ~3km to prevent z-fighting with the hex faces

    // Build paths for each cell's outer perimeter
    for (let i = 0; i < cellCount; i++) {
      const vertices = this.cellLookupService.getCellPolygonVertices(i)
      
      const path = vertices.map(v => new BABYLON.Vector3(v.x * LINE_OFFSET, v.y * LINE_OFFSET, v.z * LINE_OFFSET))
      // Close the loop
      path.push(new BABYLON.Vector3(vertices[0].x * LINE_OFFSET, vertices[0].y * LINE_OFFSET, vertices[0].z * LINE_OFFSET))
      
      linePaths.push(path)
    }

    // Create massive batch of lines as a single mesh
    const edgeSystem = BABYLON.MeshBuilder.CreateLineSystem(
      'edgeSystem',
      { lines: linePaths, updatable: false },
      this.scene
    )

    edgeSystem.color = new BABYLON.Color3(0.5, 0.5, 0.5)
    edgeSystem.alpha = 0.5
    edgeSystem.isPickable = false // Don't interfere with picking
    
    this.edgeLines.push(edgeSystem)

    console.log(`Created 1 edge LineSystem containing ${cellCount} closed loops`)
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
   * Update mesh highlighting based on selection state by modifying Vertex Colors directly
   */
  private updateHighlighting(): void {
    if (!this.gridMesh || !this.cellLookupService) return

    const selectedCell = this.selectionService.selectedCell()
    const selectedCells = this.selectionService.selectedCells()
    const hoveredCell = this.selectionService.hoveredCell()

    const colors = this.gridMesh.getVerticesData(BABYLON.VertexBuffer.ColorKind) as Float32Array
    if (!colors) return
    
    const indices = this.gridMesh.getIndices()
    if (!indices) return

    // 1. Reset all triangles to terrain base color
    if (this.baseColors) {
      colors.set(this.baseColors)
    }

    // Helper to color a specific cell
    const applyColorToCell = (cell: CellID, r: number, g: number, b: number) => {
      const triangles = this.cellLookupService!.getTrianglesForCell(cell)
      for (const t of triangles) {
        const i1 = indices[t * 3]
        const i2 = indices[t * 3 + 1]
        const i3 = indices[t * 3 + 2]

        // Vertex 1
        colors[i1 * 4] = r; colors[i1 * 4 + 1] = g; colors[i1 * 4 + 2] = b;
        // Vertex 2
        colors[i2 * 4] = r; colors[i2 * 4 + 1] = g; colors[i2 * 4 + 2] = b;
        // Vertex 3
        colors[i3 * 4] = r; colors[i3 * 4 + 1] = g; colors[i3 * 4 + 2] = b;
      }
    }

    // Apply hover highlighting (Yellow-ish)
    if (hoveredCell && !this.isCellSelected(hoveredCell)) {
      applyColorToCell(hoveredCell, 0.8, 0.8, 0.2)
    }

    // Apply primary selection highlighting (Bright Yellow)
    if (selectedCell) {
      applyColorToCell(selectedCell, 1.0, 1.0, 0.0)
    }

    // Apply multi-selection highlighting (Bright Yellow)
    for (const cell of selectedCells) {
      applyColorToCell(cell, 1.0, 1.0, 0.0)
    }

    // Update the buffer up to the GPU
    this.gridMesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, colors)
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

    if (this.gridMaterial) {
      this.gridMaterial.dispose()
      this.gridMaterial = null
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
