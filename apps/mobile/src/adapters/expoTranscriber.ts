import { Platform } from 'react-native'
import type { TranscriberPort, TranscribeOutcome } from '@before-they-grow/application'

/**
 * Transcriber edge. iOS uses the local BtgTranscription native module with
 * `requiresOnDeviceRecognition`; any other platform reports unavailable and
 * never starts a network recognizer. Availability is verified before any
 * speech permission is requested.
 */
export function createExpoTranscriberPort(): TranscriberPort {
  return {
    async isOnDeviceAvailable() {
      if (Platform.OS !== 'ios') return false
      const module = await import('../../modules/btg-native/src')
      try {
        return await module.isTranscriptionOnDeviceAvailable()
      } catch {
        return false
      }
    },
    async requestPermissionIfNeeded() {
      if (Platform.OS !== 'ios') return false
      const module = await import('../../modules/btg-native/src')
      try {
        return await module.requestTranscriptionPermission()
      } catch {
        return false
      }
    },
    async transcribe(uri, sessionId) {
      if (Platform.OS !== 'ios') return { kind: 'unavailable' } satisfies TranscribeOutcome
      const module = await import('../../modules/btg-native/src')
      try {
        const result = await module.transcribeFile(uri, sessionId)
        if (result.kind === 'unavailable') return { kind: 'unavailable' }
        if (result.kind === 'failed') return { kind: 'failed' }
        return { kind: 'draft', text: result.text ?? '' }
      } catch {
        return { kind: 'failed' }
      }
    },
    async cancel() {
      // On-device recognition of a bounded file runs to completion; the JS
      // coordinator drops superseded results, so there is no long-running
      // recognition task to stop.
    },
  }
}