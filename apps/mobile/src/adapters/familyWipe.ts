import type { FamilyWipePort } from '@before-they-grow/application'
import { cleanStaleCaptureCache } from './expoCacheCleanup'
import type { FamilyMediaStore } from './expoMediaStore'

/**
 * Delete-everything port: a non-family-bearing marker plus teardown of the
 * catalog, family files, and capture cache. Unrelated app resources stay put.
 */
export function createFamilyWipePort(deps: {
  closeCatalog: () => Promise<void>
  store: Pick<
    FamilyMediaStore,
    'markerPresent' | 'writeMarker' | 'clearMarker' | 'wipeFamilyContent' | 'verifyWiped'
  >
  cleanCache?: () => Promise<void>
}): FamilyWipePort {
  return {
    markerPresent: () => deps.store.markerPresent(),
    writeMarker: () => deps.store.writeMarker(),
    clearMarker: () => deps.store.clearMarker(),
    closeCatalog: () => deps.closeCatalog(),
    async wipeFamilyContent() {
      await deps.store.wipeFamilyContent()
      await (deps.cleanCache ?? cleanStaleCaptureCache)()
    },
    verifyWiped: () => deps.store.verifyWiped(),
  }
}
