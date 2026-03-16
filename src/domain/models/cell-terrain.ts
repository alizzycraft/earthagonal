export type TerrainType = 'land' | 'coastline' | 'ocean';

export interface CoastEdge {
  edgeIndex: number;      // 0-5 for hex edges
  crossingPoint: number;  // 0.0-1.0 where coastline crosses edge
}

export interface CellTerrain {
  terrainType: TerrainType;
  elevation: number;
  landRatio: number;
  coastDistance: number;
  latitude: number;
  longitude: number;
  coastEdgeCrossings: CoastEdge[];
}
