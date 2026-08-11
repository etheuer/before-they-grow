import type { AgeBand } from '@before-they-grow/domain'

export const localPersistenceContractVersion = 1 as const

/**
 * Version of the SQLite profile catalog schema (tables, columns, constraints).
 */
export const profileSchemaVersion = 1 as const

/**
 * Version of the on-disk layout under the canonical storage root
 * (directory arrangement and media-resource naming policy).
 */
export const profileLayoutVersion = 1 as const

/**
 * Version carried in SQLite's `PRAGMA user_version` for the profile database.
 * A database whose user_version does not match the schema version is refused
 * rather than interpreted.
 */
export const profileUserVersion = 1 as const

/**
 * Canonical file name of the v1 profile catalog. The layout and contract
 * versions are encoded here: any other name under the family storage root is
 * rejected as a version-unsafe catalog.
 */
export const profileDatabaseFileNameV1 = 'profile-v1.db' as const

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

/**
 * One row of the v1 profile catalog. The id is an opaque identifier generated
 * at creation time; child data never appears in filenames or preferences.
 */
export type ProfileRowV1 = NativeProfileV1
