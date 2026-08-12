import {
  AGE_BANDS,
  MAX_CHILD_NICKNAME_LENGTH,
  getPromptForDate,
  type AgeBand,
  type Prompt,
} from '@before-they-grow/domain'
import type { NativeProfileV1 } from '@before-they-grow/contracts'

/**
 * Port for the authoritative, versioned profile catalog. The concrete
 * implementation is a SQLite-backed native adapter; presentation and use cases
 * depend only on this boundary.
 */
export type ProfileRepositoryPort = {
  /** Opens and verifies the catalog. Throws StorageGateError when storage is unsafe. */
  open(): Promise<void>
  /** Releases the catalog. Safe to call more than once. */
  close(): Promise<void>
  /**
   * Persists a profile. Enforces the exactly-one invariant: a second profile
   * is never written.
   */
  create(profile: NativeProfileV1): Promise<'created' | 'already-exists'>
  /** Returns the single profile, or null when none exists yet. */
  findOnly(): Promise<NativeProfileV1 | null>
}

/**
 * Reasons family storage can be declared unsafe. Each maps to a distinct
 * fail-closed gate; none of them present an empty onboarding state.
 */
export type StorageBlockReason =
  | 'version-unsafe'
  | 'integrity-failed'
  | 'root-unsafe'
  | 'backup-control-failed'
  | 'save-indeterminate'

export class StorageGateError extends Error {
  constructor(readonly reason: StorageBlockReason) {
    super(`Family storage is blocked: ${reason}`)
    this.name = 'StorageGateError'
  }
}

export type CreateProfileInput = {
  childNickname: string
  ageBand: AgeBand
  /** The parent or guardian confirms they are an adult. */
  adultConfirmation: boolean
  /** The parent or guardian confirms permission to record every voice they save. */
  recordingPermissionConfirmed: boolean
}

export type CreateProfileResult =
  | { kind: 'created'; profile: NativeProfileV1 }
  | { kind: 'invalid-nickname' }
  | { kind: 'invalid-age-band' }
  | { kind: 'consent-not-given' }
  | { kind: 'already-exists' }

export type CreateProfileDependencies = {
  repository: ProfileRepositoryPort
  generateId: () => string
}

const VALID_AGE_BANDS: readonly AgeBand[] = AGE_BANDS

export async function createProfile(
  deps: CreateProfileDependencies,
  input: CreateProfileInput,
  now: Date,
): Promise<CreateProfileResult> {
  const childNickname = input.childNickname.trim()

  if (childNickname.length === 0 || childNickname.length > MAX_CHILD_NICKNAME_LENGTH) {
    return { kind: 'invalid-nickname' }
  }
  if (!VALID_AGE_BANDS.includes(input.ageBand)) {
    return { kind: 'invalid-age-band' }
  }
  if (!input.adultConfirmation || !input.recordingPermissionConfirmed) {
    return { kind: 'consent-not-given' }
  }

  const createdAt = now.toISOString()
  const profile: NativeProfileV1 = {
    id: deps.generateId(),
    childNickname,
    ageBand: input.ageBand,
    consentedAt: createdAt,
    createdAt,
  }

  const outcome = await deps.repository.create(profile)
  if (outcome === 'already-exists') return { kind: 'already-exists' }
  return { kind: 'created', profile }
}

export type ProtectedHomeState =
  | { kind: 'needs-onboarding' }
  | { kind: 'home'; profile: NativeProfileV1; prompt: Prompt }
  | { kind: 'storage-blocked'; reason: StorageBlockReason }

/**
 * Loads the protected post-App-lock state. A clean empty catalog means
 * onboarding; a verified profile yields tonight's deterministic prompt for the
 * current local day; an unsafe catalog blocks family storage instead of
 * pretending nothing exists.
 */
export async function loadProtectedHomeState(
  deps: { repository: ProfileRepositoryPort },
  now: Date,
): Promise<ProtectedHomeState> {
  try {
    await deps.repository.open()
    const profile = await deps.repository.findOnly()
    if (profile === null) return { kind: 'needs-onboarding' }
    return { kind: 'home', profile, prompt: getPromptForDate(now, profile.ageBand) }
  } catch (error) {
    if (error instanceof StorageGateError) {
      return { kind: 'storage-blocked', reason: error.reason }
    }
    throw error
  }
}