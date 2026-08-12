import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type {
  ApplicationLifecyclePort,
  ApplicationLifecycleState,
  AuthenticationPort,
  AuthenticationResult,
  CredentialAvailability,
  CreateProfileInput,
  CreateProfileResult,
  ProtectedHomeState,
} from '@before-they-grow/application'
import type { MemoryEntryV1 } from '@before-they-grow/contracts'
import type { ProtectedAreaServices } from './services'
import { LockedNativeShell } from './App'

class FakeLifecycle implements ApplicationLifecyclePort {
  private listeners = new Set<(state: ApplicationLifecycleState) => void>()

  constructor(private state: ApplicationLifecycleState = 'active') {}

  getCurrentState = () => this.state

  subscribe = (listener: (state: ApplicationLifecycleState) => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  transitionTo(state: ApplicationLifecycleState) {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function fakeAuthentication(
  availability: CredentialAvailability | Promise<CredentialAvailability>,
  results: Array<AuthenticationResult | Promise<AuthenticationResult>>,
): AuthenticationPort {
  return {
    getCredentialAvailability: async () => availability,
    authenticate: async () => results.shift() ?? 'failed',
  }
}

function fakeProtectedArea(options: {
  initial?: ProtectedHomeState
  createResult?: CreateProfileResult
  homeAfterCreate?: ProtectedHomeState
  permission?: 'granted' | 'denied' | 'unavailable'
  memories?: MemoryEntryV1[]
  bootstrapFailures?: number
  timelineFailures?: number
} = {}): ProtectedAreaServices & {
  creates: CreateProfileInput[]
  bootstrapCalls: number
  savedManual: Array<{ transcript: string; recordingWasAvailable: boolean }>
} {
  const state = {
    creates: [] as CreateProfileInput[],
    bootstrapCalls: 0,
    savedManual: [] as Array<{ transcript: string; recordingWasAvailable: boolean }>,
    memories: [...(options.memories ?? [])],
    timelineLoads: 0,
  }
  return {
    creates: state.creates,
    savedManual: state.savedManual,
    get bootstrapCalls() {
      return state.bootstrapCalls
    },
    async bootstrap() {
      state.bootstrapCalls += 1
      if (state.bootstrapCalls <= (options.bootstrapFailures ?? 0)) {
        throw new Error('unexpected bootstrap failure')
      }
      if (state.creates.length > 0 && options.homeAfterCreate) {
        return options.homeAfterCreate
      }
      return options.initial ?? { kind: 'needs-onboarding' }
    },
    async createProfile(input) {
      state.creates.push(input)
      const trimmed = input.childNickname.trim()
      if (trimmed.length === 0 || trimmed.length > 40) {
        return { kind: 'invalid-nickname' }
      }
      return options.createResult ?? { kind: 'created', profile: {
        id: 'profile-1',
        childNickname: trimmed,
        ageBand: input.ageBand,
        consentedAt: '2026-08-11T22:05:00.000Z',
        createdAt: '2026-08-11T22:05:00.000Z',
      } }
    },
    async requestRecordingPermission() {
      return options.permission ?? 'unavailable'
    },
    async saveManualMemory(input) {
      state.savedManual.push({
        transcript: input.reviewedTranscript,
        recordingWasAvailable: input.recordingWasAvailable,
      })
      const trimmed = input.reviewedTranscript.trim()
      if (trimmed.length === 0) return { kind: 'invalid-transcript' }
      const memory: MemoryEntryV1 = {
        id: `memory-${state.savedManual.length}`,
        kind: 'text-only',
        promptSnapshot: input.promptSnapshot,
        reviewedTranscript: trimmed,
        capturedAt: input.now.toISOString(),
        savedAt: input.now.toISOString(),
        localDate: '2026-08-11',
        timeZone: 'UTC',
        media: null,
      }
      state.memories = [memory, ...state.memories]
      return { kind: 'saved', memory }
    },
    async loadMemoryTimeline() {
      if ((options.timelineFailures ?? 0) > state.timelineLoads) {
        state.timelineLoads += 1
        throw new Error('timeline read failed')
      }
      state.timelineLoads += 1
      return [...state.memories]
    },
  }
}

const homeWithProfile: ProtectedHomeState = {
  kind: 'home',
  profile: {
    id: 'profile-1',
    childNickname: 'Mila',
    ageBand: '6-8',
    consentedAt: '2026-08-11T22:05:00.000Z',
    createdAt: '2026-08-11T22:05:00.000Z',
  },
  prompt: {
    id: '6-8-memory-proud',
    ageBand: '6-8',
    category: 'memory',
    question: 'What happened today that made you feel proud?',
    followUp: 'What did you do to make it happen?',
  },
}

async function renderShell(
  authentication: AuthenticationPort,
  protectedArea: ProtectedAreaServices,
  lifecycle = new FakeLifecycle(),
) {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <LockedNativeShell
        authentication={authentication}
        lifecycle={lifecycle}
        protectedArea={protectedArea}
        openDeviceSettings={async () => undefined}
      />
    </SafeAreaProvider>,
  )
  return lifecycle
}

describe('locked native shell', () => {
  it('does not mount protected family content before authentication succeeds', async () => {
    const result = deferred<AuthenticationResult>()
    await renderShell(fakeAuthentication('available', [result.promise]), fakeProtectedArea())

    expect(screen.queryByText('Set up your family space')).toBeNull()
    expect(await screen.findByText('Unlock Before They Grow')).toBeOnTheScreen()

    await act(async () => result.resolve('authenticated'))

    expect(await screen.findByText('Set up your family space')).toBeOnTheScreen()
  })

  it('keeps protected content absent after cancellation and offers a safe retry', async () => {
    const cancellation = deferred<AuthenticationResult>()
    const retryResult = deferred<AuthenticationResult>()
    await renderShell(
      fakeAuthentication('available', [cancellation.promise, retryResult.promise]),
      fakeProtectedArea(),
    )
    await act(async () => cancellation.resolve('cancelled'))

    expect(await screen.findByText('Your family space is still locked')).toBeOnTheScreen()
    expect(screen.queryByText('Set up your family space')).toBeNull()
    const retry = screen.getByRole('button', { name: 'Try again' })
    await act(async () => {
      await fireEvent.press(retry)
      retryResult.resolve('authenticated')
    })

    expect(await screen.findByText('Set up your family space')).toBeOnTheScreen()
  })

  it('shows device-security setup guidance without entering the protected area', async () => {
    await renderShell(fakeAuthentication('unavailable', []), fakeProtectedArea())

    expect(await screen.findByText('Protect this phone first')).toBeOnTheScreen()
    expect(screen.getByText(/Set up a device passcode, PIN, or pattern/)).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Open device settings' })).toBeOnTheScreen()
    expect(screen.queryByText('Set up your family space')).toBeNull()
  })

  it.each(['inactive', 'background'] as const)(
    'removes protected content immediately when the application becomes %s',
    async (nextState) => {
      const firstAuthentication = deferred<AuthenticationResult>()
      const nextAuthentication = deferred<AuthenticationResult>()
      const lifecycle = await renderShell(
        fakeAuthentication('available', [firstAuthentication.promise, nextAuthentication.promise]),
        fakeProtectedArea(),
      )
      await act(async () => firstAuthentication.resolve('authenticated'))
      expect(await screen.findByText('Set up your family space')).toBeOnTheScreen()

      await act(async () => lifecycle.transitionTo(nextState))

      expect(screen.queryByText('Set up your family space')).toBeNull()
      expect(screen.getByText('Your family space is locked')).toBeOnTheScreen()

      await act(async () => lifecycle.transitionTo('active'))
      await waitFor(() => {
        expect(screen.queryByText('Set up your family space')).toBeNull()
      })
      await act(async () => nextAuthentication.resolve('authenticated'))
      expect(await screen.findByText('Set up your family space')).toBeOnTheScreen()
    },
  )
})

describe('protected area', () => {
  it('shows onboarding when no profile exists and creates exactly one via consent', async () => {
    const area = fakeProtectedArea({ homeAfterCreate: homeWithProfile })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)

    expect(await screen.findByText('Set up your family space')).toBeOnTheScreen()

    const nickname = screen.getByLabelText('Child first name or nickname')
    await act(async () => {
      await fireEvent.changeText(nickname, '  Mila  ')
    })
    await fireEvent.press(screen.getByRole('radio', { name: '6 to 8 years' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I am an adult' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I have permission to record' }))
    await fireEvent.press(screen.getByRole('button', { name: "Start tonight's question" }))

    expect(await screen.findByText('What happened today that made you feel proud?')).toBeOnTheScreen()
    expect(screen.getByText('What did you do to make it happen?')).toBeOnTheScreen()
    expect(screen.getByText(/A calm minute with Mila/)).toBeOnTheScreen()
    expect(area.creates).toHaveLength(1)
    expect(area.creates[0]).toMatchObject({
      childNickname: '  Mila  ',
      ageBand: '6-8',
      adultConfirmation: true,
      recordingPermissionConfirmed: true,
    })
  })

  it('keeps the submit disabled until nickname, age band, and both consents are set', async () => {
    const area = fakeProtectedArea()
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('Set up your family space')

    const submit = () => screen.getByRole('button', { name: "Start tonight's question" })
    expect(submit().props.accessibilityState.disabled).toBe(true)

    await fireEvent.changeText(screen.getByLabelText('Child first name or nickname'), 'Mila')
    expect(submit().props.accessibilityState.disabled).toBe(true)

    await fireEvent.press(screen.getByRole('radio', { name: '6 to 8 years' }))
    expect(submit().props.accessibilityState.disabled).toBe(true)

    await fireEvent.press(screen.getByRole('checkbox', { name: 'I am an adult' }))
    expect(submit().props.accessibilityState.disabled).toBe(true)

    await fireEvent.press(screen.getByRole('checkbox', { name: 'I have permission to record' }))
    expect(submit().props.accessibilityState.disabled).toBe(false)
    expect(area.creates).toHaveLength(0)
  })

  it('rejects an over-long nickname without creating a profile', async () => {
    const area = fakeProtectedArea()
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('Set up your family space')

    await fireEvent.changeText(
      screen.getByLabelText('Child first name or nickname'),
      'n'.repeat(41),
    )
    await fireEvent.press(screen.getByRole('radio', { name: '3 to 5 years' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I am an adult' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I have permission to record' }))
    await fireEvent.press(screen.getByRole('button', { name: "Start tonight's question" }))

    expect(
      await screen.findByText('Keep the nickname between 1 and 40 characters.'),
    ).toBeOnTheScreen()
    expect(area.creates).toHaveLength(1) // attempted but rejected by the use case
    expect(screen.getByText('Set up your family space')).toBeOnTheScreen()
  })

  it('shows tonight’s question after relaunch without repeating onboarding', async () => {
    await renderShell(
      fakeAuthentication('available', ['authenticated']),
      fakeProtectedArea({ initial: homeWithProfile }),
    )

    expect(await screen.findByText("Tonight's question")).toBeOnTheScreen()
    expect(screen.getByText('What happened today that made you feel proud?')).toBeOnTheScreen()
    expect(screen.queryByText('Set up your family space')).toBeNull()
  })

  it('blocks family storage instead of presenting onboarding when storage is unsafe', async () => {
    const area = fakeProtectedArea({
      initial: { kind: 'storage-blocked', reason: 'version-unsafe' },
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)

    expect(await screen.findByText('Family storage is unavailable')).toBeOnTheScreen()
    expect(
      screen.getByText(/storage version we cannot open safely/),
    ).toBeOnTheScreen()
    expect(screen.queryByText('Set up your family space')).toBeNull()
    expect(area.bootstrapCalls).toBe(1)

    await fireEvent.press(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByText('Family storage is unavailable')).toBeOnTheScreen()
  })

  it('requests permission only after the parent chooses to record, then saves a manual transcript', async () => {
    const area = fakeProtectedArea({ initial: homeWithProfile, permission: 'unavailable' })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    // No manual entry is shown until the parent chooses to record.
    expect(screen.queryByText('No voice was captured')).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    expect(screen.getByText('A quick check first')).toBeOnTheScreen()
    expect(screen.getByText(/asks for the microphone only when you choose to record/)).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('No voice was captured')).toBeOnTheScreen()

    const input = screen.getByLabelText('Their answer in writing')
    await fireEvent.changeText(input, '  I made my bed all by myself.  ')
    await fireEvent.press(screen.getByRole('button', { name: 'Save transcript' }))

    expect(await screen.findByText('Saved')).toBeOnTheScreen()
    expect(area.savedManual).toHaveLength(1)
    expect(area.savedManual[0]).toEqual({
      transcript: '  I made my bed all by myself.  ',
      recordingWasAvailable: false,
    })
    // A completed save cannot be submitted twice from the same review state.
    expect(screen.queryByRole('button', { name: 'Save transcript' })).toBeNull()
  })

  it('does not expose a text-only bypass when microphone capture is ready', async () => {
    const area = fakeProtectedArea({ initial: homeWithProfile, permission: 'granted' })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Microphone is ready')).toBeOnTheScreen()
    expect(screen.queryByText('No voice was captured')).toBeNull()
    expect(screen.queryByLabelText('Their answer in writing')).toBeNull()
    expect(area.savedManual).toHaveLength(0)
  })

  it('shows saved memories newest first in the timeline', async () => {
    const older = memoryEntry('older', '2026-08-10', 'I saw a rainbow.')
    const newer = memoryEntry('newer', '2026-08-11', 'I made my bed by myself.')
    const area = fakeProtectedArea({ initial: homeWithProfile, memories: [older, newer] })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'View 2 memories' }))

    expect(await screen.findByText('Mila\'s memories')).toBeOnTheScreen()
    expect(screen.getByText('August 11, 2026')).toBeOnTheScreen()
    expect(screen.getByText('“I made my bed by myself.”')).toBeOnTheScreen()
    expect(screen.getByText('“I saw a rainbow.”')).toBeOnTheScreen()
  })

  it('shows an empty timeline state that returns to tonight', async () => {
    const area = fakeProtectedArea({ initial: homeWithProfile })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'View memories' }))
    expect(await screen.findByText('No memories yet')).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: "Answer tonight's question" }))
    expect(await screen.findByText('What happened today that made you feel proud?')).toBeOnTheScreen()
  })

  it('shows a timeline read failure as an explicit error with retry, never an empty state', async () => {
    const newer = memoryEntry('newer', '2026-08-11', 'I made my bed by myself.')
    const area = fakeProtectedArea({
      initial: homeWithProfile,
      memories: [newer],
      timelineFailures: 1,
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'View memories' }))
    expect(await screen.findByText("Couldn't load your memories")).toBeOnTheScreen()
    expect(screen.queryByText('No memories yet')).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('“I made my bed by myself.”')).toBeOnTheScreen()
  })
  it('shows an unexpected bootstrap failure as a blocked state and recovers on retry', async () => {
    const area = fakeProtectedArea({ initial: homeWithProfile, bootstrapFailures: 1 })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)

    expect(await screen.findByText('Family storage is unavailable')).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByText('What happened today that made you feel proud?')).toBeOnTheScreen()
    expect(area.bootstrapCalls).toBe(2)
  })
})

function memoryEntry(id: string, localDate: string, transcript: string): MemoryEntryV1 {
  return {
    id,
    kind: 'text-only',
    promptSnapshot: {
      promptId: '6-8-memory-proud',
      question: 'What happened today that made you feel proud?',
      followUp: 'What did you do to make it happen?',
      ageBand: '6-8',
    },
    reviewedTranscript: transcript,
    capturedAt: '2026-08-11T20:00:00.000Z',
    savedAt: '2026-08-11T20:00:00.000Z',
    localDate,
    timeZone: 'UTC',
    media: null,
  }
}