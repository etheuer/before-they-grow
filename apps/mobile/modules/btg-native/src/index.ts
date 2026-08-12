import { requireNativeModule } from 'expo-modules-core'

/**
 * Lazy access to the BtgNative native module so importing this file never
 * touches native code (tests drive the persistence boundary with fakes).
 */
function native() {
  return requireNativeModule('BtgNative') as {
    setExcludedFromBackup(path: string, excluded: boolean): Promise<boolean>
  }
}

/**
 * Sets NSURLIsExcludedFromBackupKey on the resource and returns whether the
 * read-back value matches. A path that has nothing to exclude (a missing
 * transient sibling such as -wal) resolves true.
 */
export function setExcludedFromBackup(path: string, excluded: boolean): Promise<boolean> {
  return native().setExcludedFromBackup(path, excluded)
}

/**
 * Lazy access to the BtgTranscription native module (iOS only). The JS side
 * never calls it where the platform has no verified on-device path, and it
 * never falls back to a network recognizer.
 */
function transcriptionNative() {
  return requireNativeModule('BtgTranscription') as {
    isOnDeviceAvailable(): Promise<boolean>
    requestPermission(): Promise<boolean>
    transcribeFile(uri: string): Promise<{
      kind: 'draft' | 'unavailable' | 'failed'
      text?: string
    }>
    cancelTranscriptionFile(): Promise<void>
  }
}

export type TranscriptionNativeResult = {
  kind: 'draft' | 'unavailable' | 'failed'
  text?: string
}

export function isTranscriptionOnDeviceAvailable(): Promise<boolean> {
  return transcriptionNative().isOnDeviceAvailable()
}

export function requestTranscriptionPermission(): Promise<boolean> {
  return transcriptionNative().requestPermission()
}

export function transcribeFile(uri: string): Promise<TranscriptionNativeResult> {
  return transcriptionNative().transcribeFile(uri)
}

export function cancelTranscriptionFile(): Promise<void> {
  return transcriptionNative().cancelTranscriptionFile()
}