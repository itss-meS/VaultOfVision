export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "");
}

export function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (typeof value === "object" && value !== null)
    return Object.values(value).flatMap(stringsIn);
  return [];
}

export class RuleEngine {
  private readonly banned: string[];
  readonly version: number;

  constructor(banned: readonly string[], version = 0) {
    const cleaned = banned.map(normalize).filter((b) => b.length > 0);
    if (cleaned.length === 0) throw new Error("banned list must not be empty");
    this.banned = [...new Set(cleaned)].sort((a, b) => b.length - a.length);
    this.version = version;
  }

  mentionsBanned(text: string): boolean {
    const norm = normalize(text);
    return this.banned.some((b) => norm.includes(b));
  }

  violations(payload: unknown): string[] {
    return stringsIn(payload)
      .filter((s) => this.mentionsBanned(s))
      .map((s) => s.slice(0, 40));
  }

  isClean(payload: unknown): boolean {
    return this.violations(payload).length === 0;
  }
}

export function rulesFromDocument(doc: unknown): RuleEngine {
  if (typeof doc !== "object" || doc === null)
    throw new Error("banned list malformed");
  const d = doc as Record<string, unknown>;
  const items = d["items"];
  if (!Array.isArray(items) || !items.every((i) => typeof i === "string"))
    throw new Error("banned list malformed");
  const names: string[] = [...(items as string[])];
  const aliases = d["aliases"];
  if (Array.isArray(aliases))
    for (const a of aliases) if (typeof a === "string") names.push(a);
  const version = typeof d["version"] === "number" ? d["version"] : 0;
  return new RuleEngine(names, version);
}
