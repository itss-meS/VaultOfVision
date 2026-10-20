import { LocalEngineClient } from "./core/engine";
import type {
  ChatMessage,
  Lang,
  NativeHealth,
  NativePorts,
  RawDetection,
} from "./core/types";

const SAMPLE_DETECTION: RawDetection = {
  class_id: 1,
  label: "Early Blight",
  confidence: 0.91,
  bbox: [0.2, 0.2, 0.8, 0.8],
  leaf_polygon: [
    [0.1, 0.1],
    [0.9, 0.1],
    [0.9, 0.9],
    [0.1, 0.9],
  ],
  mask_polygon: [
    [0.3, 0.3],
    [0.5, 0.3],
    [0.5, 0.5],
    [0.3, 0.5],
  ],
};

const SAMPLE_ADVISORY = {
  schema_version: "advisory_v3",
  diagnosis: { primary: "Early Blight", confidence: 0.91, differential: [] },
  severity: null,
  actions: [
    {
      text: "Development sample only. Remove the affected leaves and keep them away from the field.",
      priority: "high",
    },
    {
      text: "Avoid watering the leaves late in the day.",
      priority: "normal",
    },
  ],
  tool_call: { tool: "calc_dosage", args: { crop: "tomato", area_ha: 1, severity: 1 } },
  preventive: ["Rotate crops each season.", "Space plants for air flow."],
  safety_notice: "Development sample, not agronomic advice. Wear gloves when handling plants.",
  lang: "en",
};

const memory = new Map<string, string>();

const SAFE_NAME = /^knowledge\/[A-Za-z0-9_.-]+$/;

export class DevBrowserPorts implements NativePorts {
  async detect(): Promise<RawDetection | null> {
    return SAMPLE_DETECTION;
  }

  async generate(_messages: ChatMessage[]): Promise<string> {
    return JSON.stringify(SAMPLE_ADVISORY);
  }

  async speak(text: string, lang: Lang): Promise<void> {
    if (typeof speechSynthesis === "undefined") return;
    const tags: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", mr: "mr-IN" };
    const u = new SpeechSynthesisUtterance(text);
    u.lang = tags[lang];
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  async readAsset(name: string): Promise<Uint8Array | null> {
    if (!SAFE_NAME.test(name)) return null;
    const res = await fetch(`/dev-assets/${name.slice("knowledge/".length)}`);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  }

  async kvGet(key: string): Promise<string | null> {
    return memory.get(key) ?? null;
  }

  async kvSet(key: string, value: string): Promise<void> {
    memory.set(key, value);
  }

  async health(): Promise<NativeHealth> {
    return {
      platform: "browser-dev",
      vision_adapter: "sample",
      llm_adapter: "sample",
      audio_adapter: "speechSynthesis",
      vision_model: "none",
      llm_model: "none",
      peak_rss_kb: null,
      temp_c: null,
    };
  }
}

export class DevBrowserEngineClient extends LocalEngineClient {
  constructor() {
    super(new DevBrowserPorts(), { pinIterations: 1000 });
  }
}
