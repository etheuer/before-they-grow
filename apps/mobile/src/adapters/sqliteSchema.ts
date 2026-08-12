/**
 * Version 2 database schema: the authoritative catalog of one profile plus
 * every Local-only memory. V2 adds the voice content kind with media
 * metadata (opaque relative path, byte count, SHA-256) and content-kind-aware
 * constraints — a text-only memory requires nonblank text and no media; a
 * voice memory requires media and may carry empty (audio-only) text.
 *
 * The DDL is additive and idempotent for the current version. Catalogs found
 * at the previous user version are migrated forward (see
 * MIGRATION_MEMORIES_V1_TO_V2); the profile catalog owns bootstrap and
 * migration, and memory operations share the same SqliteClientPort.
 */
export const PROFILES_TABLE = 'profiles'
export const MEMORIES_TABLE = 'memories'
export const SAVE_OPERATIONS_TABLE = 'save_operations'
export const DELETION_OPERATIONS_TABLE = 'deletion_operations'

/**
 * The memories table definition, shared by the current schema and the v1→v2
 * migration rebuild, so a column change lands once.
 */
function memoriesTable(tableName: string): string {
  return `CREATE TABLE IF NOT EXISTS ${tableName} (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text-only', 'voice')),
  prompt_id TEXT NOT NULL,
  prompt_question TEXT NOT NULL,
  prompt_follow_up TEXT NOT NULL,
  prompt_age_band TEXT NOT NULL CHECK (prompt_age_band IN ('3-5', '6-8', '9-12')),
  reviewed_transcript TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  media_ref TEXT,
  media_byte_count INTEGER,
  media_sha256 TEXT,
  CHECK (
    (kind = 'text-only' AND length(reviewed_transcript) > 0 AND media_ref IS NULL)
    OR (kind = 'voice' AND media_ref IS NOT NULL)
  )
)`
}

const SAVE_OPERATIONS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS ${SAVE_OPERATIONS_TABLE} (
  operation_id TEXT PRIMARY KEY NOT NULL,
  memory_id TEXT NOT NULL UNIQUE,
  media_sha256 TEXT,
  relative_path TEXT,
  memory_json TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('prepared', 'media-committed')),
  created_at TEXT NOT NULL
)`

const DELETION_OPERATIONS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS ${DELETION_OPERATIONS_TABLE} (
  memory_id TEXT PRIMARY KEY NOT NULL,
  relative_path TEXT,
  phase TEXT NOT NULL CHECK (phase IN ('marked', 'media-removed', 'rows-deleted'))
)`

const PROFILES_TABLE_DDL = `CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY NOT NULL,
  child_nickname TEXT NOT NULL CHECK (length(child_nickname) BETWEEN 1 AND 40),
  age_band TEXT NOT NULL CHECK (age_band IN ('3-5', '6-8', '9-12')),
  consented_at TEXT NOT NULL,
  created_at TEXT NOT NULL
)`

export const DATABASE_DDL_V2 = `${PROFILES_TABLE_DDL};
${memoriesTable(MEMORIES_TABLE)};
CREATE INDEX IF NOT EXISTS memories_saved_at_idx ON memories (saved_at DESC);
${SAVE_OPERATIONS_TABLE_DDL};
CREATE INDEX IF NOT EXISTS save_operations_memory_idx ON ${SAVE_OPERATIONS_TABLE} (memory_id);
${DELETION_OPERATIONS_TABLE_DDL};
`

/**
 * Forward migration of the memories table from the v1 shape (text-only only,
 * media_ref without metadata) to v2 (voice kind, media metadata, relaxed text
 * rule). SQLite cannot alter CHECK constraints, so the table is rebuilt by
 * copy inside the same transaction: nothing existing is deleted and the
 * profile catalog is untouched.
 */
export const MIGRATION_MEMORIES_V1_TO_V2 = `${memoriesTable('memories_v2')};
INSERT INTO memories_v2 (
  id, kind, prompt_id, prompt_question, prompt_follow_up, prompt_age_band,
  reviewed_transcript, captured_at, saved_at, local_date, time_zone, media_ref,
  media_byte_count, media_sha256
)
SELECT
  id, kind, prompt_id, prompt_question, prompt_follow_up, prompt_age_band,
  reviewed_transcript, captured_at, saved_at, local_date, time_zone, media_ref,
  NULL, NULL
FROM memories;
DROP TABLE memories;
ALTER TABLE memories_v2 RENAME TO memories;
CREATE INDEX IF NOT EXISTS memories_saved_at_idx ON memories (saved_at DESC);
${SAVE_OPERATIONS_TABLE_DDL};
CREATE INDEX IF NOT EXISTS save_operations_memory_idx ON ${SAVE_OPERATIONS_TABLE} (memory_id);
${DELETION_OPERATIONS_TABLE_DDL};
`