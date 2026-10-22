import type { ChatTurn, Lang } from "../../contracts/types";
import type { RuleEngine } from "./rules";
import type { ChatMessage } from "./types";

export const MAX_TURNS = 8;
export const MAX_CHARS = 600;
export const CHAT_TOKENS = 256;

const LANGUAGE_NAMES: Record<Lang, string> = {
  en: "English",
  hi: "Hindi, written in Devanagari",
  mr: "Marathi, written in Devanagari",
  te: "Telugu, written in Telugu script",
};

const NOTICES: Record<Lang, { dose: string; banned: string; empty: string }> = {
  en: {
    dose: "For the exact dose, scan the leaf and open the Advice screen, or ask your local agriculture office.",
    banned:
      "That product is not permitted. Ask your local agriculture office for an approved alternative.",
    empty: "I could not prepare an answer. Please ask again in other words.",
  },
  hi: {
    dose: "सही मात्रा के लिए पत्ती को स्कैन करें और सलाह स्क्रीन खोलें, या अपने स्थानीय कृषि कार्यालय से पूछें।",
    banned:
      "यह उत्पाद अनुमत नहीं है। अनुमोदित विकल्प के लिए अपने स्थानीय कृषि कार्यालय से पूछें।",
    empty: "मैं उत्तर तैयार नहीं कर सका। कृपया दूसरे शब्दों में फिर पूछें।",
  },
  mr: {
    dose: "अचूक प्रमाणासाठी पान स्कॅन करा आणि सल्ला स्क्रीन उघडा, किंवा तुमच्या स्थानिक कृषी कार्यालयाला विचारा.",
    banned:
      "हे उत्पादन परवानगी नसलेले आहे. मान्यताप्राप्त पर्यायासाठी स्थानिक कृषी कार्यालयाला विचारा.",
    empty: "मी उत्तर तयार करू शकलो नाही. कृपया दुसऱ्या शब्दांत पुन्हा विचारा.",
  },
  te: {
    dose: "సరైన మోతాదు కోసం ఆకును స్కాన్ చేసి సలహా స్క్రీన్ తెరవండి, లేదా మీ స్థానిక వ్యవసాయ కార్యాలయాన్ని అడగండి.",
    banned:
      "ఈ ఉత్పత్తికి అనుమతి లేదు. ఆమోదిత ప్రత్యామ్నాయం కోసం మీ స్థానిక వ్యవసాయ కార్యాలయాన్ని అడగండి.",
    empty: "నేను సమాధానం సిద్ధం చేయలేకపోయాను. దయచేసి మరో విధంగా మళ్లీ అడగండి.",
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

export function systemPrompt(lang: Lang, topic = ""): string {
  const scan = topic
    ? `\nThe farmer just scanned a leaf and the app found: ${topic}. Treat this as background only and say it may be wrong.`
    : "";
  return `You are AgriEdge, a friendly offline farming assistant for small farmers in India.
Answer only questions about crops, plant diseases, pests, soil, water and farming practice. If the question is about something else, say politely that you can only help with farming.
Use simple words and short steps. Keep every answer under 120 words.
Never give pesticide names, brand names or quantities. For treatment or dose, tell the farmer to scan the leaf and open the Advice screen, or to ask the local agriculture office.
If you are not sure, say so.
Reply in ${LANGUAGE_NAMES[lang]}.${scan}`;
}

export function cleanHistory(history: ChatTurn[]): ChatTurn[] | null {
  if (history.length === 0) return null;
  const last = history[history.length - 1];
  if (!last || last.role !== "user") return null;
  const turns = history.slice(-MAX_TURNS).map((t) => ({
    role: t.role,
    content: t.content.trim().slice(0, MAX_CHARS),
  }));
  if (turns.some((t) => t.content.length === 0)) return null;
  while (turns.length > 0 && turns[0]?.role !== "user") turns.shift();
  return turns.length > 0 ? turns : null;
}

export function buildChatMessages(
  turns: ChatTurn[],
  lang: Lang,
  topic?: string,
): ChatMessage[] {
  return [
    { role: "system", content: systemPrompt(lang, cleanTopic(topic)) },
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
