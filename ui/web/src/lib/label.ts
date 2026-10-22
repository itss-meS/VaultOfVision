import type { Candidate, ScanKind } from "../contracts/types";

const CROPS = [
  "Apple",
  "Blueberry",
  "Cassava",
  "Cherry",
  "Corn",
  "Grape",
  "Maize",
  "Orange",
  "Peach",
  "Pepper",
  "Potato",
  "Raspberry",
  "Soybean",
  "Squash",
  "Strawberry",
  "Tomato",
];

export interface LabelParts {
  crop: string | null;
  name: string;
}

export function splitLabel(label: string, kind: ScanKind): LabelParts {
  const text = label.trim();
  if (kind === "pest") return { crop: "Pest", name: text };
  const space = text.indexOf(" ");
  if (space > 0) {
    const head = text.slice(0, space);
    if (CROPS.includes(head))
      return { crop: head, name: text.slice(space + 1).trim() };
  }
  return { crop: null, name: text };
}

export function kindOfLabel(label: string): ScanKind {
  return /healthy$/i.test(label.trim()) ? "healthy" : "disease";
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
