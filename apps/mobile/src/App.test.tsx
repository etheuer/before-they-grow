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
} = {}): ProtectedAreaServices & {
  creates: CreateProfileInput[]
  bootstrapCalls: number
} {
  const state = {
    creates: [] as CreateProfileInput[],
    bootstrapCalls: 0,
  }
  return {
    creates: state.creates,
    get bootstrapCalls() {
      return state.bootstrapCalls
    },
    async bootstrap() {
      state.bootstrapCalls += 1
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
})