import type { Candidate, ScanKind } from "../contracts/types";
import { parseLabel } from "../engine/core/labels";

export interface LabelParts {
  crop: string | null;
  name: string;
}

export function splitLabel(label: string, kind: ScanKind): LabelParts {
  const parsed = parseLabel(label);
  if (kind === "pest")
    return { crop: "Pest", name: label.trim().replace(/^pest\s+/i, "") };
  if (parsed.crop === null) return { crop: null, name: parsed.name };
  return { crop: parsed.crop, name: parsed.name };
}

export function kindOfLabel(label: string): ScanKind {
  return parseLabel(label).kind;
}

export function formatDate(ms: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function formatKb(bytes: number): string {
  return (bytes / 1024).toFixed(1);
}

export function sourceKey(c: Candidate): "pest" | "cassava" | "leaf" {
  if (c.kind === "pest") return "pest";
  return /cassava/i.test(c.source) ? "cassava" : "leaf";
}
