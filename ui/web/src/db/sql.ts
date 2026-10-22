export type SqlValue = string | number | null;

export interface Sql {
  run(statement: string, params?: SqlValue[]): Promise<void>;
  all<T extends object>(statement: string, params?: SqlValue[]): Promise<T[]>;
}

export const SCHEMA_VERSION = 1;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     mobile TEXT NOT NULL UNIQUE,
     salt TEXT NOT NULL,
     hash TEXT NOT NULL,
     iterations INTEGER NOT NULL,
     village TEXT NOT NULL DEFAULT '',
     area_ha REAL,
     lang TEXT NOT NULL DEFAULT 'en',
     failed INTEGER NOT NULL DEFAULT 0,
     locked_until INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS scans (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id),
     label TEXT NOT NULL,
     kind TEXT NOT NULL,
     confidence REAL NOT NULL,
     severity INTEGER,
     duration_ms INTEGER NOT NULL,
     thumb TEXT NOT NULL DEFAULT '',
     advice TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS scans_user_time ON scans (user_id, created_at DESC)`,
];

export async function migrate(sql: Sql): Promise<void> {
  for (const statement of STATEMENTS) await sql.run(statement);
  await sql.run(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
    [String(SCHEMA_VERSION)],
  );
}
