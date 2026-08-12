import { describe, expect, it } from 'vitest'
import {
  createTranscriptionCoordinator,
  type TranscriberPort,
  type TranscribeOutcome,
} from './transcribe'

function fakeTranscriber(
  outcomes: Array<TranscribeOutcome | 'deferred'> = [],
): TranscriberPort & {
  called: string[]
  cancelled: boolean
  resolveNext: (outcome: TranscribeOutcome) => void
} {
  const state = {
    called: [] as string[],
    cancelled: false,
    pending: [] as Array<(outcome: TranscribeOutcome) => void>,
  }
  const port: TranscriberPort & {
    called: string[]
    cancelled: boolean
    resolveNext: (outcome: TranscribeOutcome) => void
  } = {
    called: state.called,
    cancelled: state.cancelled,
    isOnDeviceAvailable: async () => true,
    requestPermissionIfNeeded: async () => true,
    async transcribe(uri) {
      state.called.push(uri)
      const outcome = outcomes[state.called.length - 1] ?? 'deferred'
      if (outcome === 'deferred') {
        return new Promise<TranscribeOutcome>((resolve) => {
          state.pending.push(resolve)
        })
      }
      return outcome
    },
    async cancel() {
      port.cancelled = true
    },
    resolveNext(outcome: TranscribeOutcome) {
      const resolve = state.pending.shift()
      if (resolve) resolve(outcome)
    },
  }
  return port
}

describe('createTranscriptionCoordinator', () => {
  it('returns the draft for the current session', async () => {
    const transcriber = fakeTranscriber([{ kind: 'draft', text: 'rainbow' }])
    const coordinator = createTranscriptionCoordinator({ transcriber })

    expect(await coordinator.start('file:///cache/rec.m4a')).toEqual({
      kind: 'draft',
      text: 'rainbow',
    })
    expect(transcriber.called).toEqual(['file:///cache/rec.m4a'])
  })

  it('reports unavailable without falling back', async () => {
    const transcriber = fakeTranscriber([{ kind: 'unavailable' }])
    const coordinator = createTranscriptionCoordinator({ transcriber })

    expect(await coordinator.start('file:///cache/rec.m4a')).toEqual({ kind: 'unavailable' })
  })

  it('drops a late result from a superseded session', async () => {
    const transcriber = fakeTranscriber(['deferred', 'deferred'])
    const coordinator = createTranscriptionCoordinator({ transcriber })

    const first = coordinator.start('first.m4a')
    const second = coordinator.start('second.m4a')

    // The first (stale) session resolves after a newer one started.
    transcriber.resolveNext({ kind: 'draft', text: 'stale draft' })
    expect(await first).toEqual({ kind: 'stale' })

    transcriber.resolveNext({ kind: 'draft', text: 'current draft' })
    expect(await second).toEqual({ kind: 'draft', text: 'current draft' })
  })

  it('passes through a failed outcome without stalling', async () => {
    const transcriber = fakeTranscriber([{ kind: 'failed' }])
    const coordinator = createTranscriptionCoordinator({ transcriber })

    expect(await coordinator.start('file:///cache/rec.m4a')).toEqual({ kind: 'failed' })
  })

  it('invalidate() supersedes any in-flight session', async () => {
    const transcriber = fakeTranscriber(['deferred'])
    const coordinator = createTranscriptionCoordinator({ transcriber })

    const pending = coordinator.start('file:///cache/rec.m4a')
    coordinator.invalidate()
    transcriber.resolveNext({ kind: 'draft', text: 'late' })

    expect(await pending).toEqual({ kind: 'stale' })
  })

  it('cancel() invalidates the session and tells the adapter to stop', async () => {
    const transcriber = fakeTranscriber([])
    const coordinator = createTranscriptionCoordinator({ transcriber })

    const pending = coordinator.start('file:///cache/rec.m4a')
    await coordinator.cancel()

    expect(transcriber.cancelled).toBe(true)
    transcriber.resolveNext({ kind: 'draft', text: 'late' })
    expect(await pending).toEqual({ kind: 'stale' })
  })
})