import { createFamilyWipePort } from './familyWipe'

function fakeStore() {
  const state = {
    marker: false,
    family: new Set(['profile-v1.db', 'media/voice.m4a']),
    cacheCleaned: false,
    closed: false,
    failAt: null as 'wipe' | 'verify' | null,
  }
  return {
    state,
    port: createFamilyWipePort({
      async closeCatalog() {
        state.closed = true
      },
      store: {
        async markerPresent() {
          return state.marker
        },
        async writeMarker() {
          state.marker = true
        },
        async clearMarker() {
          state.marker = false
        },
        async wipeFamilyContent() {
          if (state.failAt === 'wipe') throw new Error('wipe failed')
          state.family.clear()
        },
        async verifyWiped() {
          if (state.failAt === 'verify') throw new Error('verify failed')
          return state.family.size === 0
        },
      },
      async cleanCache() {
        state.cacheCleaned = true
      },
    }),
  }
}

describe('createFamilyWipePort', () => {
  it('closes the catalog, wipes family files, and cleans capture cache', async () => {
    const { port, state } = fakeStore()
    await port.writeMarker()
    await port.closeCatalog()
    await port.wipeFamilyContent()

    expect(state.closed).toBe(true)
    expect([...state.family]).toEqual([])
    expect(state.cacheCleaned).toBe(true)
    expect(await port.verifyWiped()).toBe(true)
    await port.clearMarker()
    expect(await port.markerPresent()).toBe(false)
  })

  it('surfaces a wipe failure without clearing the marker', async () => {
    const { port, state } = fakeStore()
    state.marker = true
    state.failAt = 'wipe'

    await expect(port.wipeFamilyContent()).rejects.toThrow('wipe failed')
    expect(state.marker).toBe(true)
    expect(state.family.size).toBeGreaterThan(0)
  })
})
