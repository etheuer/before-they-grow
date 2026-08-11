import { Platform } from 'react-native'
import * as Crypto from 'expo-crypto'
import {
  createProfile,
  loadProtectedHomeState,
  type CreateProfileInput,
  type CreateProfileResult,
  type ProfileRepositoryPort,
  type ProtectedHomeState,
} from '@before-they-grow/application'
import {
  profileDatabaseFileNameV1,
  profileUserVersion,
} from '@before-they-grow/contracts'
import { createAndroidBackupExclusion, createIosBackupExclusion } from './adapters/backupExclusion'
import { createExpoSqliteProfileClient } from './adapters/expoSqliteClient'
import { createSqliteProfileRepository } from './adapters/sqliteProfileRepository'

export type ProtectedAreaServices = {
  /** Opens and verifies family storage, then returns the protected-area state. */
  bootstrap(date?: Date): Promise<ProtectedHomeState>
  /** Creates the single profile after onboarding consent. */
  createProfile(input: CreateProfileInput, date?: Date): Promise<CreateProfileResult>
}

/**
 * Composition root. All Expo/native adapters are wired here and only here;
 * screens depend on the application-use-case boundary and never on Expo APIs.
 */
export function createProtectedAreaServices(
  now: () => Date = () => new Date(),
): ProtectedAreaServices {
  let repository: ProfileRepositoryPort | null = null
  let opening: Promise<ProfileRepositoryPort> | null = null

  const getRepository = (): Promise<ProfileRepositoryPort> => {
    if (repository) return Promise.resolve(repository)
    if (!opening) {
      opening = (async () => {
        const client = createExpoSqliteProfileClient()
        const exclusion =
          Platform.OS === 'ios'
            ? createIosBackupExclusion()
            : createAndroidBackupExclusion()
        repository = createSqliteProfileRepository({
          client,
          exclusion,
          userVersion: profileUserVersion,
          expectedDatabaseFileName: profileDatabaseFileNameV1,
        })
        return repository
      })()
    }
    return opening
  }

  return {
    async bootstrap(date = now()) {
      const repo = await getRepository()
      return loadProtectedHomeState({ repository: repo }, date)
    },

    async createProfile(input, date = now()) {
      const repo = await getRepository()
      return createProfile({ repository: repo, generateId: () => Crypto.randomUUID() }, input, date)
    },
  }
}