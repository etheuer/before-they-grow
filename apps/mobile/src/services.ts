import { Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import {
  createProfile,
  loadMemoryTimeline,
  loadProtectedHomeState,
  saveManualMemory,
  type CreateProfileInput,
  type CreateProfileResult,
  type MemoryRepositoryPort,
  type ProfileRepositoryPort,
  type ProtectedHomeState,
  type RecordingPermissionPort,
  type RecordingPermissionState,
  type SaveManualMemoryInput,
  type SaveManualMemoryResult,
} from '@before-they-grow/application'
import {
  profileDatabaseFileNameV1,
  profileUserVersion,
  type MemoryEntryV1,
} from '@before-they-grow/contracts'
import { createAndroidBackupExclusion, createIosBackupExclusion } from './adapters/backupExclusion'
import { createExpoRecordingPermissionPort } from './adapters/expoRecordingPermission'
import { createExpoSqliteProfileClient } from './adapters/expoSqliteClient'
import { createSqliteMemoryRepository } from './adapters/sqliteMemoryRepository'
import { createSqliteProfileRepository } from './adapters/sqliteProfileRepository'

export type ProtectedAreaServices = {
  /** Opens and verifies family storage, then returns the protected-area state. */
  bootstrap(date?: Date): Promise<ProtectedHomeState>
  /** Creates the single profile after onboarding consent. */
  createProfile(input: CreateProfileInput, date?: Date): Promise<CreateProfileResult>
  /** Requests microphone permission only after the parent chooses to record. */
  requestRecordingPermission(): Promise<RecordingPermissionState>
  /** Saves a Manual transcript memory when voice capture was unavailable. */
  saveManualMemory(input: SaveManualMemoryInput): Promise<SaveManualMemoryResult>
  /** Loads saved Local-only memories newest first. */
  loadMemoryTimeline(): Promise<MemoryEntryV1[]>
}

type RepositorySet = {
  profile: ProfileRepositoryPort
  memory: MemoryRepositoryPort
}

/**
 * Composition root. All Expo/native adapters are wired here and only here;
 * screens depend on the application-use-case boundary and never on Expo APIs.
 */
export function createProtectedAreaServices(
  now: () => Date = () => new Date(),
): ProtectedAreaServices {
  let repositorySet: RepositorySet | null = null
  let opening: Promise<RepositorySet> | null = null

  const getRepositorySet = (): Promise<RepositorySet> => {
    if (repositorySet) return Promise.resolve(repositorySet)
    if (!opening) {
      opening = (async () => {
        const client = createExpoSqliteProfileClient()
        const exclusion =
          Platform.OS === 'ios'
            ? createIosBackupExclusion()
            : createAndroidBackupExclusion()
        const profile = createSqliteProfileRepository({
          client,
          exclusion,
          userVersion: profileUserVersion,
          expectedDatabaseFileName: profileDatabaseFileNameV1,
        })
        const memory = createSqliteMemoryRepository(client)
        repositorySet = { profile, memory }
        return repositorySet
      })()
    }
    return opening
  }

  const permission: RecordingPermissionPort = createExpoRecordingPermissionPort()

  return {
    async bootstrap(date = now()) {
      const { profile } = await getRepositorySet()
      return loadProtectedHomeState({ repository: profile }, date)
    },

    async createProfile(input, date = now()) {
      const { profile } = await getRepositorySet()
      return createProfile({ repository: profile, generateId: () => Crypto.randomUUID() }, input, date)
    },

    async requestRecordingPermission() {
      return permission.requestPermission()
    },

    async saveManualMemory(input) {
      const { memory } = await getRepositorySet()
      return saveManualMemory(
        { repository: memory, generateId: () => Crypto.randomUUID() },
        input,
      )
    },

    async loadMemoryTimeline() {
      const { memory } = await getRepositorySet()
      return loadMemoryTimeline({ repository: memory })
    },
  }
}