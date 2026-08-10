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

const originalMediaRecorder = globalThis.MediaRecorder
const originalMediaDevices = navigator.mediaDevices

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
  const audio = onRecorded.mock.calls[0][0] as Blob
  expect(audio.type).toBe('audio/webm')
  expect(await audio.text()).toBe('recorded-voice')
  expect(stopTrack).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Voice answer ready')).toBeInTheDocument()
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
