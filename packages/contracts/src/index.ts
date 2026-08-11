import type { AgeBand } from '@before-they-grow/domain'

export const localPersistenceContractVersion = 1 as const

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
