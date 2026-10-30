import type { ChatTurn, Lang } from "../../contracts/types";
import type { RuleEngine } from "./rules";
import type { ChatMessage } from "./types";

export const MAX_TURNS = 6;
export const MAX_CHARS = 600;
export const CHAT_TOKENS = 160;
export const FOOTER = "\n\n\u2014 ";
export const MAX_CONTEXT = 3;
const CHUNK_CHARS = 420;
const CONTEXT_CHARS = 1100;

const LANGUAGE_NAMES: Record<Lang, string> = {
  en: "English",
  hi: "Hindi, written in Devanagari",
  mr: "Marathi, written in Devanagari",
  te: "Telugu, written in Telugu script",
};

const NOTICES: Record<
  Lang,
  {
    dose: string;
    banned: string;
    empty: string;
    source: string;
    general: string;
  }
> = {
  en: {
    dose: "For the exact dose, scan the leaf and open the Advice screen, or ask your local agriculture office.",
    banned:
      "That product is not permitted. Ask your local agriculture office for an approved alternative.",
    empty: "I could not prepare an answer. Please ask again in other words.",
    source: "Source",
    general:
      "General guidance only. For your own field, ask your local agriculture office.",
  },
  hi: {
    dose: "सही मात्रा के लिए पत्ती को स्कैन करें और सलाह स्क्रीन खोलें, या अपने स्थानीय कृषि कार्यालय से पूछें।",
    banned:
      "यह उत्पाद अनुमत नहीं है। अनुमोदित विकल्प के लिए अपने स्थानीय कृषि कार्यालय से पूछें।",
    empty: "मैं उत्तर तैयार नहीं कर सका। कृपया दूसरे शब्दों में फिर पूछें।",
    source: "स्रोत",
    general:
      "यह केवल सामान्य जानकारी है। अपने खेत के लिए स्थानीय कृषि कार्यालय से पूछें।",
  },
  mr: {
    dose: "अचूक प्रमाणासाठी पान स्कॅन करा आणि सल्ला स्क्रीन उघडा, किंवा तुमच्या स्थानिक कृषी कार्यालयाला विचारा.",
    banned:
      "हे उत्पादन परवानगी नसलेले आहे. मान्यताप्राप्त पर्यायासाठी स्थानिक कृषी कार्यालयाला विचारा.",
    empty: "मी उत्तर तयार करू शकलो नाही. कृपया दुसऱ्या शब्दांत पुन्हा विचारा.",
    source: "स्रोत",
    general:
      "ही फक्त सामान्य माहिती आहे. तुमच्या शेतासाठी स्थानिक कृषी कार्यालयाला विचारा.",
  },
  te: {
    dose: "సరైన మోతాదు కోసం ఆకును స్కాన్ చేసి సలహా స్క్రీన్ తెరవండి, లేదా మీ స్థానిక వ్యవసాయ కార్యాలయాన్ని అడగండి.",
    banned:
      "ఈ ఉత్పత్తికి అనుమతి లేదు. ఆమోదిత ప్రత్యామ్నాయం కోసం మీ స్థానిక వ్యవసాయ కార్యాలయాన్ని అడగండి.",
    empty: "నేను సమాధానం సిద్ధం చేయలేకపోయాను. దయచేసి మరో విధంగా మళ్లీ అడగండి.",
    source: "మూలం",
    general:
      "ఇది సాధారణ సమాచారం మాత్రమే. మీ పొలం కోసం మీ స్థానిక వ్యవసాయ కార్యాలయాన్ని అడగండి.",
  },
};

const DOSE =
  /\d+(?:[.,]\d+)?\s*(?:ml|mL|l|L|litre|liter|litres|liters|g|gm|gram|grams|kg|mg)\b\s*(?:\/|per|in|के|प्रति)\s*\w+/u;

export function cleanTopic(topic: string | undefined): string {
  return (topic ?? "")
    .replace(/[<>\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function systemPrompt(
  lang: Lang,
  topic = "",
  context: readonly string[] = [],
): string {
  const scan = topic
    ? `\nThe farmer just scanned a leaf and the app found: ${topic}. Treat this as background only and say it may be wrong.`
    : "";
  const facts =
    context.length > 0
      ? `\nVerified facts:\n${context.map((c, n) => `[${n + 1}] ${c}`).join("\n")}\nUse only these facts when you talk about diseases, pests or treatment. If they do not answer the question, say you are not sure.`
      : "";
  return `You are AgriEdge, a friendly offline farming assistant for small farmers in India.
Answer only questions about farming. Use simple words and short sentences. Keep every answer under 90 words.
Never give pesticide names, brand names or quantities. For treatment or dose, tell the farmer to scan the leaf and open the Advice screen, or to ask the local agriculture office.
If you are not sure, say so.${facts}${scan}
Reply in ${LANGUAGE_NAMES[lang]}.`;
}

export function stripFooter(text: string): string {
  const at = text.indexOf(FOOTER);
  return at >= 0 ? text.slice(0, at) : text;
}

export function selectContext(chunks: readonly { text: string }[]): string[] {
  const out: string[] = [];
  let used = 0;
  for (const c of chunks) {
    if (out.length >= MAX_CONTEXT) break;
    const piece = c.text
      .replaceAll("<", "(")
      .replaceAll(">", ")")
      .slice(0, CHUNK_CHARS);
    if (used + piece.length > CONTEXT_CHARS) break;
    out.push(piece);
    used += piece.length;
  }
  return out;
}

export function cleanHistory(history: ChatTurn[]): ChatTurn[] | null {
  if (history.length === 0) return null;
  const last = history[history.length - 1];
  if (!last || last.role !== "user") return null;
  const turns = history.slice(-MAX_TURNS).map((t) => ({
    role: t.role,
    content: stripFooter(t.content).trim().slice(0, MAX_CHARS),
  }));
  if (turns.some((t) => t.content.length === 0)) return null;
  while (turns.length > 0 && turns[0]?.role !== "user") turns.shift();
  return turns.length > 0 ? turns : null;
}

export function buildChatMessages(
  turns: ChatTurn[],
  lang: Lang,
  topic?: string,
  context: readonly string[] = [],
): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt(lang, cleanTopic(topic), context) },
    ...turns.map((t) => ({ role: t.role, content: t.content })),
  ];
}

export function guardReply(
  reply: string,
  lang: Lang,
  rules: RuleEngine,
): string {
  const notices = NOTICES[lang];
  const text = reply.replace(/<\|[^|]*\|>/g, "").trim();
  if (text.length === 0) return notices.empty;
  if (rules.mentionsBanned(text)) return notices.banned;
  const sentences = text.split(/(?<=[.!?।])\s+/u);
  const kept = sentences.filter((s) => !DOSE.test(s));
  if (kept.length === sentences.length) return text;
  return [...kept, notices.dose].join(" ").trim();
}

const SPECIAL = /<\|[^|]*\|>/g;

function sentencesOf(text: string): string[] {
  return text.split(/(?<=[.!?\u0964])\s+/u);
}

export class StreamGuard {
  private raw = "";
  private blocked = false;

  constructor(private readonly rules: RuleEngine) {}

  push(piece: string): string {
    this.raw += piece;
    return this.visible();
  }

  visible(): string {
    if (this.blocked) return "";
    let text = this.raw.replace(SPECIAL, "").replace(/[ \t]{2,}/g, " ");
    const open = text.lastIndexOf("<|");
    if (open >= 0) text = text.slice(0, open);
    if (this.rules.mentionsBanned(text)) {
      this.blocked = true;
      return "";
    }
    let end = text.length;
    while (end > 0 && !/\s/u.test(text.charAt(end - 1))) end -= 1;
    const settled = text.slice(0, end);
    if (settled.trim().length === 0) return "";
    const parts = sentencesOf(settled);
    const finished = /[.!?\u0964]\s*$/u.test(settled);
    const kept: string[] = [];
    parts.forEach((part, n) => {
      const last = n === parts.length - 1;
      if (last && !finished) {
        if (!/\d/u.test(part)) kept.push(part);
        return;
      }
      if (!DOSE.test(part)) kept.push(part);
    });
    return kept.join(" ").trim();
  }
}

export function finishReply(
  raw: string,
  lang: Lang,
  rules: RuleEngine,
  sources: readonly string[],
  grounded: boolean,
): string {
  const notices = NOTICES[lang];
  const body = guardReply(raw, lang, rules);
  if (body === notices.empty || body === notices.banned) return body;
  const unique = [...new Set(sources.filter((s) => s.length > 0))].slice(0, 2);
  if (grounded && unique.length > 0)
    return `${body}${FOOTER}${notices.source}: ${unique.join("; ")}`;
  if (!grounded) return `${body}${FOOTER}${notices.general}`;
  return body;
}
