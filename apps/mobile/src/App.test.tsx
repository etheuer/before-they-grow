import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import type {
  ApplicationLifecyclePort,
  ApplicationLifecycleState,
  AuthenticationPort,
  AuthenticationResult,
  CredentialAvailability,
} from '@before-they-grow/application'
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

async function renderShell(
  authentication: AuthenticationPort,
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
        openDeviceSettings={async () => undefined}
      />
    </SafeAreaProvider>,
  )
  return lifecycle
}

describe('locked native shell', () => {
  it('does not mount protected family content before authentication succeeds', async () => {
    const result = deferred<AuthenticationResult>()
    await renderShell(fakeAuthentication('available', [result.promise]))

    expect(screen.queryByText('Your family space is unlocked')).toBeNull()
    expect(await screen.findByText('Unlock Before They Grow')).toBeOnTheScreen()

    await act(async () => result.resolve('authenticated'))

    expect(await screen.findByText('Your family space is unlocked')).toBeOnTheScreen()
  })

  it('keeps protected content absent after cancellation and offers a safe retry', async () => {
    const cancellation = deferred<AuthenticationResult>()
    const retryResult = deferred<AuthenticationResult>()
    await renderShell(fakeAuthentication('available', [cancellation.promise, retryResult.promise]))
    await act(async () => cancellation.resolve('cancelled'))

    expect(await screen.findByText('Your family space is still locked')).toBeOnTheScreen()
    expect(screen.queryByText('Your family space is unlocked')).toBeNull()
    const retry = screen.getByRole('button', { name: 'Try again' })
    await act(async () => {
      fireEvent.press(retry)
      retryResult.resolve('authenticated')
    })

    expect(await screen.findByText('Your family space is unlocked')).toBeOnTheScreen()
  })

  it('shows device-security setup guidance without entering the protected area', async () => {
    await renderShell(fakeAuthentication('unavailable', []))

    expect(await screen.findByText('Protect this phone first')).toBeOnTheScreen()
    expect(screen.getByText(/Set up a device passcode, PIN, or pattern/)).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Open device settings' })).toBeOnTheScreen()
    expect(screen.queryByText('Your family space is unlocked')).toBeNull()
  })

  it.each(['inactive', 'background'] as const)(
    'removes protected content immediately when the application becomes %s',
    async (nextState) => {
      const firstAuthentication = deferred<AuthenticationResult>()
      const nextAuthentication = deferred<AuthenticationResult>()
      const lifecycle = await renderShell(
        fakeAuthentication('available', [firstAuthentication.promise, nextAuthentication.promise]),
      )
      await act(async () => firstAuthentication.resolve('authenticated'))
      expect(await screen.findByText('Your family space is unlocked')).toBeOnTheScreen()

      await act(async () => lifecycle.transitionTo(nextState))

      expect(screen.queryByText('Your family space is unlocked')).toBeNull()
      expect(screen.getByText('Your family space is locked')).toBeOnTheScreen()

      await act(async () => lifecycle.transitionTo('active'))
      await waitFor(() => {
        expect(screen.queryByText('Your family space is unlocked')).toBeNull()
      })
      await act(async () => nextAuthentication.resolve('authenticated'))
      expect(await screen.findByText('Your family space is unlocked')).toBeOnTheScreen()
    },
  )
})
