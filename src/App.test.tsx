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

const originalMediaRecorder = globalThis.MediaRecorder
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')

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

  it('saves a typed answer to the child timeline', async () => {
    const user = userEvent.setup()
    const { repository, memories } = createFakeRepository({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T19:00:00.000Z',
    })
    renderRoute('/app', repository)

    const answer = await screen.findByLabelText('Add their answer in words')
    await user.type(answer, 'I learned how to whistle.')
    await user.click(screen.getByRole('button', { name: 'Keep this answer' }))

    expect(await screen.findByText('Saved to Milo’s timeline.')).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Keep this answer' }))

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

  it('re-enables answer saving and preserves input when storage fails', async () => {
    const user = userEvent.setup()
    const { repository } = createFakeRepository({
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T19:00:00.000Z',
    })
    vi.mocked(repository.addMemory).mockRejectedValueOnce(
      new DOMException('full', 'QuotaExceededError'),
    )
    renderRoute('/app', repository)

    const answer = await screen.findByLabelText('Add their answer in words')
    await user.type(answer, 'Keep this exact answer.')
    await user.click(screen.getByRole('button', { name: 'Keep this answer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not save this answer.',
    )
    expect(screen.getByRole('button', { name: 'Keep this answer' })).toBeEnabled()
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

    view.unmount()
    renderRoute('/terms', repository)
    expect(
      screen.getByRole('heading', { name: 'Terms of use' }),
    ).toBeInTheDocument()
  })
})
