import { Platform } from 'react-native'
import type { TranscriberPort, TranscribeOutcome } from '@before-they-grow/application'

/**
 * Transcriber edge. iOS uses the local BtgTranscription native module with
 * `requiresOnDeviceRecognition`; any other platform reports unavailable and
 * never starts a network recognizer. Availability is verified before any
 * speech permission is requested. The native module is loaded once, lazily.
 */
export function createExpoTranscriberPort(): TranscriberPort {
  let btg: Promise<typeof import('../../modules/btg-native/src')> | null = null
  const module = () => {
    btg ??= import('../../modules/btg-native/src')
    return btg
  }

  return {
    async isOnDeviceAvailable() {
      if (Platform.OS !== 'ios') return false
      try {
        return await (await module()).isTranscriptionOnDeviceAvailable()
      } catch {
        return false
      }
    },
    async requestPermissionIfNeeded() {
      if (Platform.OS !== 'ios') return false
      try {
        return await (await module()).requestTranscriptionPermission()
      } catch {
        return false
      }
    },
    async transcribe(uri) {
      if (Platform.OS !== 'ios') return { kind: 'unavailable' } satisfies TranscribeOutcome
      try {
        const result = await (await module()).transcribeFile(uri)
        if (result.kind === 'unavailable') return { kind: 'unavailable' }
        if (result.kind === 'failed') return { kind: 'failed' }
        return { kind: 'draft', text: result.text ?? '' }
      } catch {
        return { kind: 'failed' }
      }
    },
    async cancel() {
      if (Platform.OS !== 'ios') return
      try {
        await (await module()).cancelTranscriptionFile()
      } catch {
        // Best-effort; the JS coordinator already drops superseded results.
      }
    },
  }
}