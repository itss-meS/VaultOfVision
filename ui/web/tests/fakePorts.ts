import { ASSETS } from "../src/engine/core/engine";
import type {
  ChatMessage,
  Lang,
  NativeHealth,
  NativePorts,
  RawDetection,
} from "../src/engine/core/types";
import signed from "./fixtures/signed.json";

const enc = new TextEncoder();

export interface FakePortOptions {
  detection?: RawDetection | null;
  replies?: Array<string | Error>;
  chunks?: string;
  assets?: Partial<Record<keyof typeof ASSETS, Uint8Array | null>>;
}

export class FakePorts implements NativePorts {
  readonly prompts: ChatMessage[][] = [];
  readonly spoken: Array<[string, Lang]> = [];
  private idx = 0;

  constructor(private readonly opts: FakePortOptions = {}) {}

  async detect(): Promise<RawDetection | null> {
    return this.opts.detection === undefined
      ? { class_id: 1, label: "Tomato Early Blight", confidence: 0.9 }
      : this.opts.detection;
  }

  async generate(messages: ChatMessage[]): Promise<string> {
    this.prompts.push(messages);
    const replies = this.opts.replies ?? [];
    const r = replies[Math.min(this.idx, replies.length - 1)];
    this.idx += 1;
    if (r === undefined) throw new Error("no reply");
    if (r instanceof Error) throw r;
    return r;
  }

  async speak(text: string, lang: Lang): Promise<void> {
    this.spoken.push([text, lang]);
  }

  async readAsset(name: string): Promise<Uint8Array | null> {
    const o = this.opts.assets ?? {};
    const key = (Object.keys(ASSETS) as Array<keyof typeof ASSETS>).find(
      (k) => ASSETS[k] === name,
    );
    if (key === undefined) return null;
    if (key in o) return o[key] ?? null;
    const table: Record<keyof typeof ASSETS, string | null> = {
      trust: signed.public_pem,
      banned: signed.banned,
      bannedSig: signed.banned_sig,
      dosage: signed.dosage,
      dosageSig: signed.dosage_sig,
      chunks: this.opts.chunks ?? null,
    };
    const v = table[key];
    return v === null ? null : enc.encode(v);
  }

  async health(): Promise<NativeHealth> {
    return {
      platform: "android",
      vision_adapter: "fake",
      llm_adapter: "fake",
      audio_adapter: "fake",
      vision_model: "v",
      llm_model: "l",
      peak_rss_kb: null,
      temp_c: null,
    };
  }
}

export function goodAdvisory(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schema_version: "advisory_v3",
    diagnosis: { primary: "Early Blight", confidence: 0.9, differential: [] },
    severity: null,
    actions: [{ text: "Remove affected leaves.", priority: "high" }],
    tool_call: {
      tool: "calc_dosage",
      args: { crop: "tomato", area_ha: 99, severity: 5 },
    },
    preventive: ["Rotate crops."],
    safety_notice: "Wear gloves.",
    lang: "en",
    ...over,
  });
}
