import type { Sql } from "./sql";
import { openSqlJs } from "./sqlJs";

const BASE = "/__dev";

async function loadBytes(): Promise<Uint8Array | null> {
  const res = await fetch(`${BASE}/db`);
  if (res.status !== 200) return null;
  return new Uint8Array(await res.arrayBuffer());
}

async function saveBytes(bytes: Uint8Array): Promise<void> {
  const res = await fetch(`${BASE}/db`, { method: "PUT", body: bytes });
  if (!res.ok) throw new Error("dev database could not be saved");
}

export async function openDevSql(): Promise<Sql> {
  return openSqlJs({
    wasmUrl: `${BASE}/sql/sql-wasm.wasm`,
    data: await loadBytes(),
    onChange: saveBytes,
  });
}
