import * as Audio from 'expo-audio'
import type {
  RecordingPermissionPort,
  RecordingPermissionState,
} from '@before-they-grow/application'

/**
 * expo-audio edge for the recording-permission gate. It is only ever called
 * after the parent has chosen to record and the purpose has been explained at
 * that decision point; the OS prompt carries the usage description from
 * app.json. Recording itself is the native voice slice (#34); this slice uses
 * the gate to branch honestly into the Manual transcript path.
 */
export function createExpoRecordingPermissionPort(): RecordingPermissionPort {
  return {
    async requestPermission(): Promise<RecordingPermissionState> {
      try {
        const result = await Audio.requestRecordingPermissionsAsync()
        if (result.granted || result.status === 'granted') return 'granted'
        if (result.status === 'denied') return 'denied'
        return 'unavailable'
      } catch {
        return 'unavailable'
      }
    },
  }
}