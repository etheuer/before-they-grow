import { StorageGateError, type MemoryRepositoryPort } from '@before-they-grow/application'
import type { MemoryEntryV1, MemoryContentKind } from '@before-they-grow/contracts'
import type { AgeBand } from '@before-they-grow/domain'
import type { SqliteClientPort } from './sqliteProfileRepository'
import { MEMORIES_TABLE } from './sqliteSchema'

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
}

function mapRow(row: MemoryRow): MemoryEntryV1 {
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
    media: null,
  }
}

/**
 * Memory catalog sharing the same SqliteClientPort connection as the profile
 * catalog. A save commits in one exclusive transaction and is reported only
 * after the row can be queried back; the timeline reads newest first.
 */
export function createSqliteMemoryRepository(client: SqliteClientPort): MemoryRepositoryPort {
  return {
    async create(memory) {
      if (!client.isOpen()) throw new StorageGateError('integrity-failed')

      const outcome = await client.transaction(async (txn) => {
        const existing = await txn.getAll<{ id: string }>(
          `SELECT id FROM ${MEMORIES_TABLE} WHERE id = ?`,
          [memory.id],
        )
        if (existing.length > 0) return 'duplicate' as const

        await txn.run(
          `INSERT INTO ${MEMORIES_TABLE} (
             id, kind, prompt_id, prompt_question, prompt_follow_up,
             prompt_age_band, reviewed_transcript, captured_at, saved_at,
             local_date, time_zone, media_ref
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
            memory.media,
          ],
        )
        return 'created' as const
      })

      // A save is reported only after the committed row can be queried back.
      // The read is deliberately outside the transaction so it observes the
      // committed state, not the transaction's own uncommitted write.
      if (outcome === 'created') {
        const verified = await client.getAll<{ id: string }>(
          `SELECT id FROM ${MEMORIES_TABLE} WHERE id = ?`,
          [memory.id],
        )
        if (verified.length !== 1) throw new StorageGateError('integrity-failed')
      }

      return outcome
    },

    async findNewestFirst() {
      if (!client.isOpen()) throw new StorageGateError('integrity-failed')
      const rows = await client.getAll<MemoryRow>(
        `SELECT id, kind, prompt_id, prompt_question, prompt_follow_up,
                prompt_age_band, reviewed_transcript, captured_at, saved_at,
                local_date, time_zone, media_ref
         FROM ${MEMORIES_TABLE}
         ORDER BY saved_at DESC`,
      )
      return rows.map(mapRow)
    },
  }
}