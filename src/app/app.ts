import { Component, effect, ElementRef, inject, ViewChild } from '@angular/core';
import * as BABYLON from '@babylonjs/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  @ViewChild('babylonCanvas', { static: true }) 
  canvas!: ElementRef<HTMLCanvasElement>;

  private engine: BABYLON.Engine | null = null;
  private scene: BABYLON.Scene | null = null;
  private goldbergMesh: BABYLON.Mesh | null = null;
  private selectedFaceIndex: number | null = null;
  private originalMaterial: BABYLON.StandardMaterial | null = null;
  private highlightMaterial: BABYLON.StandardMaterial | null = null;
  private multiMaterial: BABYLON.MultiMaterial | null = null;
  private faceToSubmeshes: Map<number, number[]> = new Map(); // Maps logical face to submesh indices

  constructor() {
    effect(() => {
      this.initBabylonScene();
    });
  }

  private initBabylonScene(): void {
    if (!this.canvas || this.engine) return;

    // Initialize Babylon.js engine
    this.engine = new BABYLON.Engine(this.canvas.nativeElement, true);
    
    // Create a basic scene
    this.scene = new BABYLON.Scene(this.engine);

    // Create the Goldberg polyhedron GP(16,0) mesh
    const goldbergMesh = BABYLON.MeshBuilder.CreateGoldberg(
      'goldbergGP16_0',
      { 
        m: 16, 
        n: 0, 
        size: 2,  // Adjust size for better visualization
        updatable: true 
      },
      this.scene
    );

    // Create materials for multi-material system
    this.originalMaterial = new BABYLON.StandardMaterial('goldbergMaterial', this.scene);
    this.originalMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.4, 0.8);
    this.originalMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
    this.originalMaterial.backFaceCulling = false;
    
    this.highlightMaterial = new BABYLON.StandardMaterial('highlightMaterial', this.scene);
    this.highlightMaterial.diffuseColor = new BABYLON.Color3(1, 1, 0);
    this.highlightMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0);
    this.highlightMaterial.backFaceCulling = false;
    
    // Create multi-material with both materials
    this.multiMaterial = new BABYLON.MultiMaterial('goldbergMultiMaterial', this.scene);
    this.multiMaterial.subMaterials.push(this.originalMaterial);
    this.multiMaterial.subMaterials.push(this.highlightMaterial);
    
    // Apply multi-material to mesh
    goldbergMesh.material = this.multiMaterial;
    
    // Create submeshes for each face (all faces use material index 0 initially)
    const indices = goldbergMesh.getIndices();
    const positions = goldbergMesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    if (indices && positions) {
      const faceCount = indices.length / 3;
      goldbergMesh.subMeshes = [];
      
      // Create one submesh per triangle, all using the original material (index 0)
      for (let i = 0; i < faceCount; i++) {
        const startIndex = i * 3;
        const indexCount = 3;
        const materialIndex = 0; // Use original material
        
        new BABYLON.SubMesh(materialIndex, 0, faceCount, startIndex, indexCount, goldbergMesh);
      }
      
      // Analyze mesh to group triangles into logical faces
      this.analyzeFaceGroups(new Int32Array(indices), new Float32Array(positions));
    }

    // Create a camera
    const camera = new BABYLON.ArcRotateCamera(
      'camera',
      0,
      Math.PI / 3,
      8,
      BABYLON.Vector3.Zero(),
      this.scene
    );
    camera.attachControl(this.canvas.nativeElement, true);
    camera.wheelPrecision = 50; // Fine zoom control

    // Create a basic light
    const light = new BABYLON.HemisphericLight(
      'light',
      new BABYLON.Vector3(0, 1, 0),
      this.scene
    );
    light.intensity = 0.7;

    // Add a second light for better visibility
    const light2 = new BABYLON.DirectionalLight(
      'light2',
      new BABYLON.Vector3(-1, -2, -1),
      this.scene
    );
    light2.intensity = 0.3;

    // Enable facet data for picking operations
    // Note: Goldberg mesh automatically supports picking

    // Store reference for interaction
    this.goldbergMesh = goldbergMesh;

    // Start the render loop
    this.engine.runRenderLoop(() => {
      if (this.scene) {
        this.scene.render();
      }
    });

    // Handle window resize
    window.addEventListener('resize', () => {
      if (this.engine) {
        this.engine.resize();
      }
    });

    // Setup click handler for face selection
    this.setupFaceSelection();
  }

  ngOnDestroy(): void {
    if (this.engine) {
      this.engine.dispose();
      this.engine = null;
    }
    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }
    if (this.goldbergMesh) {
      this.goldbergMesh.dispose();
      this.goldbergMesh = null;
    }
  }

  private setupFaceSelection(): void {
    if (!this.scene || !this.goldbergMesh) return;

    this.scene.onPointerObservable.add((pointerInfo) => {
      if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERPICK && 
          pointerInfo.pickInfo?.hit && 
          pointerInfo.pickInfo.faceId !== undefined &&
          pointerInfo.event.button === 0) { // Left click only
        
        const faceId = pointerInfo.pickInfo.faceId;
        this.selectFace(faceId);
      }
    });
  }

  private selectFace(faceId: number): void {
    if (!this.goldbergMesh) return;

    // Reset previous selection
    if (this.selectedFaceIndex !== null) {
      this.resetFaceColor(this.selectedFaceIndex);
    }

    // Highlight new selection
    this.selectedFaceIndex = faceId;
    this.highlightFace(faceId);

    // Log face information (for debugging and future metadata display)
    console.log(`Selected face: ${faceId}`);
    
    // Get face centroid for GPS conversion (simplified approach)
    // For now, we'll use the mesh center as approximation
    if (this.goldbergMesh) {
      const meshCenter = this.goldbergMesh.getBoundingInfo().boundingBox.centerWorld;
      const gpsCoords = this.cartesianToGPS(meshCenter);
      console.log(`Mesh center GPS: ${gpsCoords.lat.toFixed(6)}, ${gpsCoords.lng.toFixed(6)}`);
    }
  }

  private getLogicalFaceForTriangle(triangleIndex: number): number[] | null {
    // First try to find a direct mapping
    const directMapping = this.faceToSubmeshes.get(triangleIndex);
    if (directMapping) {
      return directMapping;
    }
    
    // If no direct mapping, find which logical face contains this triangle
    for (const [key, faceTriangles] of this.faceToSubmeshes.entries()) {
      if (faceTriangles.includes(triangleIndex)) {
        return faceTriangles;
      }
    }
    
    return null;
  }

  private highlightFace(faceId: number): void {
    if (!this.goldbergMesh || !this.goldbergMesh.subMeshes) return;

    // Find all submeshes that belong to this logical face
    const logicalFaceSubmeshes = this.getLogicalFaceForTriangle(faceId);
    
    if (logicalFaceSubmeshes) {
      // Highlight all submeshes in this logical face
      logicalFaceSubmeshes.forEach(submeshIndex => {
        if (submeshIndex < this.goldbergMesh!.subMeshes.length) {
          this.goldbergMesh!.subMeshes[submeshIndex].materialIndex = 1;
          this.goldbergMesh!.subMeshes[submeshIndex].refreshBoundingInfo();
        }
      });
    } else {
      // Fallback: highlight just the clicked triangle if no mapping found
      if (faceId < this.goldbergMesh.subMeshes.length) {
        this.goldbergMesh.subMeshes[faceId].materialIndex = 1;
        this.goldbergMesh.subMeshes[faceId].refreshBoundingInfo();
      }
    }
  }

  private resetFaceColor(faceId: number): void {
    if (!this.goldbergMesh || !this.goldbergMesh.subMeshes) return;

    // Find all submeshes that belong to this logical face
    const logicalFaceSubmeshes = this.getLogicalFaceForTriangle(faceId);
    
    if (logicalFaceSubmeshes) {
      // Reset all submeshes in this logical face
      logicalFaceSubmeshes.forEach(submeshIndex => {
        if (submeshIndex < this.goldbergMesh!.subMeshes.length) {
          this.goldbergMesh!.subMeshes[submeshIndex].materialIndex = 0;
          this.goldbergMesh!.subMeshes[submeshIndex].refreshBoundingInfo();
        }
      });
    } else {
      // Fallback: reset just the clicked triangle if no mapping found
      if (faceId < this.goldbergMesh.subMeshes.length) {
        this.goldbergMesh.subMeshes[faceId].materialIndex = 0;
        this.goldbergMesh.subMeshes[faceId].refreshBoundingInfo();
      }
    }
  }

  private analyzeFaceGroups(indices: Int32Array, positions: Float32Array): void {
    const faceCount = indices.length / 3;
    const visited = new Set<number>();
    
    // For each triangle, find all triangles that share vertices to form a logical face
    for (let i = 0; i < faceCount; i++) {
      if (visited.has(i)) continue;
      
      // Get vertices of current triangle
      const triangleVertices = new Set([
        indices[i * 3],
        indices[i * 3 + 1],
        indices[i * 3 + 2]
      ]);
      
      // Find all triangles that share vertices with this triangle (recursive approach)
      const logicalFace = this.findConnectedTriangles(i, triangleVertices, indices, visited);
      
      // Map the first triangle index to all triangles in this logical face
      this.faceToSubmeshes.set(logicalFace[0], logicalFace);
    }
    
    console.log(`Analyzed ${faceCount} triangles into ${this.faceToSubmeshes.size} logical faces`);
  }

  private findConnectedTriangles(
    startTriangle: number, 
    initialVertices: Set<number>, 
    indices: Int32Array, 
    visited: Set<number>
  ): number[] {
    const logicalFace: number[] = [];
    const verticesToCheck = new Set(initialVertices);
    const trianglesToCheck = [startTriangle];
    
    while (trianglesToCheck.length > 0) {
      const currentTriangle = trianglesToCheck.pop()!;
      
      if (visited.has(currentTriangle)) continue;
      
      // Add this triangle to the logical face
      logicalFace.push(currentTriangle);
      visited.add(currentTriangle);
      
      // Get vertices of current triangle
      const currentVertices = [
        indices[currentTriangle * 3],
        indices[currentTriangle * 3 + 1],
        indices[currentTriangle * 3 + 2]
      ];
      
      // Add current vertices to the set of vertices we're tracking
      currentVertices.forEach(v => verticesToCheck.add(v));
      
      // Find all triangles that share any vertex with our growing face
      for (let j = 0; j < indices.length / 3; j++) {
        if (visited.has(j)) continue;
        
        const jVertices = [
          indices[j * 3],
          indices[j * 3 + 1],
          indices[j * 3 + 2]
        ];
        
        // Check if triangle j shares any vertex with our logical face
        let sharesVertex = false;
        for (const vertex of jVertices) {
          if (verticesToCheck.has(vertex)) {
            sharesVertex = true;
            break;
          }
        }
        
        if (sharesVertex && !trianglesToCheck.includes(j)) {
          trianglesToCheck.push(j);
        }
      }
    }
    
    return logicalFace;
  }

  private calculateCentroid(positions: BABYLON.Vector3[]): BABYLON.Vector3 {
    const centroid = BABYLON.Vector3.Zero();
    positions.forEach(pos => {
      centroid.addInPlace(pos);
    });
    centroid.scaleInPlace(1 / positions.length);
    return centroid;
  }

  private cartesianToGPS(point: BABYLON.Vector3): { lat: number; lng: number } {
    const earthRadius = 6371; // km
    const normalizedPoint = point.normalize();
    
    const lat = Math.asin(normalizedPoint.y) * (180 / Math.PI);
    const lng = Math.atan2(normalizedPoint.z, normalizedPoint.x) * (180 / Math.PI);
    
    return { lat, lng };
  }

  // GPS to face mapping utility (simplified)
  public getFaceAtGPS(lat: number, lng: number): number | null {
    if (!this.goldbergMesh) return null;

    // Convert GPS to 3D coordinates
    const latRad = lat * (Math.PI / 180);
    const lngRad = lng * (Math.PI / 180);
    
    const x = Math.cos(latRad) * Math.cos(lngRad);
    const y = Math.sin(latRad);
    const z = Math.cos(latRad) * Math.sin(lngRad);
    
    const worldPoint = new BABYLON.Vector3(x, y, z);
    
    // Use picking to find closest face (simplified approach)
    const ray = new BABYLON.Ray(worldPoint.scale(-10), worldPoint);
    const pickResult = this.scene!.pickWithRay(ray, (mesh) => mesh === this.goldbergMesh);
    
    return pickResult?.faceId ?? null;
  }
}
