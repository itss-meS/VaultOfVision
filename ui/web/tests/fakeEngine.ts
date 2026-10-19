import {
  type AdvisoryResponse,
  type AskOptions,
  type DeviceHealth,
  type EngineClient,
  type Lang,
  type SessionInfo,
  type VisionResult,
} from "../src/contracts/types";

const CLASSES = [
  "Bacterial Spot",
  "Early Blight",
  "Late Blight",
  "Leaf Mold",
  "Septoria Leaf Spot",
  "Spider Mites",
  "Target Spot",
  "Yellow Leaf Curl Virus",
  "Mosaic Virus",
  "Healthy",
];

const SEVERITY_WORDS: Record<Lang, string[]> = {
  en: ["Very Low", "Low", "Moderate", "High", "Severe"],
  hi: ["बहुत कम", "कम", "मध्यम", "अधिक", "गंभीर"],
  mr: ["खूप कमी", "कमी", "मध्यम", "जास्त", "तीव्र"],
};

const TEXT: Record<
  Lang,
  { a1: string; a2: string; p1: string; p2: string; safety: string }
> = {
  en: {
    a1: "Remove badly affected leaves and destroy them away from the field.",
    a2: "Water at the base of the plant so leaves stay dry.",
    p1: "Rotate crops every season.",
    p2: "Stake plants for better airflow.",
    safety: "Wear gloves and a mask when spraying.",
  },
  hi: {
    a1: "ज़्यादा प्रभावित पत्तियाँ हटाएँ और उन्हें खेत से दूर नष्ट करें।",
    a2: "पौधे की जड़ के पास पानी दें ताकि पत्तियाँ सूखी रहें।",
    p1: "हर मौसम में फसल चक्र अपनाएँ।",
    p2: "बेहतर हवा के लिए पौधों को सहारा दें।",
    safety: "छिड़काव करते समय दस्ताने और मास्क पहनें।",
  },
  mr: {
    a1: "जास्त बाधित पाने काढून शेतापासून दूर नष्ट करा.",
    a2: "झाडाच्या बुडाशी पाणी द्या म्हणजे पाने कोरडी राहतील.",
    p1: "दर हंगामात पीक फेरपालट करा.",
    p2: "हवा खेळती राहण्यासाठी झाडांना आधार द्या.",
    safety: "फवारणी करताना हातमोजे आणि मास्क वापरा.",
  },
};

function pick(size: number): number {
  return (size * 2654435761) % 2 ** 32;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FakeEngineClient implements EngineClient {
  readonly kind = "http" as const;
  private readonly latencyMs: number;

  constructor(latencyMs = 450) {
    this.latencyMs = latencyMs;
  }

  restoreSession(): Promise<SessionInfo | null> {
    return Promise.resolve({
      profile_id: "00000000-0000-4000-8000-000000000001",
      role: "officer",
      lang: "en",
      csrf: "fake",
      expires_in: 900,
    });
  }

  login(): Promise<SessionInfo> {
    return this.restoreSession().then((s) => {
      if (!s) throw new Error("unreachable");
      return s;
    });
  }

  logout(): Promise<void> {
    return Promise.resolve();
  }

  async analyzeImage(photo: Blob): Promise<VisionResult> {
    await delay(this.latencyMs);
    const seed = pick(photo.size);
    const label = CLASSES[seed % CLASSES.length] ?? "Healthy";
    const confidence = 0.5 + ((seed >>> 4) % 49) / 100;
    const frac = 0.06 + (((seed >>> 8) % 50) / 100) * 0.9;
    const side = Math.sqrt(frac);
    const x0 = (1 - side) / 2;
    const x1 = Math.min(1, x0 + side);
    const low = confidence < 0.55;
    const healthy = label === "Healthy";
    const pct = Math.round(frac * 1000) / 10;
    const level =
      low || healthy
        ? null
        : pct < 5
          ? 1
          : pct < 15
            ? 2
            : pct < 30
              ? 3
              : pct < 50
                ? 4
                : 5;
    return {
      class_id: seed % CLASSES.length,
      label,
      confidence: Math.round(confidence * 1000) / 1000,
      bbox: [x0, x0, x1, x1],
      mask_polygon: [
        [x0, x0],
        [x1, x0],
        [x1, x1],
        [x0, x1],
      ],
      severity_level: level,
      low_confidence: low,
      affected_area_pct: pct,
    };
  }

  async ask(
    _query: string,
    vision: VisionResult | undefined,
    options: AskOptions,
  ): Promise<AdvisoryResponse> {
    await delay(this.latencyMs * 1.5);
    const t = TEXT[options.lang];
    if (!vision || vision.low_confidence) {
      return {
        case_id: null,
        source: "retake",
        advisory: {
          schema_version: "advisory_v3",
          diagnosis: {
            primary: vision?.label ?? "-",
            confidence: vision?.confidence ?? 0,
            differential: [],
          },
          severity: null,
          actions: [{ text: t.a1, priority: "critical" }],
          tool_call: null,
          preventive: [],
          safety_notice: t.safety,
          lang: options.lang,
        },
        dosage: null,
      };
    }
    const level = vision.severity_level;
    const words = SEVERITY_WORDS[options.lang];
    const area = options.area_ha;
    return {
      case_id: null,
      source: "llm",
      advisory: {
        schema_version: "advisory_v3",
        diagnosis: {
          primary: vision.label,
          confidence: vision.confidence,
          differential: [],
        },
        severity:
          level === null
            ? null
            : {
                level,
                label: words[level - 1] ?? "",
                affected_area_pct: vision.affected_area_pct ?? 0,
              },
        actions: [
          { text: t.a1, priority: "critical" },
          { text: t.a2, priority: "high" },
        ],
        tool_call:
          level !== null && area !== undefined
            ? {
                tool: "calc_dosage",
                args: { crop: "tomato", area_ha: area, severity: level },
              }
            : null,
        preventive: [t.p1, t.p2],
        safety_notice: t.safety,
        lang: options.lang,
      },
      dosage: {
        available: false,
        reason: "no_vetted_entry",
        area_ha: area ?? null,
      },
    };
  }

  health(): Promise<DeviceHealth> {
    return Promise.resolve({
      status: "ok",
      platform: "dev",
      uptime_s: 3600,
      adapters: {
        vision: "fake",
        llm: "fake",
        retriever: "fake",
        audio: "fake",
      },
      models: { vision: "fake-vision", llm: "fake-llm" },
      banned_list_version: "dev",
      ota_version: 0,
      peak_rss_kb: 184320,
      temp_c: 52.4,
    });
  }

  speak(text: string, lang: Lang): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window))
      return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === "en" ? "en-IN" : lang === "hi" ? "hi-IN" : "mr-IN";
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    });
  }
}
