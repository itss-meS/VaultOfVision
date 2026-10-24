import type {
  AdvisoryResponse,
  LedgerStats,
  NewScan,
  ScanKind,
  ScanRecord,
} from "../../contracts/types";
import type { Sql } from "../../db/sql";

export const MAX_SCANS = 500;
const THUMB_PREFIX = "data:image/jpeg;base64,";
const MAX_THUMB = 40000;

interface ScanRow {
  id: string;
  label: string;
  kind: string;
  confidence: number;
  severity: number | null;
  duration_ms: number;
  thumb: string;
  has_advice: number;
  created_at: number;
}

export function kindFor(label: string, model: string): ScanKind {
  if (/healthy$/i.test(label.trim())) return "healthy";
  if (/^pest\s/i.test(label.trim())) return "pest";
  return /ip102|pest|insect/i.test(model) ? "pest" : "disease";
}

function asKind(value: string): ScanKind {
  return value === "pest" || value === "healthy" ? value : "disease";
}

function toRecord(row: ScanRow): ScanRecord {
  return {
    id: row.id,
    label: row.label,
    kind: asKind(row.kind),
    confidence: row.confidence,
    severity: row.severity,
    durationMs: row.duration_ms,
    thumb: row.thumb,
    createdAt: row.created_at,
    hasAdvice: Boolean(row.has_advice),
  };
}

export class Scans {
  constructor(
    private readonly sql: Sql,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async add(userId: string, scan: NewScan, model: string): Promise<string> {
    const id = crypto.randomUUID();
    const thumb =
      scan.thumb.startsWith(THUMB_PREFIX) && scan.thumb.length <= MAX_THUMB
        ? scan.thumb
        : "";
    await this.sql.run(
      "INSERT INTO scans (id, user_id, label, kind, confidence, severity, duration_ms, thumb, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        userId,
        scan.vision.label.slice(0, 120),
        kindFor(scan.vision.label, model),
        scan.vision.confidence,
        scan.vision.severity_level,
        Math.max(0, Math.round(scan.durationMs)),
        thumb,
        this.now(),
      ],
    );
    await this.sql.run(
      "DELETE FROM scans WHERE user_id = ? AND id NOT IN (SELECT id FROM scans WHERE user_id = ? ORDER BY created_at DESC LIMIT ?)",
      [userId, userId, MAX_SCANS],
    );
    return id;
  }

  async attach(
    userId: string,
    id: string,
    response: AdvisoryResponse,
  ): Promise<void> {
    await this.sql.run(
      "UPDATE scans SET advice = ? WHERE id = ? AND user_id = ?",
      [JSON.stringify(response), id, userId],
    );
  }

  async list(userId: string): Promise<ScanRecord[]> {
    const rows = await this.sql.all<ScanRow>(
      "SELECT id, label, kind, confidence, severity, duration_ms, thumb, advice IS NOT NULL AS has_advice, created_at FROM scans WHERE user_id = ? ORDER BY created_at DESC, rowid DESC",
      [userId],
    );
    return rows.map(toRecord);
  }

  async advice(userId: string, id: string): Promise<unknown> {
    const rows = await this.sql.all<{ advice: string | null }>(
      "SELECT advice FROM scans WHERE id = ? AND user_id = ?",
      [id, userId],
    );
    const raw = rows[0]?.advice;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.sql.run("DELETE FROM scans WHERE id = ? AND user_id = ?", [
      id,
      userId,
    ]);
  }

  async clear(userId: string): Promise<void> {
    await this.sql.run("DELETE FROM scans WHERE user_id = ?", [userId]);
  }

  async stats(userId: string): Promise<LedgerStats> {
    const rows = await this.sql.all<{
      scans: number;
      bytes: number;
      last_at: number | null;
    }>(
      "SELECT COUNT(*) AS scans, COALESCE(SUM(LENGTH(label) + LENGTH(thumb) + COALESCE(LENGTH(advice), 0) + 96), 0) AS bytes, MAX(created_at) AS last_at FROM scans WHERE user_id = ?",
      [userId],
    );
    const row = rows[0];
    return {
      scans: Number(row?.scans ?? 0),
      bytes: Number(row?.bytes ?? 0),
      lastAt: row?.last_at ?? null,
    };
  }
}
