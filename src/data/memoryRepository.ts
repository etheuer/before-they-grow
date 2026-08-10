import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { AgeBand } from '../domain/prompts'

export type FamilyProfile = {
  childName: string
  ageBand: AgeBand
  consentedAt: string
}

export type MemoryEntry = {
  id: string
  promptId: string
  question: string
  answerText: string
  audio: Blob | null
  recordedAt: string
}

interface BeforeTheyGrowDatabase extends DBSchema {
  profiles: {
    key: string
    value: FamilyProfile
  }
  memories: {
    key: string
    value: MemoryEntry
    indexes: { 'by-recorded-at': string }
  }
}

export type MemoryRepository = {
  getProfile: () => Promise<FamilyProfile | null>
  saveProfile: (profile: FamilyProfile) => Promise<void>
  addMemory: (memory: MemoryEntry) => Promise<void>
  listMemories: () => Promise<MemoryEntry[]>
  deleteAll: () => Promise<void>
  close: () => void
}

export function createMemoryRepository(
  databaseName = 'before-they-grow',
): MemoryRepository {
  let database: Promise<IDBPDatabase<BeforeTheyGrowDatabase>> | null = null

  function getDatabase(): Promise<IDBPDatabase<BeforeTheyGrowDatabase>> {
    if (database) return database

    try {
      const pendingDatabase = openDB<BeforeTheyGrowDatabase>(databaseName, 1, {
        upgrade(db) {
          db.createObjectStore('profiles')
          const memories = db.createObjectStore('memories', { keyPath: 'id' })
          memories.createIndex('by-recorded-at', 'recordedAt')
        },
      })
      database = pendingDatabase
      void pendingDatabase.catch(() => {
        if (database === pendingDatabase) database = null
      })
      return pendingDatabase
    } catch (error) {
      return Promise.reject(error)
    }
  }

  return {
    async getProfile() {
      const db = await getDatabase()
      return (await db.get('profiles', 'family')) ?? null
    },

    async saveProfile(profile) {
      const db = await getDatabase()
      await db.put('profiles', profile, 'family')
    },

    async addMemory(memory) {
      const db = await getDatabase()
      await db.put('memories', memory)
    },

    async listMemories() {
      const db = await getDatabase()
      const memories = await db.getAll('memories')
      return memories.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
    },

    async deleteAll() {
      const db = await getDatabase()
      const transaction = db.transaction(['profiles', 'memories'], 'readwrite')
      await Promise.all([
        transaction.objectStore('profiles').clear(),
        transaction.objectStore('memories').clear(),
        transaction.done,
      ])
    },

    close() {
      const pendingDatabase = database
      database = null
      if (pendingDatabase) {
        void pendingDatabase.then((db) => db.close()).catch(() => {
          // A failed open has no database handle to close.
        })
      }
    },
  }
}
