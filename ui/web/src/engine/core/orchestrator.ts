import { KnowledgeBase } from "./knowledge";
import { parseLabel as parseCanonical } from "./labels";
import {
  displayLabel,
  isUnsupportedLabel,
  parseLabel,
  type ParsedLabel,
} from "./labelParse";
import { buildMessages } from "./prompts";
import type { RuleEngine } from "./rules";
import { buildVisionResult, unsupportedVision } from "./severity";
import { DEFAULT_SEVERITY_LABELS, SEVERITY_LABELS, T } from "./templates";
import * as templates from "./templates";
import { calcDosage, calcPestDosage, type DosageTable } from "./tools";
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
  maxRetries: number;
  llmAdvice: boolean;
}

export const DEFAULT_CONFIG: OrchestratorConfig = {
  maxCtx: 2048,
  maxTokens: 700,
  maxRetries: 2,
  llmAdvice: true,
};

const DOSE_TEXT =
  /[0-9\u0966-\u096f\u0c66-\u0c6f]\s*(?:(?:mg|g|gm|gms|gram|grams|kg|kgs|ml|mls|l|lit|litre|litres|liter|liters|cc|ppm)(?![\p{L}])|\u0917\u094d\u0930\u093e\u092e|\u0917\u094d\u0930\u0945\u092e|\u0915\u093f\u0932\u094b|\u0932\u0940\u091f\u0930|\u0932\u093f\u091f\u0930|\u092e\u093f\u0932\u0940|\u0c17\u0c4d\u0c30\u0c3e\u0c2e\u0c41|\u0c17\u0c4d\u0c30\u0c3e|\u0c15\u0c3f\u0c32\u0c4b|\u0c32\u0c40\u0c1f\u0c30\u0c41|\u0c32\u0c40\u0c1f\u0c30\u0c4d|\u0c2e\u0c3f\u0c32\u0c4d\u0c32\u0c40)|\b(?:per|each)\s+(?:ha|hectare|acre|litre|liter)\b|\/\s*(?:ha|ac|acre|hectare|l|lit|litre|liter)\b/iu;

export function mentionsDose(advisory: Advisory): boolean {
  const parts = [
    ...advisory.actions.map((a) => a.text),
    ...advisory.preventive,
    advisory.safety_notice,
  ];
  return parts.some((t) => DOSE_TEXT.test(t));
}

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
    private readonly kb: KnowledgeBase = KnowledgeBase.empty(),
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

  private hasVettedDisease(parsed: ParsedLabel): boolean {
    if (parsed.crop === null) return false;
    return (
      this.dosage.crops().has(parsed.crop) &&
      this.dosage.hasDisease(parsed.crop, parsed.name)
    );
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
    if (isUnsupportedLabel(vision.label))
      return this.finalize("refusal", templates.unsupported(lang), null, 0, t0);
    const parsed = parseLabel(vision.label);
    const source: AdvisorySource = this.config.llmAdvice ? "llm" : "knowledge";
    if (
      parsed.kind === "healthy" ||
      parseCanonical(vision.label).kind === "healthy"
    )
      return this.finalize(source, templates.healthy(lang, conf), null, 0, t0);

    const severity = this.severityInfo(vision, lang);
    if (!this.config.llmAdvice)
      return this.fromKnowledge(
        vision,
        parsed,
        lang,
        conf,
        severity,
        areaHa,
        t0,
      );
    const filters: Record<string, string> =
      parsed.kind === "pest"
        ? { disease: parsed.name }
        : { crop: parsed.crop ?? "", disease: parsed.name };
    const chunks = this.retriever.search(
      `${displayLabel(parsed)} ${query}`,
      filters,
      4,
    );
    const texts = chunks
      .map((c) => c.text)
      .filter((t) => this.rules.isClean(t));

    const usable =
      parsed.kind === "pest" ? texts.length > 0 : this.hasVettedDisease(parsed);
    if (!usable) return this.noData(lang, parsed, conf, severity, t0);

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
      if (!this.rules.isClean(advisory) || mentionsDose(advisory)) continue;
      const adv: Advisory = { ...advisory, severity };
      const dosage = this.runTool(advisory, vision, parsed, areaHa, adv);
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

  private fromKnowledge(
    vision: VisionResult,
    parsed: ParsedLabel,
    lang: Lang,
    conf: number,
    severity: SeverityInfo | null,
    areaHa: number | null,
    t0: number,
  ): Outcome {
    const card = this.kb.find(vision.label, lang);
    if (card === null) {
      const kind = parsed.kind === "pest" ? "pest" : "disease";
      return this.finalize(
        "fallback",
        templates.generic(
          lang,
          kind,
          (kind === "pest" ? parsed.name : displayLabel(parsed)).slice(0, 120),
          conf,
          severity,
        ),
        null,
        0,
        t0,
      );
    }
    const adv = templates.fromCard(card, conf, severity);
    const dosage = this.runTool(null, vision, parsed, areaHa, adv);
    return this.finalize("knowledge", adv, dosage, 0, t0);
  }

  private noData(
    lang: Lang,
    parsed: ParsedLabel,
    conf: number,
    severity: SeverityInfo | null,
    t0: number,
  ): Outcome {
    return this.finalize(
      "fallback",
      templates.noData(lang, displayLabel(parsed), conf, severity),
      null,
      0,
      t0,
    );
  }

  private runTool(
    advisory: Advisory | null,
    vision: VisionResult,
    parsed: ParsedLabel,
    areaHa: number | null,
    adv: Advisory,
  ): DosageResult | null {
    adv.tool_call = null;
    if (advisory !== null && advisory.tool_call === null) return null;
    if (parsed.kind === "pest") {
      if (areaHa === null) return { available: false, reason: "area_missing" };
      return calcPestDosage(parsed.name, areaHa, this.dosage, this.rules);
    }
    if (vision.severity_level === null || parsed.crop === null) return null;
    if (areaHa === null) return { available: false, reason: "area_missing" };
    const call: ToolCall = {
      tool: "calc_dosage",
      args: {
        crop: parsed.crop,
        area_ha: areaHa,
        severity: vision.severity_level,
      },
    };
    adv.tool_call = call;
    return calcDosage(call, parsed.name, this.dosage, this.rules);
  }
}
