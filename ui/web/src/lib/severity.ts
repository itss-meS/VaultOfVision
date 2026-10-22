export type Tone = "good" | "warn" | "bad";

export function severityTone(level: number): Tone {
  if (level <= 2) return "good";
  if (level === 3) return "warn";
  return "bad";
}

export const TONE_DOT: Record<Tone, string> = {
  good: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
};

export const TONE_CLASS: Record<Tone, string> = {
  good: "border-ok/50 bg-ok/10 text-ok",
  warn: "border-warn/50 bg-warn/10 text-warn",
  bad: "border-bad/50 bg-bad/10 text-bad",
};

export function diseaseKey(label: string): string {
  return label.replace(/[^A-Za-z]+/g, "");
}
