/**
 * SDFCacheService
 *
 * Versioned cache that stores packed SDF textures keyed by heightmap content
 * hash. Avoids regenerating the expensive GPU JFA pipeline on every startup.
 *
 * Requirements: 3.1, 3.2, 3.3
 */

import { Injectable } from '@angular/core'
import { RenderTargetTexture } from '@babylonjs/core'

@Injectable({
  providedIn: 'root',
})
export class SDFCacheService {
  private readonly cache = new Map<string, RenderTargetTexture>()

  /**
   * Retrieve a cached SDF texture by heightmap content hash.
   *
   * @param hash  Heightmap content hash used as the cache key.
   * @returns     The stored `RenderTargetTexture`, or `null` if no entry exists
   *              for the given hash (Requirement 3.2).
   */
  get(hash: string): RenderTargetTexture | null {
    return this.cache.get(hash) ?? null
  }

  /**
   * Store a packed SDF texture under the given heightmap content hash.
   *
   * @param hash     Heightmap content hash used as the cache key.
   * @param texture  The packed RGBA `RenderTargetTexture` to cache.
   */
  set(hash: string, texture: RenderTargetTexture): void {
    this.cache.set(hash, texture)
  }

  /**
   * Clear all cached entries.
   *
   * After calling `invalidate()`, every subsequent `get()` call will return
   * `null` until new entries are added via `set()` (Requirement 3.3).
   */
  invalidate(): void {
    this.cache.clear()
  }
}
