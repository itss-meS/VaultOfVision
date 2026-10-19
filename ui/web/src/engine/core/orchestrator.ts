import { buildMessages } from "./prompts";
import type { RuleEngine } from "./rules";
import { buildVisionResult, unsupportedVision } from "./severity";
import { DEFAULT_SEVERITY_LABELS, SEVERITY_LABELS, T } from "./templates";
import * as templates from "./templates";
import { calcDosage, type DosageTable } from "./tools";
import type {
  Advisory,
  AdvisorySource,
  DosageResult,
  LlmPort,
  Lang,
  RawDetection,
  Retriever,
  SeverityInfo,
  ToolCall,
  VisionResult,
} from "./types";
import { validateAdvisory } from "./validate";

export interface Outcome {
  source: AdvisorySource;
  advisory: Advisory;
  dosage: DosageResult | null;
  attempts: number;
  latency_ms: number;
}

export interface OrchestratorConfig {
  maxCtx: number;
  maxTokens: number;
  crop: "tomato";
  maxRetries: number;
}

export const DEFAULT_CONFIG: OrchestratorConfig = {
  maxCtx: 2048,
  maxTokens: 700,
  crop: "tomato",
  maxRetries: 2,
};

const UNSUPPORTED_LABELS = new Set(["unsupported", "not_tomato", "other_crop"]);

export function extractJson(raw: string): unknown {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^`+|`+$/g, "");
    if (text.toLowerCase().startsWith("json")) text = text.slice(4);
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no json object");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

export function detectionToVision(
  det: RawDetection | null,
  confThreshold: number,
  thresholds: readonly number[],
): VisionResult {
  if (det === null) return unsupportedVision();
  return buildVisionResult(det, confThreshold, thresholds);
}

export class Orchestrator {
  constructor(
    private readonly llm: LlmPort,
    private readonly retriever: Retriever,
    private readonly rules: RuleEngine,
    private readonly dosage: DosageTable,
    private readonly config: OrchestratorConfig = DEFAULT_CONFIG,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private severityInfo(
    vision: VisionResult | null,
    lang: Lang,
  ): SeverityInfo | null {
    if (vision === null || vision.severity_level === null) return null;
    const level = vision.severity_level;
    return {
      level,
      label:
        SEVERITY_LABELS[lang][level] ?? DEFAULT_SEVERITY_LABELS[level] ?? "",
      affected_area_pct: vision.affected_area_pct ?? 0,
    };
  }

  private finalize(
    source: AdvisorySource,
    advisory: Advisory,
    dosage: DosageResult | null,
    attempts: number,
    t0: number,
  ): Outcome {
    let adv = advisory;
    let dos = dosage;
    let src = source;
    if (!this.rules.isClean({ a: adv, d: dos })) {
      const lang = adv.lang;
      adv = templates.fallback(lang, T[lang]?.["retake_diag"] ?? "", 0, null);
      dos = null;
      src = "fallback";
    }
    validateAdvisory(adv);
    return {
      source: src,
      advisory: adv,
      dosage: dos,
      attempts,
      latency_ms: this.now() - t0,
    };
  }

  async advise(
    query: string,
    vision: VisionResult | null,
    lang: Lang,
    region: string,
    areaHa: number | null,
  ): Promise<Outcome> {
    const t0 = this.now();
    const conf = vision ? vision.confidence : 0;
    if (this.rules.mentionsBanned(query)) {
      const diag = vision && !vision.low_confidence ? vision.label : null;
      return this.finalize(
        "refusal",
        templates.refusal(lang, diag, conf),
        null,
        0,
        t0,
      );
    }
    if (vision === null || vision.low_confidence)
      return this.finalize("retake", templates.retake(lang, conf), null, 0, t0);
    const label = vision.label.toLowerCase();
    if (UNSUPPORTED_LABELS.has(label))
      return this.finalize("refusal", templates.unsupported(lang), null, 0, t0);
    if (label === "healthy")
      return this.finalize("llm", templates.healthy(lang, conf), null, 0, t0);

    const severity = this.severityInfo(vision, lang);
    const chunks = this.retriever.search(
      query || vision.label,
      { crop: this.config.crop, disease: vision.label },
      4,
    );
    const texts = chunks
      .map((c) => c.text)
      .filter((t) => this.rules.isClean(t));
    const messages = buildMessages(
      vision,
      vision.affected_area_pct,
      query,
      texts,
      lang,
      region,
      areaHa,
      this.config.maxCtx * 3,
    );

    let attempts = 0;
    for (let i = 0; i <= this.config.maxRetries; i++) {
      attempts += 1;
      let advisory: Advisory;
      try {
        const raw = await this.llm.generate(messages, this.config.maxTokens);
        const data = extractJson(raw);
        if (typeof data === "object" && data !== null && !Array.isArray(data))
          (data as Record<string, unknown>)["lang"] = lang;
        advisory = validateAdvisory(data);
      } catch {
        continue;
      }
      if (!this.rules.isClean(advisory)) continue;
      const adv: Advisory = { ...advisory, severity };
      const dosage = this.runTool(advisory, vision, areaHa, adv);
      return this.finalize("llm", adv, dosage, attempts, t0);
    }
    return this.finalize(
      "fallback",
      templates.fallback(lang, vision.label, conf, severity),
      null,
      attempts,
      t0,
    );
  }

  private runTool(
    advisory: Advisory,
    vision: VisionResult,
    areaHa: number | null,
    adv: Advisory,
  ): DosageResult | null {
    if (advisory.tool_call === null || vision.severity_level === null) {
      adv.tool_call = null;
      return null;
    }
    if (areaHa === null) {
      adv.tool_call = null;
      return { available: false, reason: "area_missing" };
    }
    const call: ToolCall = {
      tool: "calc_dosage",
      args: {
        crop: "tomato",
        area_ha: areaHa,
        severity: vision.severity_level,
      },
    };
    adv.tool_call = call;
    return calcDosage(call, vision.label, this.dosage, this.rules);
  }
}
