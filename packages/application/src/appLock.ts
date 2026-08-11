export type AppLockStatus =
  | 'obscured'
  | 'authenticating'
  | 'locked'
  | 'setup-required'
  | 'unlocked'

export type CredentialAvailability = 'available' | 'unavailable'

export type AuthenticationResult =
  | 'authenticated'
  | 'cancelled'
  | 'failed'
  | 'credential-unavailable'

export type AuthenticationPort = {
  getCredentialAvailability: () => Promise<CredentialAvailability>
  authenticate: () => Promise<AuthenticationResult>
}

export type ApplicationLifecycleState = 'active' | 'inactive' | 'background'

export type ApplicationLifecyclePort = {
  getCurrentState: () => ApplicationLifecycleState
  subscribe: (
    listener: (state: ApplicationLifecycleState) => void,
  ) => () => void
}

/**
 * Owns the fail-closed application-authentication boundary.
 *
 * It deliberately exposes only the state presentation needs. Authentication
 * results are session-only, and a lifecycle generation prevents a stale native
 * prompt from revealing protected content after the application was backgrounded.
 */
export class AppLockCoordinator {
  private status: AppLockStatus = 'obscured'
  private lifecycleState: ApplicationLifecycleState = 'inactive'
  private listeners = new Set<() => void>()
  private unsubscribeFromLifecycle: (() => void) | undefined
  private generation = 0
  private started = false
  private authenticationInFlight = false
  private authenticatedWhileInactive = false
  private reauthenticateOnActive = false

  constructor(
    private readonly authentication: AuthenticationPort,
    private readonly lifecycle: ApplicationLifecyclePort,
  ) {}

  getSnapshot = (): AppLockStatus => this.status

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start = () => {
    if (this.started) return
    this.started = true
    this.lifecycleState = this.lifecycle.getCurrentState()
    this.unsubscribeFromLifecycle = this.lifecycle.subscribe(
      this.handleLifecycleChange,
    )

    if (this.lifecycleState === 'active') {
      void this.requestAuthentication()
    } else {
      this.reauthenticateOnActive = true
      this.setStatus('obscured')
    }
  }

  stop = () => {
    if (!this.started) return
    this.started = false
    this.generation += 1
    this.authenticationInFlight = false
    this.authenticatedWhileInactive = false
    this.reauthenticateOnActive = false
    this.unsubscribeFromLifecycle?.()
    this.unsubscribeFromLifecycle = undefined
    this.setStatus('obscured')
  }

  retry = () => {
    if (
      !this.started
      || this.lifecycleState !== 'active'
      || this.authenticationInFlight
      || this.status === 'unlocked'
    ) {
      return
    }
    void this.requestAuthentication()
  }

  private handleLifecycleChange = (state: ApplicationLifecycleState) => {
    const previousState = this.lifecycleState
    this.lifecycleState = state

    if (state === 'background') {
      this.invalidateAuthentication()
      this.reauthenticateOnActive = true
      this.setStatus('obscured')
      return
    }

    if (state === 'inactive') {
      if (this.status === 'unlocked') {
        this.invalidateAuthentication()
        this.reauthenticateOnActive = true
        this.setStatus('obscured')
      }
      return
    }

    if (previousState === 'active') return

    if (this.authenticatedWhileInactive) {
      this.authenticatedWhileInactive = false
      this.authenticationInFlight = false
      this.reauthenticateOnActive = false
      this.setStatus('unlocked')
      return
    }

    if (this.reauthenticateOnActive && !this.authenticationInFlight) {
      this.reauthenticateOnActive = false
      void this.requestAuthentication()
    }
  }

  private invalidateAuthentication() {
    this.generation += 1
    this.authenticationInFlight = false
    this.authenticatedWhileInactive = false
  }

  private async requestAuthentication() {
    const requestGeneration = ++this.generation
    this.authenticationInFlight = true
    this.authenticatedWhileInactive = false
    this.setStatus('authenticating')

    try {
      const availability = await this.authentication.getCredentialAvailability()
      if (!this.isCurrent(requestGeneration)) return

      if (availability === 'unavailable') {
        this.authenticationInFlight = false
        this.setStatus('setup-required')
        return
      }

      const result = await this.authentication.authenticate()
      if (!this.isCurrent(requestGeneration)) return

      if (result === 'credential-unavailable') {
        this.authenticationInFlight = false
        this.setStatus('setup-required')
        return
      }

      if (result !== 'authenticated') {
        this.authenticationInFlight = false
        this.setStatus('locked')
        return
      }

      if (this.lifecycleState === 'active') {
        this.authenticationInFlight = false
        this.setStatus('unlocked')
      } else if (this.lifecycleState === 'inactive') {
        this.authenticatedWhileInactive = true
      }
    } catch {
      if (!this.isCurrent(requestGeneration)) return
      this.authenticationInFlight = false
      this.setStatus('locked')
    }
  }

  private isCurrent(requestGeneration: number) {
    return this.started && requestGeneration === this.generation
  }

  private setStatus(status: AppLockStatus) {
    if (this.status === status) return
    this.status = status
    for (const listener of this.listeners) listener()
  }
}
