/**
 * Best-effort English (en-US) native transcription behind an explicit port.
 * The port never falls back to a generic network recognizer or a Before They
 * Grow backend: availability is verified before any speech permission is
 * requested, and transcription is always independent of the completed audio
 * capture (recognition denial, empty output, timeout, failure, unsupported
 * locale, or an unavailable model never discards, delays, or invalidates a
 * completed recording).
 */
export type TranscribeOutcome =
  | { kind: 'draft'; text: string }
  | { kind: 'unavailable' }
  | { kind: 'failed' }

export type TranscriberPort = {
  /** Whether verified on-device recognition is available, before any permission. */
  isOnDeviceAvailable(): Promise<boolean>
  /** Requests speech permission; only ever called after availability is confirmed. */
  requestPermissionIfNeeded(): Promise<boolean>
  /** Starts on-device recognition of a completed audio file. */
  transcribe(uri: string): Promise<TranscribeOutcome>
  /** Cancels any in-flight recognition task. */
  cancel(): Promise<void>
}

export type TranscriptionOutcome = TranscribeOutcome | { kind: 'stale' }

export type TranscriptionCoordinator = {
  /** Begins best-effort transcription; a superseded session returns 'stale'. */
  start(uri: string): Promise<TranscriptionOutcome>
  cancel(): Promise<void>
  /** Invalidates any in-flight session (a newer capture/review began). */
  invalidate(): void
}

/**
 * Owns the session boundary so late, duplicated, or stale native callbacks
 * can never overwrite a newer capture/review session. A result is delivered
 * only when its session is still current.
 */
export function createTranscriptionCoordinator(deps: {
  transcriber: TranscriberPort
}): TranscriptionCoordinator {
  let generation = 0

  return {
    async start(uri) {
      const myGeneration = ++generation
      const outcome = await deps.transcriber.transcribe(uri)
      if (generation !== myGeneration) return { kind: 'stale' }
      return outcome
    },
    async cancel() {
      generation += 1
      await deps.transcriber.cancel()
    },
    invalidate() {
      generation += 1
    },
  }
}