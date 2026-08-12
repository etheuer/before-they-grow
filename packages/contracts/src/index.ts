import type { AgeBand } from '@before-they-grow/domain'

export const localPersistenceContractVersion = 1 as const

/**
 * Version carried in SQLite's `PRAGMA user_version` for the profile database.
 * A database whose user_version does not match the schema version is refused
 * rather than interpreted. The contract and layout versions for v1 are
 * enforced structurally: the canonical database file name encodes layout, and
 * the carried schema is verified by table presence (see the mobile catalog).
 */
export const profileUserVersion = 1 as const

/**
 * Canonical file name of the v1 profile catalog. The layout and contract
 * versions are encoded here: any other name under the family storage root is
 * rejected as a version-unsafe catalog.
 */
export const profileDatabaseFileNameV1 = 'profile-v1.db' as const

/**
 * The kind of content a Local-only memory holds. Version 1 ships text-only
 * memories (entered when voice capture was unavailable); media-backed
 * memories arrive with the native voice slice.
 */
export type MemoryContentKind = 'text-only'

/**
 * Immutable snapshot of the prompt and age band at the time a memory was
 * made, so later prompt edits never rewrite the family record.
 */
export type PromptSnapshotV1 = {
  promptId: string
  question: string
  followUp: string
  ageBand: AgeBand
}

/**
 * One row of the v1 memory catalog. A text-only memory has no media
 * reference; its reviewed transcript is always nonblank.
 */
export type MemoryEntryV1 = {
  id: string
  kind: MemoryContentKind
  promptSnapshot: PromptSnapshotV1
  reviewedTranscript: string
  capturedAt: string
  savedAt: string
  localDate: string
  timeZone: string
  media: null
}

export type NativeProfileV1 = {
  id: string
  childNickname: string
  ageBand: AgeBand
  consentedAt: string
  createdAt: string
}

export type ManagedMediaReferenceV1 = {
  relativePath: string
  byteCount: number
  sha256: string
}
