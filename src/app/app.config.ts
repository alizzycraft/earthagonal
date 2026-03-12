import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { BabylonSceneService } from '../presentation/scene/babylon-scene.service';
import { GoldbergGridService } from '../domain/services/goldberg-grid.service';
import { SelectionService } from '../presentation/services/selection.service';
import { FaceRepository } from '../infrastructure/repositories/face.repository';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    BabylonSceneService,
    GoldbergGridService,
    SelectionService,
    FaceRepository
  ]
};
