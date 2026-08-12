import type { ValidatedAudio } from './capture'
import { finalizeVoiceCapture, type CapturedAudio, type MediaInspectorPort } from './capture'

/**
 * A validated but Unsaved recording retained for the current process only.
 * It is never presented as a saved or recoverable memory: after a relaunch it
 * is gone (and the stale cache file it came from is cleaned up at bootstrap).
 */
export type UnsavedRecording = {
  audio: ValidatedAudio
  reviewedText: string
}

export type TransientCaptureStore = {
  /** The in-memory Unsaved recording, or null when none exists this process. */
  get(): UnsavedRecording | null
  /** Holds the candidate (a fully validated replacement supersedes it). */
  put(candidate: UnsavedRecording): void
  /** Clears the candidate (cancelled, saved, or superseded without validation). */
  clear(): void
}

/**
 * An in-process, non-persistent holder for the one Unsaved recording. Because
 * it lives outside the React tree it survives the App-lock obscured/unlocked
 * transition within a single process, so an interrupted-but-valid capture can
 * be shown for review again after re-authentication — without any persistence
 * promise. A fresh process starts empty (a relaunch cannot recover it).
 */
export function createTransientCaptureStore(): TransientCaptureStore {
  let candidate: UnsavedRecording | null = null
  return {
    get() {
      return candidate
    },
    put(next) {
      candidate = next
    },
    clear() {
      candidate = null
    },
  }
}

export type InterruptedCaptureOutcome =
  | { kind: 'kept'; recording: UnsavedRecording }
  | { kind: 'not-kept' }

/**
 * Handles a capture stopped by a lifecycle/audio interruption. A valid
 * candidate is retained as an in-process Unsaved recording for review after
 * re-authentication, with no persistence claim; anything invalid is dropped.
 */
export async function publishInterruptedCapture(
  deps: { inspector: MediaInspectorPort; store: TransientCaptureStore },
  captured: CapturedAudio,
): Promise<InterruptedCaptureOutcome> {
  const result = await finalizeVoiceCapture({ inspector: deps.inspector }, captured)
  if (result.kind !== 'valid') return { kind: 'not-kept' }
  const recording: UnsavedRecording = { audio: result.media, reviewedText: '' }
  deps.store.put(recording)
  return { kind: 'kept', recording }
}