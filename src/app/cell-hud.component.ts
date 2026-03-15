import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CellID } from '../domain/models/cell-id';
import { FaceMetadata } from '../domain/models/face-metadata';
import { FaceRepository } from '../infrastructure/repositories/face.repository';
import { GoldbergGridService } from '../domain/services/goldberg-grid.service';

@Component({
  selector: 'app-cell-hud',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cell-hud.component.html',
  styleUrl: './cell-hud.component.scss'
})
export class CellHudComponent implements OnChanges {
  @Input() title: string = 'Cell Details';
  @Input() cell: CellID | null = null;
  @Input() id: string = 'cell-hud';

  metadata: FaceMetadata | undefined;
  properties: { key: string, value: any }[] = [];
  cellType: 'pentagon' | 'hexagon' = 'hexagon';

  constructor(
    private faceRepository: FaceRepository,
    private gridService: GoldbergGridService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['cell']) {
      this.updateMetadata();
    }
  }

  private updateMetadata(): void {
    if (!this.cell) {
      this.metadata = undefined;
      this.properties = [];
      this.cellType = 'hexagon';
      return;
    }

    const lookup = this.gridService.getCellLookupService();
    if (lookup) {
      this.cellType = lookup.getCellType(this.cell);
    }

    this.metadata = this.faceRepository.getMetadata(this.cell);
    
    if (this.metadata && this.metadata.properties) {
      this.properties = Object.entries(this.metadata.properties).map(([key, value]) => ({
        key: this.capitalize(key),
        value
      }));
    } else {
      this.properties = [];
    }
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
