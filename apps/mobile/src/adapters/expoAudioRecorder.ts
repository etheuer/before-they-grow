import { AppState } from 'react-native'
import { AudioModule, IOSOutputFormat, AudioQuality } from 'expo-audio'
import { MAX_CAPTURE_BYTES, MAX_CAPTURE_DURATION_MS, type AudioRecorderPort, type CapturedAudio, type RecorderStatus } from '@before-they-grow/application'
import { createExpoRecordingPermissionPort } from './expoRecordingPermission'

/**
 * Mono AAC-LC in an MPEG-4/M4A container at a normal voice-capture rate, per
 * the native voice policy. The operating system's selected input route
 * (built-in, wired, or Bluetooth) is accepted without a manual route picker.
 * Recording stops automatically at the five-minute duration and 32 MiB size
 * limits, and stops covert capture (releasing the microphone) on any
 * privacy-sensitive lifecycle transition: an incoming call, audio-focus loss,
 * screen lock, or inactive/background transition.
 */
const VOICE_RECORDING_OPTIONS = {
  directory: 'cache' as const,
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 64000,
  android: {
    outputFormat: 'mpeg4' as const,
    audioEncoder: 'aac' as const,
    maxFileSize: MAX_CAPTURE_BYTES,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 44100,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  web: {},
}

export function createExpoAudioRecorderPort(): AudioRecorderPort {
  const permission = createExpoRecordingPermissionPort()
  let recorder: InstanceType<typeof AudioModule.AudioRecorder> | null = null
  let poller: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<() => void>()
  const interruptedListeners = new Set<(captured: CapturedAudio) => void>()

  const emit = () => {
    for (const listener of listeners) listener()
  }

  const stopPoller = () => {
    if (poller !== null) {
      clearInterval(poller)
      poller = null
    }
  }

  const release = () => {
    stopPoller()
    const current = recorder
    recorder = null
    return current
  }

  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state === 'active' || !recorder) return
    const current = release()
    emit()
    if (!current) return
    void current.stop().then(() => {
      const uri = current.uri
      if (!uri) return
      for (const listener of interruptedListeners) {
        listener({ uri, durationMs: current.currentTime * 1000 })
      }
    })
  })
  void appStateSubscription

  return {
    async requestPermission() {
      return permission.requestPermission()
    },

    async start() {
      if (recorder) return
      const next = new AudioModule.AudioRecorder(VOICE_RECORDING_OPTIONS)
      await next.prepareToRecordAsync()
      next.record({ forDuration: MAX_CAPTURE_DURATION_MS / 1000 })
      recorder = next
      poller = setInterval(emit, 500)
    },

    async stop() {
      const current = release()
      if (!current) throw new Error('No active recording')
      try {
        await current.stop()
      } catch {
        // The recorder may have already finalized itself at the automatic
        // five-minute stop; the captured file is still readable below.
      }
      const uri = current.uri
      if (!uri) throw new Error('Recording produced no file')
      return { uri, durationMs: current.currentTime * 1000 } satisfies CapturedAudio
    },

    async cancel() {
      const current = release()
      emit()
      if (current) {
        try {
          await current.stop()
        } catch {
          // The cache file is discarded; nothing to persist.
        }
      }
    },

    getStatus(): RecorderStatus {
      const current = recorder
      if (!current) return { recording: false, durationMs: 0 }
      return { recording: current.isRecording, durationMs: current.currentTime * 1000 }
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    onInterrupted(listener) {
      interruptedListeners.add(listener)
      return () => interruptedListeners.delete(listener)
    },
  }
}