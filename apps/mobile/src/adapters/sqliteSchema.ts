/**
 * Version 1 database schema: the authoritative catalog of one profile plus
 * every Local-only memory. The DDL is additive and idempotent — running it on
 * an already-versioned catalog is a no-op — so a catalog bootstrapped before
 * the memories table existed upgrades in place without a destructive
 * migration. The profile catalog owns bootstrap (integrity, versions, backup
 * exclusion); memory operations share the same SqliteClientPort connection.
 */
export const PROFILES_TABLE = 'profiles'
export const MEMORIES_TABLE = 'memories'

export const DATABASE_DDL = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY NOT NULL,
  child_nickname TEXT NOT NULL CHECK (length(child_nickname) BETWEEN 1 AND 40),
  age_band TEXT NOT NULL CHECK (age_band IN ('3-5', '6-8', '9-12')),
  consented_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text-only')),
  prompt_id TEXT NOT NULL,
  prompt_question TEXT NOT NULL,
  prompt_follow_up TEXT NOT NULL,
  prompt_age_band TEXT NOT NULL CHECK (prompt_age_band IN ('3-5', '6-8', '9-12')),
  reviewed_transcript TEXT NOT NULL CHECK (length(reviewed_transcript) > 0),
  captured_at TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  media_ref TEXT
);
CREATE INDEX IF NOT EXISTS memories_saved_at_idx ON memories (saved_at DESC);
`