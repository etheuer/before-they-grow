import { describe, expect, it } from 'vitest'
import { createTransientCaptureStore, publishInterruptedCapture } from './unsaved'
import type { ValidatedAudio } from './capture'
import type { MediaInspectorPort } from './capture'

const audio: ValidatedAudio = {
  uri: 'file:///cache/rec.m4a',
  durationMs: 12000,
  byteCount: 1000,
  sha256: 'abc',
}

function inspector(validity: 'valid' | 'empty' = 'valid'): MediaInspectorPort {
  return {
    async inspect() {
      if (validity === 'empty') {
        return { readable: true, byteCount: 0, sha256: '', decodable: false, durationMs: 0, stable: true }
      }
      return { readable: true, byteCount: 1000, sha256: 'abc', decodable: true, durationMs: 12000, stable: true }
    },
  }
}

describe('createTransientCaptureStore', () => {
  it('starts empty and returns nothing before any candidate is set', () => {
    const store = createTransientCaptureStore()
    expect(store.get()).toBeNull()
  })

  it('holds exactly one Unsaved recording for the current process', () => {
    const store = createTransientCaptureStore()
    store.put({ audio, reviewedText: '' })
    expect(store.get()).toEqual({ audio, reviewedText: '' })
    store.put({ audio, reviewedText: 'words' })
    expect(store.get()).toEqual({ audio, reviewedText: 'words' })
  })

  it('clear() removes the candidate truthfully', () => {
    const store = createTransientCaptureStore()
    store.put({ audio, reviewedText: '' })
    store.clear()
    expect(store.get()).toBeNull()
  })

  it('is process-scoped (a fresh store simulates a relaunch with nothing recoverable)', () => {
    const first = createTransientCaptureStore()
    first.put({ audio, reviewedText: '' })
    const relaunched = createTransientCaptureStore()
    expect(relaunched.get()).toBeNull()
  })

  it('retains a valid interrupted capture as an Unsaved recording', async () => {
    const store = createTransientCaptureStore()
    const outcome = await publishInterruptedCapture(
      { inspector: inspector('valid'), store },
      { uri: 'file:///cache/rec.m4a', durationMs: 12000 },
    )
    expect(outcome.kind).toBe('kept')
    expect(store.get()).toEqual({ audio, reviewedText: '' })
  })

  it('drops an invalid interrupted capture without retaining it', async () => {
    const store = createTransientCaptureStore()
    const outcome = await publishInterruptedCapture(
      { inspector: inspector('empty'), store },
      { uri: 'file:///cache/rec.m4a', durationMs: 0 },
    )
    expect(outcome).toEqual({ kind: 'not-kept' })
    expect(store.get()).toBeNull()
  })

  it('never clobbers a prior reviewed candidate on interruption', async () => {
    const store = createTransientCaptureStore()
    store.put({ audio, reviewedText: 'prior answer' })
    const outcome = await publishInterruptedCapture(
      { inspector: inspector('valid'), store },
      { uri: 'file:///cache/interrupted.m4a', durationMs: 9000 },
    )
    expect(outcome).toEqual({ kind: 'not-kept' })
    expect(store.get()).toEqual({ audio, reviewedText: 'prior answer' })
  })
})