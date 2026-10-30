import type { Lang, Priority } from "../../contracts/types";
import { parseLabel } from "./labels";

export interface KnowledgeCard {
  id: string;
  crop: string;
  name: string;
  kind: "disease" | "pest";
  lang: Lang;
  summary: string;
  symptoms: string[];
  causes: string[];
  actions: Array<{ text: string; priority: Priority }>;
  prevention: string[];
  help?: string;
  label?: string;
  sources: Array<{ title: string; url: string }>;
}

const LANGS: readonly string[] = ["en", "hi", "mr", "te"];
const PRIORITIES: readonly string[] = ["critical", "high", "normal"];

function texts(value: unknown, min: number): string[] | null {
  if (!Array.isArray(value) || value.length < min) return null;
  if (!value.every((v) => typeof v === "string" && v.length > 0)) return null;
  return value as string[];
}

export function asCard(value: unknown): KnowledgeCard | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  const { id, crop, name, kind, lang, summary } = c;
  if (
    typeof id !== "string" ||
    typeof crop !== "string" ||
    typeof name !== "string" ||
    typeof summary !== "string" ||
    (kind !== "disease" && kind !== "pest") ||
    typeof lang !== "string" ||
    !LANGS.includes(lang)
  )
    return null;
  const symptoms = texts(c["symptoms"], 1);
  const causes = texts(c["causes"], 1);
  const prevention = texts(c["prevention"], 1);
  if (symptoms === null || causes === null || prevention === null) return null;
  const rawActions = c["actions"];
  if (!Array.isArray(rawActions) || rawActions.length === 0) return null;
  const actions: KnowledgeCard["actions"] = [];
  for (const a of rawActions) {
    if (typeof a !== "object" || a === null) return null;
    const item = a as Record<string, unknown>;
    if (
      typeof item["text"] !== "string" ||
      typeof item["priority"] !== "string" ||
      !PRIORITIES.includes(item["priority"])
    )
      return null;
    actions.push({
      text: item["text"],
      priority: item["priority"] as Priority,
    });
  }
  const rawSources = c["sources"];
  if (!Array.isArray(rawSources)) return null;
  const sources: KnowledgeCard["sources"] = [];
  for (const s of rawSources) {
    if (typeof s !== "object" || s === null) return null;
    const item = s as Record<string, unknown>;
    if (typeof item["title"] !== "string" || typeof item["url"] !== "string")
      return null;
    sources.push({ title: item["title"], url: item["url"] });
  }
  const card: KnowledgeCard = {
    id,
    crop,
    name,
    kind,
    lang: lang as Lang,
    summary,
    symptoms,
    causes,
    actions,
    prevention,
    sources,
  };
  if (typeof c["help"] === "string") card.help = c["help"];
  if (typeof c["label"] === "string") card.label = c["label"];
  return card;
}

export class KnowledgeBase {
  private readonly byKey = new Map<string, KnowledgeCard>();
  readonly size: number;

  constructor(cards: readonly KnowledgeCard[]) {
    for (const card of cards) this.byKey.set(`${card.id}|${card.lang}`, card);
    this.size = cards.length;
  }

  static empty(): KnowledgeBase {
    return new KnowledgeBase([]);
  }

  static fromJson(text: string): KnowledgeBase {
    const doc = JSON.parse(text) as unknown;
    if (typeof doc !== "object" || doc === null) return KnowledgeBase.empty();
    const list = (doc as Record<string, unknown>)["cards"];
    if (!Array.isArray(list)) return KnowledgeBase.empty();
    const cards: KnowledgeCard[] = [];
    for (const item of list) {
      const card = asCard(item);
      if (card !== null) cards.push(card);
    }
    return new KnowledgeBase(cards);
  }

  find(label: string, lang: Lang): KnowledgeCard | null {
    const key = parseLabel(label).key;
    return (
      this.byKey.get(`${key}|${lang}`) ?? this.byKey.get(`${key}|en`) ?? null
    );
  }
}
