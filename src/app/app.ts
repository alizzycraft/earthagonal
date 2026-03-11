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

    // Apply flat shading material to emphasize hexagonal boundaries
    const material = new BABYLON.StandardMaterial('goldbergMaterial', this.scene);
    material.diffuseColor = new BABYLON.Color3(0.2, 0.4, 0.8);
    material.specularColor = new BABYLON.Color3(0, 0, 0);
    material.backFaceCulling = false;
    goldbergMesh.material = material;

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

  private highlightFace(faceId: number): void {
    if (!this.goldbergMesh) return;

    // Simplified highlighting - change mesh color temporarily
    const highlightMaterial = new BABYLON.StandardMaterial('highlightMaterial', this.scene!);
    highlightMaterial.diffuseColor = new BABYLON.Color3(1, 1, 0);
    highlightMaterial.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0);
    this.goldbergMesh.material = highlightMaterial;
  }

  private resetFaceColor(faceId: number): void {
    if (!this.goldbergMesh) return;

    // Reset to original material
    const originalMaterial = new BABYLON.StandardMaterial('goldbergMaterial', this.scene!);
    originalMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.4, 0.8);
    originalMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
    originalMaterial.backFaceCulling = false;
    this.goldbergMesh.material = originalMaterial;
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
