import type { Chunk, Retriever } from "./types";

const TOKEN = /[\p{L}\p{N}\p{M}]{2,}/gu;
const K1 = 1.2;
const B = 0.75;
const FILTERS = ["crop", "disease", "lang", "region", "stage"] as const;

function tokens(text: string): string[] {
  return (text.normalize("NFKC").toLowerCase().match(TOKEN) ?? []).slice(
    0,
    4000,
  );
}

interface Doc {
  chunk: Omit<Chunk, "score">;
  tf: Map<string, number>;
  len: number;
}

export class Bm25Retriever implements Retriever {
  private readonly docs: Doc[];
  private readonly df = new Map<string, number>();
  private readonly avgLen: number;

  constructor(chunks: Array<Omit<Chunk, "score">>) {
    this.docs = chunks.map((chunk) => {
      const tf = new Map<string, number>();
      const toks = tokens(chunk.text);
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { chunk, tf, len: toks.length };
    });
    const total = this.docs.reduce((a, d) => a + d.len, 0);
    this.avgLen =
      this.docs.length > 0 ? Math.max(1, total / this.docs.length) : 1;
  }

  static fromJsonl(text: string): Bm25Retriever {
    const chunks: Array<Omit<Chunk, "score">> = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const d = JSON.parse(line) as Record<string, unknown>;
      chunks.push({
        id: String(d["id"]),
        text: String(d["text"]),
        crop: String(d["crop"] ?? ""),
        disease: String(d["disease"] ?? ""),
        stage: String(d["stage"] ?? "any"),
        lang: String(d["lang"] ?? "en"),
        region: String(d["region"] ?? "any"),
      });
    }
    return new Bm25Retriever(chunks);
  }

  search(query: string, filters: Record<string, string>, k: number): Chunk[] {
    const terms = [...new Set(tokens(query))].slice(0, 12);
    if (terms.length === 0) return [];
    const n = this.docs.length;
    const scored: Chunk[] = [];
    for (const doc of this.docs) {
      let ok = true;
      for (const col of FILTERS) {
        const want = filters[col] ?? "";
        if (want !== "" && doc.chunk[col].toLowerCase() !== want.toLowerCase())
          ok = false;
      }
      if (!ok) continue;
      let score = 0;
      for (const t of terms) {
        const f = doc.tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score +=
          (idf * f * (K1 + 1)) /
          (f + K1 * (1 - B + (B * doc.len) / this.avgLen));
      }
      if (score > 0) scored.push({ ...doc.chunk, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(1, Math.min(k, 10)));
  }
}
