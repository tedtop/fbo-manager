import { getVersion, setWorkerUrl } from 'maplibre-gl'

/**
 * Where the MapLibre worker script is served from: the copy that
 * scripts/copy-maplibre-worker.mjs puts into public/maplibre/ (postinstall, dev, build).
 */
export const MAPLIBRE_WORKER_PATH = '/maplibre/maplibre-gl-worker.mjs'

/** The worker URL for a maplibre-gl `version`; the version query busts the browser cache on upgrades. */
export function maplibreWorkerUrl(version: string): string {
  return `${MAPLIBRE_WORKER_PATH}?v=${encodeURIComponent(version)}`
}

let configured = false

/**
 * Points MapLibre at the worker served from public/. Must run before the first `new Map`;
 * does nothing on the server and after the first call.
 */
export function configureMapLibreWorker(): void {
  if (configured || typeof window === 'undefined') return
  setWorkerUrl(maplibreWorkerUrl(getVersion()))
  configured = true
}
