import type { DosageResult, ToolCall } from "./types";
import type { RuleEngine } from "./rules";

type Entry = Record<string, unknown>;

export class DosageTable {
  readonly entries: Entry[];
  readonly version: number;

  constructor(entries: Entry[], version = 0) {
    this.entries = entries;
    this.version = version;
  }

  lookup(crop: string, disease: string, severity: number): Entry | null {
    const want = disease.toLowerCase();
    for (const e of this.entries) {
      const lo = Number(e["severity_min"] ?? 1);
      const hi = Number(e["severity_max"] ?? 5);
      if (
        e["crop"] === crop &&
        String(e["disease"] ?? "").toLowerCase() === want &&
        lo <= severity &&
        severity <= hi
      )
        return e;
    }
    return null;
  }
}

export function dosageFromDocument(doc: unknown): DosageTable {
  if (typeof doc !== "object" || doc === null)
    throw new Error("dosage table malformed");
  const d = doc as Record<string, unknown>;
  const entries = d["entries"] ?? [];
  if (!Array.isArray(entries)) throw new Error("dosage table malformed");
  const version = typeof d["version"] === "number" ? d["version"] : 0;
  return new DosageTable(
    entries.filter(
      (e): e is Entry =>
        typeof e === "object" && e !== null && !Array.isArray(e),
    ),
    version,
  );
}

export function calcDosage(
  call: ToolCall,
  disease: string,
  table: DosageTable,
  rules: RuleEngine,
): DosageResult {
  if (call.tool !== "calc_dosage")
    return { available: false, reason: "tool_not_allowed" };
  const { args } = call;
  const entry = table.lookup(args.crop, disease, args.severity);
  if (entry === null)
    return {
      available: false,
      reason: "no_vetted_entry",
      area_ha: args.area_ha,
    };
  const dose = Number(entry["dose_per_ha"]);
  const product = entry["product"];
  const unit = entry["unit"];
  if (
    !Number.isFinite(dose) ||
    typeof product !== "string" ||
    typeof unit !== "string"
  )
    return { available: false, reason: "table_entry_invalid" };
  if (dose <= 0 || rules.mentionsBanned(product))
    return { available: false, reason: "product_not_permitted" };
  const notes = entry["notes"];
  return {
    available: true,
    product,
    dose_per_ha: dose,
    total: Math.round(dose * args.area_ha * 1000) / 1000,
    unit,
    area_ha: args.area_ha,
    notes: notes ? String(notes) : null,
  };
}
