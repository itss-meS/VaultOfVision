import { canonicalCrop, nameKey } from "./labelParse";
import type { RuleEngine } from "./rules";
import type { DosageResult, ToolCall } from "./types";

type Entry = Record<string, unknown>;

export const SOURCE_AUTHORITIES = [
  "ICAR",
  "SAU",
  "State Department of Agriculture",
  "CIBRC",
] as const;

function hasSource(entry: Entry): boolean {
  const s = entry["source"];
  if (typeof s !== "object" || s === null || Array.isArray(s)) return false;
  const src = s as Record<string, unknown>;
  const authority = src["authority"];
  const document = src["document"];
  const url = src["url"];
  return (
    typeof authority === "string" &&
    (SOURCE_AUTHORITIES as readonly string[]).includes(authority) &&
    typeof document === "string" &&
    document.trim().length > 0 &&
    typeof url === "string" &&
    /^https:\/\/\S+$/.test(url)
  );
}

function kindOf(entry: Entry): "disease" | "pest" {
  return entry["kind"] === "pest" ? "pest" : "disease";
}

function entryName(entry: Entry): string {
  return String(
    kindOf(entry) === "pest"
      ? (entry["pest"] ?? entry["disease"] ?? "")
      : (entry["disease"] ?? ""),
  );
}

function entryCrop(entry: Entry): string | null {
  return typeof entry["crop"] === "string"
    ? canonicalCrop(entry["crop"])
    : null;
}

export class DosageTable {
  readonly entries: Entry[];
  readonly version: number;

  constructor(entries: Entry[], version = 0) {
    this.entries = entries;
    this.version = version;
  }

  crops(): Set<string> {
    const out = new Set<string>();
    for (const e of this.entries) {
      const crop = entryCrop(e);
      if (crop !== null) out.add(crop);
    }
    return out;
  }

  hasDisease(crop: string, disease: string): boolean {
    const want = nameKey(disease);
    return this.entries.some(
      (e) =>
        kindOf(e) === "disease" &&
        entryCrop(e) === crop &&
        nameKey(entryName(e)) === want,
    );
  }

  hasPest(pest: string): boolean {
    const want = nameKey(pest);
    return this.entries.some(
      (e) => kindOf(e) === "pest" && nameKey(entryName(e)) === want,
    );
  }

  lookup(crop: string, disease: string, severity: number): Entry | null {
    const want = nameKey(disease);
    for (const e of this.entries) {
      const lo = Number(e["severity_min"] ?? 1);
      const hi = Number(e["severity_max"] ?? 5);
      if (
        kindOf(e) === "disease" &&
        entryCrop(e) === crop &&
        nameKey(entryName(e)) === want &&
        lo <= severity &&
        severity <= hi
      )
        return e;
    }
    return null;
  }

  lookupPest(pest: string): Entry | null {
    const want = nameKey(pest);
    const hits = this.entries.filter(
      (e) => kindOf(e) === "pest" && nameKey(entryName(e)) === want,
    );
    const first = hits[0];
    if (first === undefined) return null;
    const crops = new Set(hits.map((e) => entryCrop(e)));
    return crops.size === 1 ? first : null;
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
        typeof e === "object" &&
        e !== null &&
        !Array.isArray(e) &&
        hasSource(e as Entry),
    ),
    version,
  );
}

function resolve(
  entry: Entry | null,
  areaHa: number,
  rules: RuleEngine,
): DosageResult {
  if (entry === null)
    return { available: false, reason: "no_vetted_entry", area_ha: areaHa };
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
    total: Math.round(dose * areaHa * 1000) / 1000,
    unit,
    area_ha: areaHa,
    notes: notes ? String(notes) : null,
  };
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
  const crop = canonicalCrop(args.crop);
  const entry =
    crop === null ? null : table.lookup(crop, disease, args.severity);
  return resolve(entry, args.area_ha, rules);
}

export function calcPestDosage(
  pest: string,
  areaHa: number,
  table: DosageTable,
  rules: RuleEngine,
): DosageResult {
  return resolve(table.lookupPest(pest), areaHa, rules);
}
