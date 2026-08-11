import { AppState, type AppStateStatus } from 'react-native'
import type {
  ApplicationLifecyclePort,
  ApplicationLifecycleState,
} from '@before-they-grow/application'

export function mapAppState(
  state: AppStateStatus | null | undefined,
): ApplicationLifecycleState {
  if (state === 'active') return 'active'
  if (state === 'background') return 'background'
  return 'inactive'
}

export function createExpoLifecyclePort(): ApplicationLifecyclePort {
  return {
    getCurrentState: () => mapAppState(AppState.currentState),
    subscribe(listener) {
      const subscription = AppState.addEventListener('change', (state) => {
        listener(mapAppState(state))
      })
      return () => subscription.remove()
    },
  }
}
