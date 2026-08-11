import { describe, expect, it } from 'vitest'
import {
  StorageGateError,
  createProfile,
  loadProtectedHomeState,
  type CreateProfileInput,
  type ProfileRepositoryPort,
} from './profile'
import type { NativeProfileV1 } from '@before-they-grow/contracts'

function fakeRepository(initial: NativeProfileV1[] = []) {
  const repo: ProfileRepositoryPort & {
    profiles: NativeProfileV1[]
    opened: boolean
    closed: boolean
    openFailure: Error | null
  } = {
    profiles: [...initial],
    opened: false,
    closed: false,
    openFailure: null,
    async open() {
      if (repo.openFailure) throw repo.openFailure
      repo.opened = true
    },
    async close() {
      repo.closed = true
    },
    async create(profile) {
      if (repo.profiles.length > 0) return 'already-exists'
      repo.profiles.push(profile)
      return 'created'
    },
    async findOnly() {
      return repo.profiles[0] ?? null
    },
  }
  return repo
}

const validInput: CreateProfileInput = {
  childNickname: '  Mila  ',
  ageBand: '6-8',
  adultConfirmation: true,
  recordingPermissionConfirmed: true,
}

const repository = () => fakeRepository()

describe('createProfile', () => {
  it('creates exactly one profile from valid consent input, trimming the nickname', async () => {
    const repo = repository()
    const result = await createProfile(
      { repository: repo, generateId: () => 'profile-abc' },
      validInput,
      new Date('2026-08-11T22:05:00Z'),
    )

    expect(result).toEqual({
      kind: 'created',
      profile: {
        id: 'profile-abc',
        childNickname: 'Mila',
        ageBand: '6-8',
        consentedAt: '2026-08-11T22:05:00.000Z',
        createdAt: '2026-08-11T22:05:00.000Z',
      },
    })
    expect(repo.profiles).toHaveLength(1)
  })

  it.each([
    ['   ', 'whitespace only'],
    ['', 'empty'],
  ])('does not create a profile for a %s nickname', async (nickname) => {
    const repo = repository()
    const result = await createProfile(
      { repository: repo, generateId: () => 'x' },
      { ...validInput, childNickname: nickname },
      new Date(),
    )

    expect(result).toEqual({ kind: 'invalid-nickname' })
    expect(repo.profiles).toHaveLength(0)
  })

  it('rejects a nickname longer than 40 characters', async () => {
    const repo = repository()
    const result = await createProfile(
      { repository: repo, generateId: () => 'x' },
      { ...validInput, childNickname: 'n'.repeat(41) },
      new Date(),
    )

    expect(result).toEqual({ kind: 'invalid-nickname' })
    expect(repo.profiles).toHaveLength(0)
  })

  it('accepts a 40-character trimmed nickname', async () => {
    const repo = repository()
    const result = await createProfile(
      { repository: repo, generateId: () => 'x' },
      { ...validInput, childNickname: 'm'.repeat(40) },
      new Date(),
    )

    expect(result.kind).toBe('created')
  })

  it.each(['3-5', '6-8', '9-12'] as const)(
    'accepts the age band %s',
    async (ageBand) => {
      const repo = repository()
      const result = await createProfile(
        { repository: repo, generateId: () => 'x' },
        { ...validInput, ageBand },
        new Date(),
      )

      expect(result.kind).toBe('created')
    },
  )

  it('rejects an unknown age band', async () => {
    const repo = repository()
    const result = await createProfile(
      { repository: repo, generateId: () => 'x' },
      { ...validInput, ageBand: '13-17' as never },
      new Date(),
    )

    expect(result).toEqual({ kind: 'invalid-age-band' })
    expect(repo.profiles).toHaveLength(0)
  })

  it('requires adult confirmation and recording permission', async () => {
    const lackingAdult = await createProfile(
      { repository: repository(), generateId: () => 'x' },
      { ...validInput, adultConfirmation: false },
      new Date(),
    )
    const lackingRecordPermission = await createProfile(
      { repository: repository(), generateId: () => 'x' },
      { ...validInput, recordingPermissionConfirmed: false },
      new Date(),
    )
    const lackingBoth = await createProfile(
      { repository: repository(), generateId: () => 'x' },
      { ...validInput, adultConfirmation: false, recordingPermissionConfirmed: false },
      new Date(),
    )

    expect(lackingAdult).toEqual({ kind: 'consent-not-given' })
    expect(lackingRecordPermission).toEqual({ kind: 'consent-not-given' })
    expect(lackingBoth).toEqual({ kind: 'consent-not-given' })
  })

  it('never creates a second profile when one already exists', async () => {
    const existing: NativeProfileV1 = {
      id: 'first',
      childNickname: 'Milo',
      ageBand: '3-5',
      consentedAt: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
    }
    const repo = fakeRepository([existing])
    const result = await createProfile(
      { repository: repo, generateId: () => 'second' },
      { ...validInput, childNickname: 'Another' },
      new Date(),
    )

    expect(result).toEqual({ kind: 'already-exists' })
    expect(repo.profiles).toHaveLength(1)
  })
})

describe('loadProtectedHomeState', () => {
  it('reports needs-onboarding when the catalog opens cleanly with no profile', async () => {
    const repo = repository()
    const state = await loadProtectedHomeState({ repository: repo }, new Date())

    expect(state).toEqual({ kind: 'needs-onboarding' })
    expect(repo.opened).toBe(true)
  })

  it('returns the saved profile and a prompt for the current local day', async () => {
    const profile: NativeProfileV1 = {
      id: 'profile-1',
      childNickname: 'Mila',
      ageBand: '6-8',
      consentedAt: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
    }
    const repo = fakeRepository([profile])
    const state = await loadProtectedHomeState(
      { repository: repo },
      new Date('2026-08-11T22:05:00Z'),
    )

    expect(state.kind).toBe('home')
    if (state.kind !== 'home') return
    expect(state.profile).toEqual(profile)
    expect(state.prompt.ageBand).toBe('6-8')
    expect(state.prompt.question.length).toBeGreaterThan(10)
    expect(state.prompt.followUp.length).toBeGreaterThan(3)
  })

  it('keeps the same prompt for two opens on the same local day', async () => {
    const profile: NativeProfileV1 = {
      id: 'profile-1',
      childNickname: 'Mila',
      ageBand: '6-8',
      consentedAt: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
    }
    const morning = await loadProtectedHomeState(
      { repository: fakeRepository([profile]) },
      new Date('2026-08-11T08:00:00Z'),
    )
    const evening = await loadProtectedHomeState(
      { repository: fakeRepository([profile]) },
      new Date('2026-08-11T21:00:00Z'),
    )

    expect(morning.kind).toBe('home')
    expect(evening.kind).toBe('home')
    if (morning.kind !== 'home' || evening.kind !== 'home') return
    expect(evening.prompt.id).toBe(morning.prompt.id)
  })

  it('rotates to a different prompt when the local day advances', async () => {
    const profile: NativeProfileV1 = {
      id: 'profile-1',
      childNickname: 'Mila',
      ageBand: '6-8',
      consentedAt: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-08-01T00:00:00.000Z',
    }
    const today = await loadProtectedHomeState(
      { repository: fakeRepository([profile]) },
      new Date('2026-08-11T20:00:00Z'),
    )
    const tomorrow = await loadProtectedHomeState(
      { repository: fakeRepository([profile]) },
      new Date('2026-08-12T20:00:00Z'),
    )

    expect(today.kind).toBe('home')
    expect(tomorrow.kind).toBe('home')
    if (today.kind !== 'home' || tomorrow.kind !== 'home') return
    expect(tomorrow.prompt.id).not.toBe(today.prompt.id)
  })

  it('blocks family storage instead of offering onboarding when storage is unsafe', async () => {
    const repo = repository()
    repo.openFailure = new StorageGateError('version-unsafe')

    const state = await loadProtectedHomeState({ repository: repo }, new Date())

    expect(state).toEqual({ kind: 'storage-blocked', reason: 'version-unsafe' })
  })

  it('surfaces each storage gate reason unchanged', async () => {
    const reasons = [
      'version-unsafe',
      'integrity-failed',
      'root-unsafe',
      'backup-control-failed',
    ] as const
    for (const reason of reasons) {
      const repo = repository()
      repo.openFailure = new StorageGateError(reason)
      const state = await loadProtectedHomeState({ repository: repo }, new Date())
      expect(state).toEqual({ kind: 'storage-blocked', reason })
    }
  })

  it('does not catch unrelated errors as storage-blocked', async () => {
    const repo = repository()
    repo.openFailure = new Error('boom')

    await expect(loadProtectedHomeState({ repository: repo }, new Date())).rejects.toThrow(
      'boom',
    )
  })
})