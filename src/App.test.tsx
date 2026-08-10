import { MemoryRouter } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import type {
  FamilyProfile,
  MemoryEntry,
  MemoryRepository,
} from './data/memoryRepository'

class AppFakeMediaRecorder {
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
      data: new Blob(['family-voice'], { type: 'audio/webm' }),
    } as BlobEvent)
    this.onstop?.()
  }
}

class AppFakeSpeechRecognition {
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
        [{ 0: { transcript: 'I learned how to wistle.' }, isFinal: true }],
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
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
const originalSpeechRecognition = Object.getOwnPropertyDescriptor(globalThis, 'SpeechRecognition')
const originalWebkitSpeechRecognition = Object.getOwnPropertyDescriptor(globalThis, 'webkitSpeechRecognition')

afterEach(() => {
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: originalMediaRecorder,
  })
  if (originalMediaDevices) {
    Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
  } else {
    Reflect.deleteProperty(navigator, 'mediaDevices')
  }
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
  vi.restoreAllMocks()
})

function createFakeRepository(profile: FamilyProfile | null = null) {
  let currentProfile = profile
  const memories: MemoryEntry[] = []

  const repository: MemoryRepository = {
    getProfile: vi.fn(async () => currentProfile),
    saveProfile: vi.fn(async (nextProfile) => {
      currentProfile = nextProfile
    }),
    addMemory: vi.fn(async (memory) => {
      memories.push(memory)
    }),
    listMemories: vi.fn(async () => [...memories]),
    deleteAll: vi.fn(async () => {
      currentProfile = null
      memories.splice(0)
    }),
    close: vi.fn(),
  }

  return { repository, memories }
}

function renderRoute(
  route: string,
  repository: MemoryRepository,
  now = new Date('2026-08-10T20:00:00.000Z'),
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppRoutes repository={repository} now={() => now} />
    </MemoryRouter>,
  )
}

describe('Before They Grow journey', () => {
  it('presents a clear marketing promise and direct product CTA', () => {
    const { repository } = createFakeRepository()
    renderRoute('/', repository)

    expect(
      screen.getByRole('heading', {
        name: 'One question tonight. Their voice tomorrow.',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Try tonight’s question' }),
    ).toHaveAttribute('href', '/app')
  })

  it('onboards a family before showing the daily question', async () => {
    const user = userEvent.setup()
    const { repository } = createFakeRepository()
    renderRoute('/app', repository)

    expect(
      await screen.findByRole('heading', { name: 'Who are we listening to?' }),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('Child’s first name or nickname'), 'Milo')
    await user.click(screen.getByRole('radio', { name: '6 to 8' }))
    await user.click(screen.getByRole('button', { name: 'Start our ritual' }))

    expect(repository.saveProfile).toHaveBeenCalledWith(
      expect.objectContaining({ childName: 'Milo', ageBand: '6-8' }),
    )
    expect(
      await screen.findByRole('heading', { name: 'Tonight’s question' }),
    ).toBeInTheDocument()
  })

  it('reveals an editable generated transcript only after voice recording', async () => {
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
      value: AppFakeMediaRecorder,
    })
    Object.defineProperty(globalThis, 'SpeechRecognition', {
      configurable: true,
      value: AppFakeSpeechRecognition,
    })
    const { repository, memories } = createFakeRepository({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T19:00:00.000Z',
    })
    renderRoute('/app', repository)

    expect(await screen.findByRole('heading', { name: 'Tonight’s question' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Review the transcript')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Record their voice' }))
    await user.click(screen.getByRole('button', { name: 'Finish recording' }))

    const transcript = await screen.findByLabelText('Review the transcript')
    expect(transcript).toHaveValue('I learned how to wistle.')
    await user.clear(transcript)
    await user.type(transcript, 'I learned how to whistle.')
    await user.click(screen.getByRole('button', { name: 'Save voice and transcript' }))

    expect(await screen.findByText('Saved to Milo’s timeline.')).toBeInTheDocument()
    expect(memories).toHaveLength(1)
    expect(memories[0]).toMatchObject({
      answerText: 'I learned how to whistle.',
      audio: expect.any(Blob),
    })
  })

  it('preserves a completed answer when replacement microphone permission is denied', async () => {
    const user = userEvent.setup()
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce({ getTracks: () => [{ stop: vi.fn() }] })
      .mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      value: AppFakeMediaRecorder,
    })
    Object.defineProperty(globalThis, 'SpeechRecognition', {
      configurable: true,
      value: AppFakeSpeechRecognition,
    })
    const { repository, memories } = createFakeRepository({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T19:00:00.000Z',
    })
    renderRoute('/app', repository)

    await user.click(await screen.findByRole('button', { name: 'Record their voice' }))
    await user.click(screen.getByRole('button', { name: 'Finish recording' }))
    const transcript = await screen.findByLabelText('Review the transcript')
    await user.clear(transcript)
    await user.type(transcript, 'Parent corrected this irreplaceable answer.')

    await user.click(screen.getByRole('button', { name: 'Record again' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Microphone access was not available.')
    expect(transcript).toHaveValue('Parent corrected this irreplaceable answer.')
    const save = screen.getByRole('button', { name: 'Save voice and transcript' })
    expect(save).toBeEnabled()
    await user.click(save)
    expect(memories).toHaveLength(1)
    expect(memories[0].answerText).toBe('Parent corrected this irreplaceable answer.')
    expect(await memories[0].audio?.text()).toBe('family-voice')
  })

  it('keeps the prior answer when a replacement recording is empty', async () => {
    class EmptyReplacementMediaRecorder extends AppFakeMediaRecorder {
      static created = 0
      readonly sequence = EmptyReplacementMediaRecorder.created++

      stop() {
        this.state = 'inactive'
        if (this.sequence === 0) {
          this.ondataavailable?.({
            data: new Blob(['first-family-voice'], { type: 'audio/webm' }),
          } as BlobEvent)
        }
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
      value: EmptyReplacementMediaRecorder,
    })
    const { repository, memories } = createFakeRepository({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T19:00:00.000Z',
    })
    renderRoute('/app', repository)

    await user.click(await screen.findByRole('button', { name: 'Record their voice' }))
    await user.click(screen.getByRole('button', { name: 'Finish recording' }))
    const transcript = await screen.findByLabelText('Review the transcript')
    await user.type(transcript, 'Keep this parent transcript.')

    await user.click(screen.getByRole('button', { name: 'Record again' }))
    await user.click(screen.getByRole('button', { name: 'Finish recording' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No voice was captured')
    expect(transcript).toHaveValue('Keep this parent transcript.')
    await user.click(screen.getByRole('button', { name: 'Save voice and transcript' }))
    expect(memories).toHaveLength(1)
    expect(memories[0].answerText).toBe('Keep this parent transcript.')
    expect(await memories[0].audio?.text()).toBe('first-family-voice')
  })

  it('reveals manual transcript recovery only when recording is unavailable', async () => {
    const user = userEvent.setup()
    Reflect.deleteProperty(navigator, 'mediaDevices')
    Reflect.deleteProperty(globalThis, 'MediaRecorder')
    const { repository, memories } = createFakeRepository({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T19:00:00.000Z',
    })
    renderRoute('/app', repository)

    expect(await screen.findByRole('heading', { name: 'Tonight’s question' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Review the transcript')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Record their voice' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Voice recording is not supported here.',
    )
    const transcript = screen.getByLabelText('Review the transcript')
    await user.type(transcript, 'I learned how to whistle.')
    await user.click(screen.getByRole('button', { name: 'Save transcript' }))

    expect(memories).toHaveLength(1)
    expect(memories[0]).toMatchObject({
      answerText: 'I learned how to whistle.',
      audio: null,
    })
  })

  it('saves a voice answer without requiring typed text', async () => {
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
      value: AppFakeMediaRecorder,
    })
    const { repository, memories } = createFakeRepository({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T19:00:00.000Z',
    })
    renderRoute('/app', repository)

    await user.click(
      await screen.findByRole('button', { name: 'Record their voice' }),
    )
    await user.click(screen.getByRole('button', { name: 'Finish recording' }))
    await user.click(screen.getByRole('button', { name: 'Save voice answer' }))

    expect(memories).toHaveLength(1)
    expect(memories[0].answerText).toBe('')
    expect(memories[0].audio).toBeInstanceOf(Blob)
  })

  it('shows saved answers in a chronological memory timeline', async () => {
    const { repository, memories } = createFakeRepository({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T19:00:00.000Z',
    })
    memories.push({
      id: 'memory-1',
      promptId: 'prompt-1',
      question: 'What made you laugh today?',
      answerText: 'The dog sneezed.',
      audio: null,
      recordedAt: '2026-08-10T20:00:00.000Z',
    })

    renderRoute('/app/memories', repository)

    expect(
      await screen.findByRole('heading', { name: 'Milo’s growing timeline' }),
    ).toBeInTheDocument()
    expect(await screen.findByText('What made you laugh today?')).toBeInTheDocument()
    expect(screen.getByText('“The dog sneezed.”')).toBeInTheDocument()
  })

  it('exports a portable copy from settings', async () => {
    const user = userEvent.setup()
    const createObjectURL = vi.fn(() => 'blob:portable-export')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const { repository, memories } = createFakeRepository({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T19:00:00.000Z',
    })
    memories.push({
      id: 'memory-1',
      promptId: 'prompt-1',
      question: 'What made you laugh today?',
      answerText: 'The dog sneezed.',
      audio: null,
      recordedAt: '2026-08-10T20:00:00.000Z',
    })

    renderRoute('/app/settings', repository)
    await user.click(
      await screen.findByRole('button', { name: 'Export my memories' }),
    )

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Your export was downloaded.')).toBeInTheDocument()
  })

  it('requires a second action before deleting local family data', async () => {
    const user = userEvent.setup()
    const { repository } = createFakeRepository({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T19:00:00.000Z',
    })

    renderRoute('/app/settings', repository)
    await user.click(
      await screen.findByRole('button', { name: 'Delete everything' }),
    )
    expect(repository.deleteAll).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Yes, delete everything' }))

    expect(repository.deleteAll).toHaveBeenCalledTimes(1)
    expect(
      await screen.findByRole('heading', { name: 'Who are we listening to?' }),
    ).toBeInTheDocument()
  })

  it('recovers visibly when local profile loading fails', async () => {
    const user = userEvent.setup()
    const { repository } = createFakeRepository()
    vi.mocked(repository.getProfile)
      .mockRejectedValueOnce(new DOMException('blocked', 'UnknownError'))
      .mockResolvedValueOnce(null)

    renderRoute('/app', repository)

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('We could not open your local family data.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(
      await screen.findByRole('heading', { name: 'Who are we listening to?' }),
    ).toBeInTheDocument()
  })

  it('re-enables onboarding when profile storage fails', async () => {
    const user = userEvent.setup()
    const { repository } = createFakeRepository()
    vi.mocked(repository.saveProfile).mockRejectedValueOnce(
      new DOMException('full', 'QuotaExceededError'),
    )
    renderRoute('/app', repository)

    await user.type(
      await screen.findByLabelText('Child’s first name or nickname'),
      'Milo',
    )
    await user.click(screen.getByRole('button', { name: 'Start our ritual' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not save this profile.',
    )
    expect(screen.getByRole('button', { name: 'Start our ritual' })).toBeEnabled()
  })

  it('re-enables answer saving and preserves the recording and edited transcript when storage fails', async () => {
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
      value: AppFakeMediaRecorder,
    })
    const { repository } = createFakeRepository({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T19:00:00.000Z',
    })
    vi.mocked(repository.addMemory).mockRejectedValueOnce(
      new DOMException('full', 'QuotaExceededError'),
    )
    renderRoute('/app', repository)

    await user.click(await screen.findByRole('button', { name: 'Record their voice' }))
    await user.click(screen.getByRole('button', { name: 'Finish recording' }))
    const answer = await screen.findByLabelText('Review the transcript')
    await user.type(answer, 'Keep this exact answer.')
    await user.click(screen.getByRole('button', { name: 'Save voice and transcript' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not save this answer.',
    )
    expect(screen.getByRole('button', { name: 'Save voice and transcript' })).toBeEnabled()
    expect(answer).toHaveValue('Keep this exact answer.')
  })

  it('shows a recoverable timeline error when local reads fail', async () => {
    const user = userEvent.setup()
    const { repository } = createFakeRepository({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T19:00:00.000Z',
    })
    vi.mocked(repository.listMemories)
      .mockRejectedValueOnce(new DOMException('blocked', 'UnknownError'))
      .mockResolvedValueOnce([])
    renderRoute('/app/memories', repository)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not open this timeline.',
    )
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('The first answer starts tonight.')).toBeInTheDocument()
  })

  it('recovers when export or deletion fails', async () => {
    const user = userEvent.setup()
    const { repository } = createFakeRepository({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T19:00:00.000Z',
    })
    vi.mocked(repository.listMemories).mockRejectedValueOnce(
      new DOMException('blocked', 'UnknownError'),
    )
    vi.mocked(repository.deleteAll).mockRejectedValueOnce(
      new DOMException('blocked', 'UnknownError'),
    )
    renderRoute('/app/settings', repository)

    const exportButton = await screen.findByRole('button', { name: 'Export my memories' })
    await user.click(exportButton)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not prepare your export.',
    )
    expect(exportButton).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Delete everything' }))
    const deleteButton = screen.getByRole('button', { name: 'Yes, delete everything' })
    await user.click(deleteButton)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not delete your local data.',
    )
    expect(deleteButton).toBeEnabled()
  })

  it('publishes truthful privacy and terms pages', () => {
    const { repository } = createFakeRepository()
    const view = renderRoute('/privacy', repository)
    expect(
      screen.getByRole('heading', { name: 'Privacy, in plain language' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/stored only in this browser/i)).toBeInTheDocument()
    expect(
      screen.getByText(/speech recognition service may process the voice while you record/i),
    ).toBeInTheDocument()

    view.unmount()
    renderRoute('/terms', repository)
    expect(
      screen.getByRole('heading', { name: 'Terms of use' }),
    ).toBeInTheDocument()
  })
})
