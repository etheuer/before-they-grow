import {
  SaveBoundaryError,
  SaveCapacityError,
  SaveIndeterminateError,
  StorageGateError,
  type MemoryRepositoryPort,
  type SaveJournalPort,
  type SaveJournalPrepareResult,
  type SaveOperationRecord,
} from '@before-they-grow/application'
import type { MemoryEntryV1, ManagedMediaReferenceV1, MemoryContentKind } from '@before-they-grow/contracts'
import type { AgeBand } from '@before-they-grow/domain'
import type { SqliteClientPort } from './sqliteProfileRepository'
import { MEMORIES_TABLE, SAVE_OPERATIONS_TABLE } from './sqliteSchema'

type MemoryRow = {
  id: string
  kind: MemoryContentKind
  prompt_id: string
  prompt_question: string
  prompt_follow_up: string
  prompt_age_band: AgeBand
  reviewed_transcript: string
  captured_at: string
  saved_at: string
  local_date: string
  time_zone: string
  media_ref: string | null
  media_byte_count: number | null
  media_sha256: string | null
}

type JournalRow = {
  operation_id: string
  memory_id: string
  media_sha256: string | null
  relative_path: string | null
  memory_json: string
  phase: 'prepared' | 'media-committed'
}

function mapRow(row: MemoryRow): MemoryEntryV1 {
  const media: ManagedMediaReferenceV1 | null =
    row.media_ref === null
      ? null
      : {
          relativePath: row.media_ref,
          byteCount: row.media_byte_count ?? 0,
          sha256: row.media_sha256 ?? '',
        }
  return {
    id: row.id,
    kind: row.kind,
    promptSnapshot: {
      promptId: row.prompt_id,
      question: row.prompt_question,
      followUp: row.prompt_follow_up,
      ageBand: row.prompt_age_band,
    },
    reviewedTranscript: row.reviewed_transcript,
    capturedAt: row.captured_at,
    savedAt: row.saved_at,
    localDate: row.local_date,
    timeZone: row.time_zone,
    media,
  }
}

function parseJournalRow(row: JournalRow): SaveOperationRecord {
  let memory: MemoryEntryV1
  try {
    memory = JSON.parse(row.memory_json) as MemoryEntryV1
  } catch {
    throw new StorageGateError('integrity-failed')
  }
  if (
    !memory
    || memory.id !== row.memory_id
    || memory.media?.sha256 !== (row.media_sha256 ?? undefined)
    || memory.media?.relativePath !== (row.relative_path ?? undefined)
  ) {
    throw new StorageGateError('integrity-failed')
  }
  return {
    identity: {
      operationId: row.operation_id,
      memoryId: row.memory_id,
      mediaSha256: row.media_sha256,
    },
    relativePath: row.relative_path,
    memory,
    phase: row.phase,
  }
}

function isOutOfSpace(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return /(?:out of space|no space|disk full|database or disk is full|enospc)/i.test(message)
}

function sameRecord(left: SaveOperationRecord, right: SaveOperationRecord): boolean {
  return (
    left.identity.operationId === right.identity.operationId
    && left.identity.memoryId === right.identity.memoryId
    && left.identity.mediaSha256 === right.identity.mediaSha256
    && left.relativePath === right.relativePath
    && JSON.stringify(left.memory) === JSON.stringify(right.memory)
  )
}

/**
 * Memory catalog sharing the same SqliteClientPort connection as the profile
 * catalog. A save commits in one exclusive transaction and is reported only
 * after the row can be queried back; the timeline reads newest first.
 */
export function createSqliteMemoryRepository(client: SqliteClientPort): MemoryRepositoryPort {
  const journal: SaveJournalPort = {
    async prepare(operation): Promise<SaveJournalPrepareResult> {
      try {
        return await client.transaction(async (txn) => {
          const rows = await txn.getAll<JournalRow>(
            `SELECT operation_id, memory_id, media_sha256, relative_path, memory_json, phase
             FROM ${SAVE_OPERATIONS_TABLE}
             WHERE operation_id = ? OR memory_id = ?
             LIMIT 1`,
            [operation.identity.operationId, operation.identity.memoryId],
          )
          const existing = rows[0]
          if (existing) {
            const parsed = parseJournalRow(existing)
            if (sameRecord(parsed, operation)) {
              return { kind: 'existing', record: parsed }
            }
            return { kind: 'conflict', existing: parsed.memory }
          }
          await txn.run(
            `INSERT INTO ${SAVE_OPERATIONS_TABLE} (
               operation_id, memory_id, media_sha256, relative_path, memory_json, phase, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              operation.identity.operationId,
              operation.identity.memoryId,
              operation.identity.mediaSha256,
              operation.relativePath,
              JSON.stringify(operation.memory),
              operation.phase,
              new Date().toISOString(),
            ],
          )
          return { kind: 'created', record: operation }
        })
      } catch (error) {
        if (
          error instanceof StorageGateError
          || error instanceof SaveCapacityError
          || error instanceof SaveBoundaryError
          || error instanceof SaveIndeterminateError
        ) throw error
        if (isOutOfSpace(error)) throw new SaveCapacityError()
        throw new SaveBoundaryError('pre-commit', 'database-commit-failed')
      }
    },

    async markMediaCommitted(operationId) {
      try {
        await client.transaction(async (txn) => {
          const rows = await txn.getAll<{ operation_id: string }>(
            `SELECT operation_id FROM ${SAVE_OPERATIONS_TABLE} WHERE operation_id = ?`,
            [operationId],
          )
          if (rows.length !== 1) {
            throw new SaveIndeterminateError('journal-uncertain')
          }
          await txn.run(
            `UPDATE ${SAVE_OPERATIONS_TABLE} SET phase = ? WHERE operation_id = ?`,
            ['media-committed', operationId],
          )
        })
      } catch (error) {
        if (error instanceof SaveIndeterminateError || error instanceof StorageGateError) throw error
        if (isOutOfSpace(error)) throw new SaveIndeterminateError('journal-uncertain')
        throw new SaveIndeterminateError('journal-uncertain')
      }
    },

    async markPrepared(operationId) {
      try {
        await client.transaction(async (txn) => {
          await txn.run(
            `UPDATE ${SAVE_OPERATIONS_TABLE} SET phase = ? WHERE operation_id = ?`,
            ['prepared', operationId],
          )
        })
      } catch (error) {
        if (error instanceof StorageGateError) throw error
        throw new SaveBoundaryError('pre-commit', 'database-commit-failed')
      }
    },

    async listPending() {
      if (!client.isOpen()) throw new StorageGateError('integrity-failed')
      try {
        const rows = await client.getAll<JournalRow>(
          `SELECT operation_id, memory_id, media_sha256, relative_path, memory_json, phase
           FROM ${SAVE_OPERATIONS_TABLE}
           ORDER BY created_at ASC`,
        )
        return rows.map(parseJournalRow)
      } catch (error) {
        if (error instanceof StorageGateError) throw error
        throw new StorageGateError('integrity-failed')
      }
    },

    async remove(operationId) {
      if (!client.isOpen()) throw new StorageGateError('integrity-failed')
      try {
        await client.transaction(async (txn) => {
          await txn.run(
            `DELETE FROM ${SAVE_OPERATIONS_TABLE} WHERE operation_id = ?`,
            [operationId],
          )
        })
      } catch (error) {
        if (error instanceof StorageGateError) throw error
        if (isOutOfSpace(error)) throw new SaveCapacityError()
        throw new SaveBoundaryError('post-commit', 'journal-uncertain')
      }
    },
  }

  return {
    saveJournal: journal,

    async create(memory) {
      if (!client.isOpen()) throw new StorageGateError('integrity-failed')

      let outcome: 'created' | 'duplicate'
      try {
        outcome = await client.transaction(async (txn) => {
          const existing = await txn.getAll<{ id: string }>(
            `SELECT id FROM ${MEMORIES_TABLE} WHERE id = ?`,
            [memory.id],
          )
          if (existing.length > 0) return 'duplicate' as const

          await txn.run(
            `INSERT INTO ${MEMORIES_TABLE} (
               id, kind, prompt_id, prompt_question, prompt_follow_up,
               prompt_age_band, reviewed_transcript, captured_at, saved_at,
               local_date, time_zone, media_ref, media_byte_count, media_sha256
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              memory.id,
              memory.kind,
              memory.promptSnapshot.promptId,
              memory.promptSnapshot.question,
              memory.promptSnapshot.followUp,
              memory.promptSnapshot.ageBand,
              memory.reviewedTranscript,
              memory.capturedAt,
              memory.savedAt,
              memory.localDate,
              memory.timeZone,
              memory.media?.relativePath ?? null,
              memory.media?.byteCount ?? null,
              memory.media?.sha256 ?? null,
            ],
          )
          return 'created' as const
        })
      } catch (error) {
        if (error instanceof StorageGateError) throw error
        if (error instanceof SaveCapacityError || error instanceof SaveBoundaryError || error instanceof SaveIndeterminateError) throw error
        if (isOutOfSpace(error)) throw new SaveCapacityError()
        throw new SaveBoundaryError('pre-commit', 'database-commit-failed')
      }

      // A save is reported only after the committed row can be queried back.
      // The read is deliberately outside the transaction so it observes the
      // committed state, not the transaction's own uncommitted write.
      if (outcome === 'created') {
        try {
          const verified = await client.getAll<{ id: string }>(
            `SELECT id FROM ${MEMORIES_TABLE} WHERE id = ?`,
            [memory.id],
          )
          if (verified.length !== 1) {
            throw new SaveIndeterminateError('post-commit-verification-failed')
          }
        } catch (error) {
          if (error instanceof SaveIndeterminateError) throw error
          throw new SaveIndeterminateError('post-commit-verification-failed')
        }
      }

      return outcome
    },

    async findById(id) {
      if (!client.isOpen()) throw new StorageGateError('integrity-failed')
      const rows = await client.getAll<MemoryRow>(
        `SELECT id, kind, prompt_id, prompt_question, prompt_follow_up,
                prompt_age_band, reviewed_transcript, captured_at, saved_at,
                local_date, time_zone, media_ref, media_byte_count, media_sha256
         FROM ${MEMORIES_TABLE}
         WHERE id = ?
         LIMIT 1`,
        [id],
      )
      const row = rows[0]
      return row ? mapRow(row) : null
    },

    async findNewestFirst() {
      if (!client.isOpen()) throw new StorageGateError('integrity-failed')
      const rows = await client.getAll<MemoryRow>(
        `SELECT id, kind, prompt_id, prompt_question, prompt_follow_up,
                prompt_age_band, reviewed_transcript, captured_at, saved_at,
                local_date, time_zone, media_ref, media_byte_count, media_sha256
         FROM ${MEMORIES_TABLE}
         ORDER BY saved_at DESC`,
      )
      return rows.map(mapRow)
    },
  }
}
