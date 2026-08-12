import { Directory, File } from 'expo-file-system'
import { cacheDirectory } from 'expo-file-system/legacy'

/**
 * Removes stale capture-cache recordings left in the app cache directory by
 * cancelled, interrupted, or unsaved recordings from a prior process. Called
 * at bootstrap only (a process start); never removes anything during an active
 * in-process Unsaved recording, and never offers these files as recoverable
 * drafts. Best-effort: cleanup must never block the family flow.
 */
export async function cleanStaleCaptureCache(): Promise<void> {
  try {
    if (!cacheDirectory) return
    const cache = new Directory(cacheDirectory)
    if (!cache.exists) return
    for (const entry of cache.list()) {
      if (entry instanceof File && entry.name.toLowerCase().endsWith('.m4a')) {
        await entry.delete()
      }
    }
  } catch {
    // Never block the family flow on best-effort cache cleanup.
  }
}