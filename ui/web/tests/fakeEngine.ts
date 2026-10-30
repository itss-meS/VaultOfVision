import {
  type AdvisoryResponse,
  type AskOptions,
  type Candidate,
  type ChatTurn,
  type DeviceHealth,
  type EngineClient,
  EngineError,
  type Lang,
  type LedgerStats,
  type NewScan,
  type ProfilePatch,
  type ScanKind,
  type ScanRecord,
  type SignUpInput,
  type UserProfile,
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
  te: ["చాలా తక్కువ", "తక్కువ", "మధ్యస్థం", "ఎక్కువ", "తీవ్రం"],
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
  te: {
    a1: "బాగా దెబ్బతిన్న ఆకులను తొలగించి పొలానికి దూరంగా నాశనం చేయండి.",
    a2: "ఆకులు పొడిగా ఉండేలా మొక్క మొదట్లో నీరు పోయండి.",
    p1: "ప్రతి సీజన్‌లో పంట మార్పిడి చేయండి.",
    p2: "గాలి బాగా ఆడేలా మొక్కలకు ఆసరా ఇవ్వండి.",
    safety: "పిచికారీ చేసేటప్పుడు చేతి తొడుగులు మరియు మాస్క్ ధరించండి.",
  },
};

function pick(size: number): number {
  return (size * 2654435761) % 2 ** 32;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FakeEngineClient implements EngineClient {
  readonly kind = "device" as const;
  private readonly latencyMs: number;
  private readonly users = new Map<
    string,
    UserProfile & { password: string }
  >();
  private current: string | null = null;
  private rows: Array<
    ScanRecord & { userId: string; advice: AdvisoryResponse | null }
  > = [];
  private nextId = 1;
  private shown: Candidate[] = [];
  private lastKind: ScanKind = "disease";
  chatReply: string | Error = "Water early in the day.";
  readonly chatCalls: ChatTurn[][] = [];
  readonly chatTopics: Array<string | undefined> = [];

  constructor(latencyMs = 450, signedIn = false) {
    this.latencyMs = latencyMs;
    if (signedIn) {
      this.users.set("9876543210", {
        id: "u1",
        name: "Asha Patil",
        mobile: "9876543210",
        village: "",
        areaHa: null,
        lang: "en",
        password: "secret1",
      });
      this.current = "9876543210";
    }
  }

  private user(): UserProfile & { password: string } {
    const u = this.current ? this.users.get(this.current) : undefined;
    if (!u) throw new EngineError("auth", "sign in required");
    return u;
  }

  private strip(u: UserProfile & { password: string }): UserProfile {
    return {
      id: u.id,
      name: u.name,
      mobile: u.mobile,
      village: u.village,
      areaHa: u.areaHa,
      lang: u.lang,
    };
  }

  restoreSession(): Promise<UserProfile | null> {
    const u = this.current ? this.users.get(this.current) : undefined;
    return Promise.resolve(u ? this.strip(u) : null);
  }

  signUp(input: SignUpInput): Promise<UserProfile> {
    if (this.users.has(input.mobile))
      return Promise.reject(new EngineError("exists", "exists"));
    const u = {
      id: `u${this.nextId++}`,
      name: input.name.trim(),
      mobile: input.mobile,
      village: input.village ?? "",
      areaHa: null,
      lang: input.lang ?? "en",
      password: input.password,
    };
    this.users.set(u.mobile, u);
    this.current = u.mobile;
    return Promise.resolve(this.strip(u));
  }

  login(mobile: string, password: string): Promise<UserProfile> {
    const u = this.users.get(mobile);
    if (!u || u.password !== password)
      return Promise.reject(new EngineError("auth", "invalid"));
    this.current = mobile;
    return Promise.resolve(this.strip(u));
  }

  logout(): Promise<void> {
    this.current = null;
    return Promise.resolve();
  }

  updateProfile(patch: ProfilePatch): Promise<UserProfile> {
    const u = this.user();
    Object.assign(u, patch);
    return Promise.resolve(this.strip(u));
  }

  deleteAccount(password: string): Promise<void> {
    const u = this.user();
    if (u.password !== password)
      return Promise.reject(new EngineError("auth", "invalid"));
    this.users.delete(u.mobile);
    this.rows = this.rows.filter((r) => r.userId !== u.id);
    this.current = null;
    return Promise.resolve();
  }

  saveScan(scan: NewScan): Promise<string> {
    const u = this.user();
    const id = `s${this.nextId++}`;
    this.rows.unshift({
      id,
      userId: u.id,
      label: scan.vision.label,
      kind: /healthy$/i.test(scan.vision.label) ? "healthy" : this.lastKind,
      confidence: scan.vision.confidence,
      severity: scan.vision.severity_level,
      durationMs: scan.durationMs,
      thumb: scan.thumb,
      createdAt: Date.now(),
      hasAdvice: false,
      advice: null,
    });
    return Promise.resolve(id);
  }

  attachAdvice(scanId: string, response: AdvisoryResponse): Promise<void> {
    const row = this.rows.find((r) => r.id === scanId);
    if (row) {
      row.advice = response;
      row.hasAdvice = true;
    }
    return Promise.resolve();
  }

  listScans(): Promise<ScanRecord[]> {
    const u = this.user();
    return Promise.resolve(
      this.rows
        .filter((r) => r.userId === u.id)
        .map(({ userId: _u, advice: _a, ...rest }) => rest),
    );
  }

  getAdvice(scanId: string): Promise<AdvisoryResponse | null> {
    return Promise.resolve(
      this.rows.find((r) => r.id === scanId)?.advice ?? null,
    );
  }

  deleteScan(scanId: string): Promise<void> {
    this.rows = this.rows.filter((r) => r.id !== scanId);
    return Promise.resolve();
  }

  clearScans(): Promise<void> {
    const u = this.user();
    this.rows = this.rows.filter((r) => r.userId !== u.id);
    return Promise.resolve();
  }

  async ledgerStats(): Promise<LedgerStats> {
    const list = await this.listScans();
    return {
      scans: list.length,
      bytes: list.length * 100,
      lastAt: list[0]?.createdAt ?? null,
    };
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
    const rounded = Math.round(confidence * 1000) / 1000;
    this.shown = [
      {
        label,
        confidence: rounded,
        kind: healthy ? "healthy" : "disease",
        source: "plantvillage-all/vision.onnx",
      },
      {
        label: "flea beetle",
        confidence: 0.31,
        kind: "pest",
        source: "ip102/vision.onnx",
      },
    ];
    this.lastKind = this.shown[0]?.kind ?? "disease";
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

  candidates(): Candidate[] {
    return this.shown;
  }

  warmed = 0;

  async warmUp(): Promise<void> {
    this.warmed += 1;
  }

  async chat(
    history: ChatTurn[],
    _lang: Lang,
    topic?: string,
    onPartial?: (text: string) => void,
  ): Promise<string> {
    this.user();
    await delay(this.latencyMs);
    this.chatCalls.push(history);
    this.chatTopics.push(topic);
    if (this.chatReply instanceof Error) throw this.chatReply;
    if (onPartial !== undefined) {
      const words = this.chatReply.split(" ");
      for (let n = 1; n < words.length; n++)
        onPartial(words.slice(0, n).join(" "));
    }
    return this.chatReply;
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
      u.lang = { en: "en-IN", hi: "hi-IN", mr: "mr-IN", te: "te-IN" }[lang];
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    });
  }
}
