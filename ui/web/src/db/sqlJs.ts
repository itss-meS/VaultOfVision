import initSqlJs, { type Database } from "sql.js";
import type { Sql, SqlValue } from "./sql";

export interface SqlJsOptions {
  wasmUrl?: string;
  data?: Uint8Array | null;
  onChange?: (bytes: Uint8Array) => Promise<void>;
}

class SqlJsStore implements Sql {
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly db: Database,
    private readonly onChange:
      ((bytes: Uint8Array) => Promise<void>) | undefined,
  ) {}

  run(statement: string, params: SqlValue[] = []): Promise<void> {
    this.db.run(statement, params);
    if (!this.onChange) return Promise.resolve();
    const save = this.onChange;
    const bytes = this.db.export();
    this.chain = this.chain.then(() => save(bytes));
    return this.chain;
  }

  all<T extends object>(
    statement: string,
    params: SqlValue[] = [],
  ): Promise<T[]> {
    const stmt = this.db.prepare(statement);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return Promise.resolve(rows);
    } finally {
      stmt.free();
    }
  }
}

export async function openSqlJs(options: SqlJsOptions = {}): Promise<Sql> {
  const { wasmUrl, data, onChange } = options;
  const SQL = await initSqlJs(wasmUrl ? { locateFile: () => wasmUrl } : {});
  const db =
    data && data.length > 0 ? new SQL.Database(data) : new SQL.Database();
  return new SqlJsStore(db, onChange);
}
