import { AppState, type AppStateStatus } from 'react-native'
import { createExpoLifecyclePort, mapAppState } from './expoLifecycle'

describe('Expo lifecycle adapter', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('keeps active as the only content-visible lifecycle state', () => {
    expect(mapAppState('active')).toBe('active')
    expect(mapAppState('inactive')).toBe('inactive')
    expect(mapAppState('unknown')).toBe('inactive')
    expect(mapAppState(null)).toBe('inactive')
  })

  it('preserves background so in-flight authentication can be invalidated', () => {
    expect(mapAppState('background')).toBe('background')
  })

  it('forwards every native AppState change and removes its subscription', () => {
    let nativeListener!: (state: AppStateStatus) => void
    const remove = jest.fn()
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      nativeListener = listener
      return { remove }
    })
    const observed: string[] = []
    const lifecycle = createExpoLifecyclePort()

    const unsubscribe = lifecycle.subscribe((state) => observed.push(state))
    nativeListener('inactive')
    nativeListener('background')
    nativeListener('active')

    expect(observed).toEqual(['inactive', 'background', 'active'])
    unsubscribe()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
