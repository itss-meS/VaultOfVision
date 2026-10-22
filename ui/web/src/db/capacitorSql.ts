import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from "@capacitor-community/sqlite";
import type { Sql, SqlValue } from "./sql";

const DB_NAME = "agriedge";

class CapacitorStore implements Sql {
  constructor(private readonly db: SQLiteDBConnection) {}

  async run(statement: string, params: SqlValue[] = []): Promise<void> {
    if (params.length === 0) await this.db.execute(statement, false);
    else await this.db.run(statement, params, false);
  }

  async all<T extends object>(
    statement: string,
    params: SqlValue[] = [],
  ): Promise<T[]> {
    const result = await this.db.query(statement, params);
    return (result.values ?? []) as T[];
  }
}

export async function openCapacitorSql(): Promise<Sql> {
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const consistent = (await sqlite.checkConnectionsConsistency()).result;
  const exists = (await sqlite.isConnection(DB_NAME, false)).result;
  const db =
    consistent && exists
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(
          DB_NAME,
          false,
          "no-encryption",
          1,
          false,
        );
  await db.open();
  return new CapacitorStore(db);
}
