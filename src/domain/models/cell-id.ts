export interface CellID {
  face: number
  q: number
  r: number
  resolution: number
}

export function cellIDToString(cell: CellID): string {
  return `${cell.face}:${cell.q}:${cell.r}:${cell.resolution}`
}

export function cellIDFromString(str: string): CellID {
  const parts = str.split(':').map(Number)
  if (parts.length !== 4 || parts.some(isNaN)) {
    throw new Error(`Invalid CellID string: ${str}`)
  }
  return {
    face: parts[0],
    q: parts[1],
    r: parts[2],
    resolution: parts[3]
  }
}

export function equalCells(a: CellID, b: CellID): boolean {
  return a.face === b.face && 
         a.q === b.q && 
         a.r === b.r && 
         a.resolution === b.resolution
}
