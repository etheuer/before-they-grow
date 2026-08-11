import { describe, expect, it } from 'vitest'
import {
  AppLockCoordinator,
  type ApplicationLifecyclePort,
  type ApplicationLifecycleState,
  type AuthenticationPort,
  type AuthenticationResult,
  type CredentialAvailability,
} from './appLock'

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

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
}

function authenticationPort(
  availability: CredentialAvailability | Promise<CredentialAvailability>,
  authenticate: () => Promise<AuthenticationResult>,
): AuthenticationPort {
  return {
    getCredentialAvailability: async () => availability,
    authenticate,
  }
}

describe('App lock', () => {
  it('keeps the protected area obscured until authentication succeeds', async () => {
    const result = deferred<AuthenticationResult>()
    const coordinator = new AppLockCoordinator(
      authenticationPort('available', () => result.promise),
      new FakeLifecycle(),
    )

    expect(coordinator.getSnapshot()).toBe('obscured')
    coordinator.start()
    expect(coordinator.getSnapshot()).toBe('authenticating')
    await settle()
    expect(coordinator.getSnapshot()).not.toBe('unlocked')

    result.resolve('authenticated')
    await settle()
    expect(coordinator.getSnapshot()).toBe('unlocked')
  })

  it('requires device security setup when no usable credential exists', async () => {
    let authenticationWasAttempted = false
    const coordinator = new AppLockCoordinator(
      authenticationPort('unavailable', async () => {
        authenticationWasAttempted = true
        return 'authenticated'
      }),
      new FakeLifecycle(),
    )

    coordinator.start()
    await settle()

    expect(coordinator.getSnapshot()).toBe('setup-required')
    expect(authenticationWasAttempted).toBe(false)
    coordinator.retry()
    await settle()
    expect(coordinator.getSnapshot()).toBe('setup-required')
  })

  it.each(['cancelled', 'failed'] as const)(
    'stays locked after authentication is %s and can safely retry',
    async (firstResult) => {
      const results: AuthenticationResult[] = [firstResult, 'authenticated']
      const coordinator = new AppLockCoordinator(
        authenticationPort('available', async () => results.shift() ?? 'failed'),
        new FakeLifecycle(),
      )

      coordinator.start()
      await settle()
      expect(coordinator.getSnapshot()).toBe('locked')

      coordinator.retry()
      expect(coordinator.getSnapshot()).toBe('authenticating')
      await settle()
      expect(coordinator.getSnapshot()).toBe('unlocked')
    },
  )

  it.each(['inactive', 'background'] as const)(
    'immediately obscures protected content on an %s transition',
    async (nextState) => {
      const lifecycle = new FakeLifecycle()
      const coordinator = new AppLockCoordinator(
        authenticationPort('available', async () => 'authenticated'),
        lifecycle,
      )
      coordinator.start()
      await settle()
      expect(coordinator.getSnapshot()).toBe('unlocked')

      lifecycle.transitionTo(nextState)

      expect(coordinator.getSnapshot()).toBe('obscured')
    },
  )

  it('requires a fresh authentication after returning to active', async () => {
    const secondResult = deferred<AuthenticationResult>()
    const results: Array<AuthenticationResult | Promise<AuthenticationResult>> = [
      'authenticated',
      secondResult.promise,
    ]
    const lifecycle = new FakeLifecycle()
    const coordinator = new AppLockCoordinator(
      authenticationPort('available', async () => results.shift() ?? 'failed'),
      lifecycle,
    )
    coordinator.start()
    await settle()
    expect(coordinator.getSnapshot()).toBe('unlocked')

    lifecycle.transitionTo('inactive')
    lifecycle.transitionTo('active')
    await settle()
    expect(coordinator.getSnapshot()).toBe('authenticating')

    secondResult.resolve('authenticated')
    await settle()
    expect(coordinator.getSnapshot()).toBe('unlocked')
  })

  it('ignores an out-of-order authentication success after a newer attempt starts', async () => {
    const staleResult = deferred<AuthenticationResult>()
    const currentResult = deferred<AuthenticationResult>()
    const attempts = [staleResult.promise, currentResult.promise]
    const lifecycle = new FakeLifecycle()
    const coordinator = new AppLockCoordinator(
      authenticationPort('available', async () => attempts.shift() ?? 'failed'),
      lifecycle,
    )
    coordinator.start()
    await settle()

    lifecycle.transitionTo('background')
    expect(coordinator.getSnapshot()).toBe('obscured')
    lifecycle.transitionTo('active')
    await settle()
    expect(coordinator.getSnapshot()).toBe('authenticating')

    staleResult.resolve('authenticated')
    await settle()
    expect(coordinator.getSnapshot()).toBe('authenticating')

    currentResult.resolve('authenticated')
    await settle()
    expect(coordinator.getSnapshot()).toBe('unlocked')
  })

  it('stays obscured without looping when the system authentication sheet makes the app inactive', async () => {
    const result = deferred<AuthenticationResult>()
    const lifecycle = new FakeLifecycle()
    const coordinator = new AppLockCoordinator(
      authenticationPort('available', () => result.promise),
      lifecycle,
    )
    coordinator.start()
    await settle()

    lifecycle.transitionTo('inactive')
    result.resolve('authenticated')
    await settle()
    expect(coordinator.getSnapshot()).toBe('authenticating')

    lifecycle.transitionTo('active')
    expect(coordinator.getSnapshot()).toBe('unlocked')
  })

  it('requires fresh authentication if the app backgrounds after success under the system sheet', async () => {
    const firstResult = deferred<AuthenticationResult>()
    const freshResult = deferred<AuthenticationResult>()
    const results = [firstResult.promise, freshResult.promise]
    const lifecycle = new FakeLifecycle()
    const coordinator = new AppLockCoordinator(
      authenticationPort('available', async () => results.shift() ?? 'failed'),
      lifecycle,
    )
    coordinator.start()
    await settle()

    lifecycle.transitionTo('inactive')
    firstResult.resolve('authenticated')
    await settle()
    expect(coordinator.getSnapshot()).toBe('authenticating')

    lifecycle.transitionTo('background')
    lifecycle.transitionTo('active')
    await settle()
    expect(coordinator.getSnapshot()).toBe('authenticating')

    freshResult.resolve('authenticated')
    await settle()
    expect(coordinator.getSnapshot()).toBe('unlocked')
  })

  it('waits to authenticate when the application starts in the background', async () => {
    let authenticationWasAttempted = false
    const lifecycle = new FakeLifecycle('background')
    const coordinator = new AppLockCoordinator(
      authenticationPort('available', async () => {
        authenticationWasAttempted = true
        return 'authenticated'
      }),
      lifecycle,
    )

    coordinator.start()
    await settle()
    expect(coordinator.getSnapshot()).toBe('obscured')
    expect(authenticationWasAttempted).toBe(false)

    lifecycle.transitionTo('active')
    await settle()
    expect(coordinator.getSnapshot()).toBe('unlocked')
  })

  it('shows setup guidance if the credential disappears before the prompt', async () => {
    const coordinator = new AppLockCoordinator(
      authenticationPort('available', async () => 'credential-unavailable'),
      new FakeLifecycle(),
    )

    coordinator.start()
    await settle()

    expect(coordinator.getSnapshot()).toBe('setup-required')
  })

  it('keeps a transient adapter error recoverably locked', async () => {
    const coordinator = new AppLockCoordinator(
      authenticationPort('available', async () => {
        throw new Error('native prompt unavailable')
      }),
      new FakeLifecycle(),
    )

    coordinator.start()
    await settle()

    expect(coordinator.getSnapshot()).toBe('locked')
  })

  it('does not overlap retries with an authentication already in progress', async () => {
    const result = deferred<AuthenticationResult>()
    let attempts = 0
    const coordinator = new AppLockCoordinator(
      authenticationPort('available', () => {
        attempts += 1
        return result.promise
      }),
      new FakeLifecycle(),
    )

    coordinator.start()
    await settle()
    coordinator.retry()
    coordinator.start()
    await settle()

    expect(coordinator.getSnapshot()).toBe('authenticating')
    expect(attempts).toBe(1)
  })

  it('notifies visible status subscribers and honors unsubscription', async () => {
    const lifecycle = new FakeLifecycle()
    const coordinator = new AppLockCoordinator(
      authenticationPort('available', async () => 'authenticated'),
      lifecycle,
    )
    const observed: string[] = []
    const unsubscribe = coordinator.subscribe(() => {
      observed.push(coordinator.getSnapshot())
    })

    coordinator.start()
    await settle()
    expect(observed).toEqual(['authenticating', 'unlocked'])

    unsubscribe()
    lifecycle.transitionTo('inactive')
    expect(coordinator.getSnapshot()).toBe('obscured')
    expect(observed).toEqual(['authenticating', 'unlocked'])
  })

  it('ignores a late success after the boundary is stopped', async () => {
    const result = deferred<AuthenticationResult>()
    const coordinator = new AppLockCoordinator(
      authenticationPort('available', () => result.promise),
      new FakeLifecycle(),
    )
    coordinator.start()
    await settle()

    coordinator.stop()
    result.resolve('authenticated')
    await settle()

    expect(coordinator.getSnapshot()).toBe('obscured')
  })
})
