import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { AudioRecorder } from './AudioRecorder'

class FakeMediaRecorder {
  static isTypeSupported() {
    return true
  }

  state: RecordingState = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((event: BlobEvent) => void) | null = null
  onstop: (() => void) | null = null

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({
      data: new Blob(['recorded-voice'], { type: 'audio/webm' }),
    } as BlobEvent)
    this.onstop?.()
  }
}

class FakeSpeechRecognition {
  continuous = false
  interimResults = false
  lang = ''
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null = null
  onend: (() => void) | null = null
  onerror: (() => void) | null = null

  start() {}

  stop() {
    this.onresult?.({
      results: Object.assign(
        [{ 0: { transcript: 'I saw a rainbow.' }, isFinal: true }],
        { item: () => null },
      ),
    })
    this.onend?.()
  }

  abort() {
    this.onend?.()
  }
}

const originalMediaRecorder = globalThis.MediaRecorder
const originalMediaDevices = navigator.mediaDevices
const originalSpeechRecognition = Object.getOwnPropertyDescriptor(globalThis, 'SpeechRecognition')
const originalWebkitSpeechRecognition = Object.getOwnPropertyDescriptor(globalThis, 'webkitSpeechRecognition')

function restoreMediaDevices() {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: originalMediaDevices,
  })
}

afterEach(() => {
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: originalMediaRecorder,
  })
  restoreMediaDevices()
  if (originalSpeechRecognition) {
    Object.defineProperty(globalThis, 'SpeechRecognition', originalSpeechRecognition)
  } else {
    Reflect.deleteProperty(globalThis, 'SpeechRecognition')
  }
  if (originalWebkitSpeechRecognition) {
    Object.defineProperty(globalThis, 'webkitSpeechRecognition', originalWebkitSpeechRecognition)
  } else {
    Reflect.deleteProperty(globalThis, 'webkitSpeechRecognition')
  }
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('records a voice answer and releases the microphone', async () => {
  const user = userEvent.setup()
  const stopTrack = vi.fn()
  const getUserMedia = vi.fn(async () => ({
    getTracks: () => [{ stop: stopTrack }],
  }))
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder,
  })
  const onRecorded = vi.fn()

  render(<AudioRecorder onRecorded={onRecorded} />)

  await user.click(screen.getByRole('button', { name: 'Record their voice' }))
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
  expect(
    screen.getByRole('button', { name: 'Finish recording' }),
  ).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Finish recording' }))

  expect(onRecorded).toHaveBeenCalledTimes(1)
  const { audio, transcriptStatus } = onRecorded.mock.calls[0][0] as {
    audio: Blob
    transcriptStatus: string
  }
  expect(audio.type).toBe('audio/webm')
  expect(await audio.text()).toBe('recorded-voice')
  expect(transcriptStatus).toBe('unavailable')
  expect(stopTrack).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Voice answer ready')).toBeInTheDocument()
})

it('returns a browser-generated transcript with the original audio', async () => {
  const user = userEvent.setup()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
    },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder,
  })
  Object.defineProperty(globalThis, 'SpeechRecognition', {
    configurable: true,
    value: FakeSpeechRecognition,
  })
  const onRecorded = vi.fn()
  render(<AudioRecorder onRecorded={onRecorded} />)

  await user.click(screen.getByRole('button', { name: 'Record their voice' }))
  await user.click(screen.getByRole('button', { name: 'Finish recording' }))

  expect(onRecorded).toHaveBeenCalledTimes(1)
  expect(onRecorded).toHaveBeenCalledWith(
    expect.objectContaining({
      audio: expect.any(Blob),
      transcript: 'I saw a rainbow.',
      transcriptStatus: 'complete',
    }),
  )
})

it('rejects an empty recording instead of reporting a ready voice answer', async () => {
  class EmptyMediaRecorder extends FakeMediaRecorder {
    stop() {
      this.state = 'inactive'
      this.onstop?.()
    }
  }

  const user = userEvent.setup()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
    },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: EmptyMediaRecorder,
  })
  const onRecorded = vi.fn()
  const onUnavailable = vi.fn()
  render(<AudioRecorder onRecorded={onRecorded} onUnavailable={onUnavailable} />)

  await user.click(screen.getByRole('button', { name: 'Record their voice' }))
  await user.click(screen.getByRole('button', { name: 'Finish recording' }))

  expect(onRecorded).not.toHaveBeenCalled()
  expect(onUnavailable).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('alert')).toHaveTextContent('No voice was captured')
})

it('ignores a late end callback from an earlier recognition session', async () => {
  class DelayedSpeechRecognition extends FakeSpeechRecognition {
    static instances: DelayedSpeechRecognition[] = []
    stopCalls = 0

    constructor() {
      super()
      DelayedSpeechRecognition.instances.push(this)
    }

    stop() {
      this.stopCalls += 1
    }

    abort() {}

    end() {
      this.onend?.()
    }
  }

  const user = userEvent.setup()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
    },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder,
  })
  Object.defineProperty(globalThis, 'SpeechRecognition', {
    configurable: true,
    value: DelayedSpeechRecognition,
  })
  const onRecorded = vi.fn()
  render(<AudioRecorder onRecorded={onRecorded} />)

  await user.click(screen.getByRole('button', { name: 'Record their voice' }))
  await user.click(screen.getByRole('button', { name: 'Finish recording' }))
  await waitFor(
    () => expect(screen.getByText('Voice answer ready')).toBeInTheDocument(),
    { timeout: 3000 },
  )

  await user.click(screen.getByRole('button', { name: 'Record again' }))
  DelayedSpeechRecognition.instances[0].end()
  await user.click(screen.getByRole('button', { name: 'Finish recording' }))

  expect(DelayedSpeechRecognition.instances[1].stopCalls).toBe(1)
  DelayedSpeechRecognition.instances[1].end()
  expect(onRecorded).toHaveBeenCalledTimes(2)
})

it('aborts failed transcription and still returns the recorded audio', async () => {
  const abortRecognition = vi.fn()
  class FailingSpeechRecognition extends FakeSpeechRecognition {
    static instance: FailingSpeechRecognition

    constructor() {
      super()
      FailingSpeechRecognition.instance = this
    }

    fail() {
      this.onerror?.()
    }

    abort() {
      abortRecognition()
      super.abort()
    }
  }

  const user = userEvent.setup()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
    },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder,
  })
  Object.defineProperty(globalThis, 'SpeechRecognition', {
    configurable: true,
    value: FailingSpeechRecognition,
  })
  const onRecorded = vi.fn()
  render(<AudioRecorder onRecorded={onRecorded} />)

  await user.click(screen.getByRole('button', { name: 'Record their voice' }))
  FailingSpeechRecognition.instance.fail()
  await user.click(screen.getByRole('button', { name: 'Finish recording' }))

  expect(abortRecognition).toHaveBeenCalledTimes(1)
  expect(onRecorded).toHaveBeenCalledWith(
    expect.objectContaining({
      audio: expect.any(Blob),
      transcript: '',
      transcriptStatus: 'unavailable',
    }),
  )
})

it('keeps the audio when browser transcription cannot stop cleanly', async () => {
  class ThrowingSpeechRecognition extends FakeSpeechRecognition {
    stop() {
      throw new DOMException('already stopped', 'InvalidStateError')
    }
  }

  const user = userEvent.setup()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
    },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder,
  })
  Object.defineProperty(globalThis, 'SpeechRecognition', {
    configurable: true,
    value: ThrowingSpeechRecognition,
  })
  const onRecorded = vi.fn()
  render(<AudioRecorder onRecorded={onRecorded} />)

  await user.click(screen.getByRole('button', { name: 'Record their voice' }))
  await user.click(screen.getByRole('button', { name: 'Finish recording' }))

  expect(onRecorded).toHaveBeenCalledWith(
    expect.objectContaining({
      audio: expect.any(Blob),
      transcript: '',
      transcriptStatus: 'unavailable',
    }),
  )
})

it('continues audio recording when speech-recognition construction fails', async () => {
  class ThrowingSpeechRecognition {
    constructor() {
      throw new DOMException('provider unavailable', 'NotSupportedError')
    }
  }

  const user = userEvent.setup()
  const stopTrack = vi.fn()
  const onRecorded = vi.fn()
  const onUnavailable = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: stopTrack }],
      })),
    },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder,
  })
  Object.defineProperty(globalThis, 'SpeechRecognition', {
    configurable: true,
    value: ThrowingSpeechRecognition,
  })

  render(<AudioRecorder onRecorded={onRecorded} onUnavailable={onUnavailable} />)
  await user.click(screen.getByRole('button', { name: 'Record their voice' }))

  expect(screen.getByRole('button', { name: 'Finish recording' })).toBeInTheDocument()
  expect(onUnavailable).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Finish recording' }))
  expect(onRecorded).toHaveBeenCalledWith(expect.objectContaining({
    transcriptStatus: 'unavailable',
  }))
  expect(stopTrack).toHaveBeenCalledTimes(1)
})

it('recovers and releases resources after an asynchronous recorder error', async () => {
  class ErroringMediaRecorder extends FakeMediaRecorder {
    static instance: ErroringMediaRecorder
    onerror: (() => void) | null = null

    constructor() {
      super()
      ErroringMediaRecorder.instance = this
    }

    fail() {
      this.onerror?.()
    }
  }

  const user = userEvent.setup()
  const stopTrack = vi.fn()
  const onRecorded = vi.fn()
  const onUnavailable = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: stopTrack }],
      })),
    },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: ErroringMediaRecorder,
  })

  render(<AudioRecorder onRecorded={onRecorded} onUnavailable={onUnavailable} />)
  await user.click(screen.getByRole('button', { name: 'Record their voice' }))
  ErroringMediaRecorder.instance.fail()

  expect(await screen.findByRole('alert')).toHaveTextContent('recording could not be completed')
  expect(onUnavailable).toHaveBeenCalledTimes(1)
  expect(onRecorded).not.toHaveBeenCalled()
  expect(stopTrack).toHaveBeenCalledTimes(1)
})

it('recovers and releases resources when recorder stop throws', async () => {
  class ThrowingStopMediaRecorder extends FakeMediaRecorder {
    stop() {
      throw new DOMException('already stopped', 'InvalidStateError')
    }
  }

  const user = userEvent.setup()
  const stopTrack = vi.fn()
  const onUnavailable = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: stopTrack }],
      })),
    },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: ThrowingStopMediaRecorder,
  })

  render(<AudioRecorder onRecorded={vi.fn()} onUnavailable={onUnavailable} />)
  await user.click(screen.getByRole('button', { name: 'Record their voice' }))
  await user.click(screen.getByRole('button', { name: 'Finish recording' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('recording could not be completed')
  expect(onUnavailable).toHaveBeenCalledTimes(1)
  expect(stopTrack).toHaveBeenCalledTimes(1)
})

it('aborts transcription when audio recorder initialization fails', async () => {
  class FailingMediaRecorder {
    static isTypeSupported() {
      return true
    }

    constructor() {
      throw new Error('recorder initialization failed')
    }
  }

  const user = userEvent.setup()
  const stopTrack = vi.fn()
  const abortRecognition = vi.fn()
  class TrackingSpeechRecognition extends FakeSpeechRecognition {
    abort() {
      abortRecognition()
      super.abort()
    }
  }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: stopTrack }],
      })),
    },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FailingMediaRecorder,
  })
  Object.defineProperty(globalThis, 'SpeechRecognition', {
    configurable: true,
    value: TrackingSpeechRecognition,
  })
  const onUnavailable = vi.fn()
  render(<AudioRecorder onRecorded={vi.fn()} onUnavailable={onUnavailable} />)

  await user.click(screen.getByRole('button', { name: 'Record their voice' }))

  expect(abortRecognition).toHaveBeenCalledTimes(1)
  expect(stopTrack).toHaveBeenCalledTimes(1)
  expect(onUnavailable).toHaveBeenCalledTimes(1)
})

it('keeps the completed answer while a replacement microphone request is pending', async () => {
  const user = userEvent.setup()
  const firstStopTrack = vi.fn()
  const secondStopTrack = vi.fn()
  let resolveReplacement!: (stream: MediaStream) => void
  const replacementPermission = new Promise<MediaStream>((resolve) => {
    resolveReplacement = resolve
  })
  const getUserMedia = vi
    .fn()
    .mockResolvedValueOnce({ getTracks: () => [{ stop: firstStopTrack }] })
    .mockReturnValueOnce(replacementPermission)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder,
  })
  const onRecordingStarted = vi.fn()
  const view = render(
    <AudioRecorder onRecorded={vi.fn()} onRecordingStarted={onRecordingStarted} />,
  )

  await user.click(screen.getByRole('button', { name: 'Record their voice' }))
  await user.click(screen.getByRole('button', { name: 'Finish recording' }))
  expect(onRecordingStarted).toHaveBeenCalledTimes(1)

  await user.click(screen.getByRole('button', { name: 'Record again' }))
  expect(onRecordingStarted).toHaveBeenCalledTimes(1)

  view.unmount()
  resolveReplacement({
    getTracks: () => [{ stop: secondStopTrack }],
  } as unknown as MediaStream)
  await waitFor(() => expect(secondStopTrack).toHaveBeenCalledTimes(1))
})

it('releases the microphone when recognition abort throws during unmount', async () => {
  class ThrowingAbortSpeechRecognition extends FakeSpeechRecognition {
    abort() {
      throw new DOMException('already stopped', 'InvalidStateError')
    }
  }

  const user = userEvent.setup()
  const stopTrack = vi.fn()
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: stopTrack }],
      })),
    },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder,
  })
  Object.defineProperty(globalThis, 'SpeechRecognition', {
    configurable: true,
    value: ThrowingAbortSpeechRecognition,
  })
  const view = render(<AudioRecorder onRecorded={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: 'Record their voice' }))

  expect(() => view.unmount()).not.toThrow()
  expect(stopTrack).toHaveBeenCalledTimes(1)
})

it('releases a microphone stream that resolves after unmount', async () => {
  const user = userEvent.setup()
  const stopTrack = vi.fn()
  let resolvePermission!: (stream: MediaStream) => void
  const permission = new Promise<MediaStream>((resolve) => {
    resolvePermission = resolve
  })
  const getUserMedia = vi.fn(() => permission)
  const recorderStart = vi.spyOn(FakeMediaRecorder.prototype, 'start')

  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  })
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: FakeMediaRecorder,
  })

  const { unmount } = render(<AudioRecorder onRecorded={vi.fn()} />)
  await user.click(screen.getByRole('button', { name: 'Record their voice' }))
  unmount()

  resolvePermission({
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream)

  await waitFor(() => expect(stopTrack).toHaveBeenCalledTimes(1))
  expect(recorderStart).not.toHaveBeenCalled()
})
