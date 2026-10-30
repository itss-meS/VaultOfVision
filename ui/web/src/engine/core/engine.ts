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
  type ScanRecord,
  type SignUpInput,
  type UserProfile,
  type VisionResult,
} from "../../contracts/types";
import { migrate, type Sql } from "../../db/sql";
import { Accounts, SESSION_MS } from "./accounts";
import {
  buildChatMessages,
  CHAT_TOKENS,
  cleanHistory,
  finishReply,
  MAX_CONTEXT,
  selectContext,
  StreamGuard,
} from "./chat";
import { type CropGate, DEFAULT_GATE, screenDetection } from "./crop";
import { KnowledgeBase } from "./knowledge";
import { Throttle } from "./localAuth";
import {
  DEFAULT_CONFIG,
  detectionToVision,
  Orchestrator,
} from "./orchestrator";
import { Bm25Retriever } from "./retriever";
import { type RuleEngine, rulesFromDocument } from "./rules";
import { kindFor, Scans } from "./scans";
import { loadSignedJson, publicKeyFromPem } from "./signing";
import { dosageFromDocument } from "./tools";
import type { Chunk, NativePorts, RawDetection, Retriever } from "./types";
import { validateAdvisory, validateVision } from "./validate";

export const ASSETS = {
  trust: "knowledge/release_ed25519.pub",
  banned: "knowledge/banned_pesticides.json",
  bannedSig: "knowledge/banned_pesticides.json.sig",
  dosage: "knowledge/dosage_table.json",
  dosageSig: "knowledge/dosage_table.json.sig",
  chunks: "knowledge/chunks.jsonl",
  cards: "knowledge/cards.json",
} as const;

export interface LocalEngineOptions {
  confThreshold: number;
  thresholds: readonly number[];
  maxImageBytes: number;
  pinIterations: number;
  gate: CropGate;
  groundScore: number;
  llmAdvice: boolean;
}

export const DEFAULT_OPTIONS: LocalEngineOptions = {
  confThreshold: 0.55,
  thresholds: [5, 15, 30, 50],
  maxImageBytes: 8_000_000,
  pinIterations: 210000,
  gate: DEFAULT_GATE,
  groundScore: 3,
  llmAdvice: false,
};

const dec = new TextDecoder();

interface Loaded {
  orchestrator: Orchestrator;
  rules: RuleEngine;
  retriever: Retriever;
  bannedVersion: number;
}

const MAX_CANDIDATES = 3;

function asSource(value: unknown): AdvisoryResponse["source"] {
  return value === "llm" ||
    value === "knowledge" ||
    value === "refusal" ||
    value === "retake"
    ? value
    : "fallback";
}

interface Store {
  accounts: Accounts;
  scans: Scans;
}

function base64Size(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () =>
      reject(new EngineError("rejected", "unreadable image"));
    reader.readAsDataURL(blob);
  });
}

export class LocalEngineClient implements EngineClient {
  readonly kind = "device" as const;
  private user: UserProfile | null = null;
  private expiresAt = 0;
  private loading: Promise<Loaded> | null = null;
  private opening: Promise<Store> | null = null;
  private busy = false;
  private lastModel = "";
  private shown: RawDetection[] = [];
  private readonly started = Date.now();
  private readonly throttle = new Throttle();
  private readonly opts: LocalEngineOptions;

  constructor(
    private readonly ports: NativePorts,
    private readonly openSql: () => Promise<Sql>,
    options: Partial<LocalEngineOptions> = {},
  ) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
  }

  private store(): Promise<Store> {
    if (this.opening === null) {
      this.opening = (async () => {
        const sql = await this.openSql();
        await migrate(sql);
        return {
          accounts: new Accounts(sql, this.opts.pinIterations),
          scans: new Scans(sql),
        };
      })().catch((err: unknown) => {
        this.opening = null;
        throw err;
      });
    }
    return this.opening;
  }

  private async load(): Promise<Loaded> {
    const p = this.ports;
    const trust = await p.readAsset(ASSETS.trust);
    const banned = await p.readAsset(ASSETS.banned);
    const bannedSig = await p.readAsset(ASSETS.bannedSig);
    const dosage = await p.readAsset(ASSETS.dosage);
    const dosageSig = await p.readAsset(ASSETS.dosageSig);
    if (!trust || !banned || !bannedSig || !dosage || !dosageSig)
      throw new EngineError("unknown", "advice assets missing");
    try {
      const key = publicKeyFromPem(dec.decode(trust));
      const rules = rulesFromDocument(
        loadSignedJson(banned, dec.decode(bannedSig), key),
      );
      const table = dosageFromDocument(
        loadSignedJson(dosage, dec.decode(dosageSig), key),
      );
      const chunks = await p.readAsset(ASSETS.chunks);
      const retriever: Retriever = chunks
        ? Bm25Retriever.fromJsonl(dec.decode(chunks))
        : new Bm25Retriever([]);
      const cards = await p.readAsset(ASSETS.cards);
      let kb = KnowledgeBase.empty();
      if (cards) {
        try {
          kb = KnowledgeBase.fromJson(dec.decode(cards));
        } catch {
          kb = KnowledgeBase.empty();
        }
      }
      return {
        orchestrator: new Orchestrator(
          p,
          retriever,
          rules,
          table,
          { ...DEFAULT_CONFIG, llmAdvice: this.opts.llmAdvice },
          () => Date.now(),
          kb,
        ),
        rules,
        retriever,
        bannedVersion: rules.version,
      };
    } catch {
      throw new EngineError("unknown", "advice assets untrusted");
    }
  }

  private ready(): Promise<Loaded> {
    if (this.loading === null) {
      this.loading = this.load().catch((err: unknown) => {
        this.loading = null;
        throw err;
      });
    }
    return this.loading;
  }

  private requireUser(): UserProfile {
    if (this.user === null || Date.now() >= this.expiresAt) {
      this.user = null;
      throw new EngineError("auth", "sign in required");
    }
    return this.user;
  }

  private open(user: UserProfile): UserProfile {
    this.user = user;
    this.expiresAt = Date.now() + SESSION_MS;
    return user;
  }

  private wrap(err: unknown, message: string): EngineError {
    return err instanceof EngineError
      ? err
      : new EngineError("unknown", message);
  }

  async restoreSession(): Promise<UserProfile | null> {
    if (this.user !== null && Date.now() < this.expiresAt) return this.user;
    try {
      const { accounts } = await this.store();
      const user = await accounts.restore();
      return user === null ? null : this.open(user);
    } catch (err) {
      throw this.wrap(err, "storage unavailable");
    }
  }

  async signUp(input: SignUpInput): Promise<UserProfile> {
    try {
      const { accounts } = await this.store();
      return this.open(await accounts.signUp(input));
    } catch (err) {
      throw this.wrap(err, "sign up failed");
    }
  }

  async login(mobile: string, password: string): Promise<UserProfile> {
    if (this.throttle.locked())
      throw new EngineError("rate", "too many attempts");
    try {
      const { accounts } = await this.store();
      const user = await accounts.login(mobile, password);
      this.throttle.ok();
      return this.open(user);
    } catch (err) {
      if (err instanceof EngineError && err.code === "auth")
        this.throttle.failed();
      throw this.wrap(err, "sign in failed");
    }
  }

  async logout(): Promise<void> {
    this.user = null;
    this.expiresAt = 0;
    try {
      const { accounts } = await this.store();
      await accounts.end();
    } catch (err) {
      throw this.wrap(err, "sign out failed");
    }
  }

  async updateProfile(patch: ProfilePatch): Promise<UserProfile> {
    const user = this.requireUser();
    try {
      const { accounts } = await this.store();
      const next = await accounts.update(user.id, patch);
      this.user = next;
      return next;
    } catch (err) {
      throw this.wrap(err, "profile not saved");
    }
  }

  async deleteAccount(password: string): Promise<void> {
    const user = this.requireUser();
    try {
      const { accounts } = await this.store();
      await accounts.remove(user.id, password);
      this.user = null;
      this.expiresAt = 0;
    } catch (err) {
      throw this.wrap(err, "account not deleted");
    }
  }

  async analyzeImage(photo: Blob): Promise<VisionResult> {
    this.requireUser();
    if (photo.size === 0 || photo.size > this.opts.maxImageBytes)
      throw new EngineError("rejected", "image size not accepted");
    const b64 = await toBase64(photo);
    if (base64Size(b64) > this.opts.maxImageBytes)
      throw new EngineError("rejected", "image size not accepted");
    if (this.busy) throw new EngineError("busy", "engine busy");
    this.busy = true;
    try {
      const raw = await this.ports.detect(b64);
      const det = raw === null ? null : screenDetection(raw, this.opts.gate);
      this.lastModel = det?.model ?? "";
      this.shown = det === null ? [] : this.rank(det);
      return validateVision(
        detectionToVision(det, this.opts.confThreshold, this.opts.thresholds),
      );
    } catch (err) {
      if (err instanceof EngineError) throw err;
      throw new EngineError("unknown", "vision failed");
    } finally {
      this.busy = false;
    }
  }

  private rank(det: RawDetection): RawDetection[] {
    const all: RawDetection[] = [
      det,
      ...(det.alternatives ?? []).map((a) => ({
        class_id: a.class_id,
        label: a.label,
        confidence: a.confidence,
        ...(a.model !== undefined ? { model: a.model } : {}),
        bbox: det.bbox ?? [0, 0, 1, 1],
        mask_polygon: [],
      })),
    ];
    const seen = new Set<string>();
    return all
      .sort((a, b) => b.confidence - a.confidence)
      .filter((d) => {
        const key = `${d.model ?? ""}|${d.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_CANDIDATES);
  }

  candidates(): Candidate[] {
    return this.shown.map((d) => ({
      label: d.label,
      confidence: d.confidence,
      kind: kindFor(d.label, d.model ?? ""),
      source: d.model ?? "",
    }));
  }

  private retrieve(
    retriever: Retriever,
    rules: RuleEngine,
    question: string,
    topic: string | undefined,
    lang: Lang,
  ): Chunk[] {
    const query = `${question} ${topic ?? ""}`;
    let found = retriever.search(query, { lang }, MAX_CONTEXT + 2);
    if (found.length === 0 && lang !== "en")
      found = retriever.search(query, { lang: "en" }, MAX_CONTEXT + 2);
    return found.filter(
      (c) => c.score >= this.opts.groundScore && rules.isClean(c.text),
    );
  }

  async warmUp(): Promise<void> {
    this.requireUser();
    try {
      await this.ready();
      await this.ports.warmUp();
    } catch {
      return;
    }
  }

  async chat(
    history: ChatTurn[],
    lang: Lang,
    topic?: string,
    onPartial?: (text: string) => void,
  ): Promise<string> {
    this.requireUser();
    const turns = cleanHistory(history);
    if (turns === null) throw new EngineError("rejected", "invalid message");
    if (this.busy) throw new EngineError("busy", "engine busy");
    this.busy = true;
    try {
      const { rules, retriever } = await this.ready();
      const question = turns[turns.length - 1]?.content ?? "";
      const found = this.retrieve(retriever, rules, question, topic, lang);
      const context = selectContext(found);
      const used = found.slice(0, context.length);
      const messages = buildChatMessages(turns, lang, topic, context);
      const guard = new StreamGuard(rules);
      let shown = "";
      const onToken =
        onPartial === undefined
          ? undefined
          : (piece: string) => {
              const next = guard.push(piece);
              if (next !== shown) {
                shown = next;
                onPartial(next);
              }
            };
      let raw: string;
      try {
        raw = await this.ports.generate(messages, CHAT_TOKENS, onToken);
      } catch (err) {
        const text = err instanceof Error ? err.message : "";
        if (text === "llm_unavailable")
          throw new EngineError("unavailable", "language model unavailable");
        if (text.startsWith("llm_"))
          throw new EngineError("llm", text.slice(0, 200));
        throw new EngineError("unknown", "chat failed");
      }
      return finishReply(
        raw,
        lang,
        rules,
        used.map((c) => c.source ?? ""),
        context.length > 0,
      );
    } catch (err) {
      if (err instanceof EngineError) throw err;
      throw new EngineError("unknown", "chat failed");
    } finally {
      this.busy = false;
    }
  }

  async ask(
    query: string,
    vision: VisionResult | undefined,
    options: AskOptions,
  ): Promise<AdvisoryResponse> {
    this.requireUser();
    let checked: VisionResult | null = null;
    if (vision !== undefined) {
      try {
        checked = validateVision(vision);
      } catch {
        throw new EngineError("rejected", "invalid vision result");
      }
    }
    const area = options.area_ha ?? null;
    if (area !== null && !(area > 0 && area <= 1000))
      throw new EngineError("rejected", "invalid area");
    if (this.busy) throw new EngineError("busy", "engine busy");
    this.busy = true;
    try {
      const { orchestrator } = await this.ready();
      const out = await orchestrator.advise(
        query.slice(0, 600),
        checked,
        options.lang,
        "",
        area,
      );
      return {
        case_id: null,
        source: out.source,
        advisory: out.advisory,
        dosage: out.dosage,
      };
    } catch (err) {
      if (err instanceof EngineError) throw err;
      throw new EngineError("unknown", "advice failed");
    } finally {
      this.busy = false;
    }
  }

  async speak(text: string, lang: Lang): Promise<void> {
    this.requireUser();
    try {
      await this.ports.speak(text.slice(0, 2000), lang);
    } catch {
      throw new EngineError("unknown", "speech unavailable");
    }
  }

  async health(): Promise<DeviceHealth> {
    let bannedVersion = "unavailable";
    let status = "ok";
    try {
      bannedVersion = String((await this.ready()).bannedVersion);
    } catch {
      status = "degraded";
    }
    const h = await this.ports.health();
    return {
      status,
      platform: h.platform,
      uptime_s: Math.floor((Date.now() - this.started) / 1000),
      adapters: {
        vision: h.vision_adapter,
        llm: h.llm_adapter,
        retriever: "bm25",
        audio: h.audio_adapter,
      },
      models: { vision: h.vision_model, llm: h.llm_model },
      banned_list_version: bannedVersion,
      ota_version: 0,
      peak_rss_kb: h.peak_rss_kb,
      temp_c: h.temp_c,
    };
  }

  async saveScan(scan: NewScan): Promise<string> {
    const user = this.requireUser();
    try {
      const { scans } = await this.store();
      return await scans.add(user.id, scan, this.lastModel);
    } catch (err) {
      throw this.wrap(err, "scan not saved");
    }
  }

  async attachAdvice(
    scanId: string,
    response: AdvisoryResponse,
  ): Promise<void> {
    const user = this.requireUser();
    try {
      const { scans } = await this.store();
      await scans.attach(user.id, scanId, response);
    } catch (err) {
      throw this.wrap(err, "advice not saved");
    }
  }

  async listScans(): Promise<ScanRecord[]> {
    const user = this.requireUser();
    try {
      const { scans } = await this.store();
      return await scans.list(user.id);
    } catch (err) {
      throw this.wrap(err, "history unavailable");
    }
  }

  async getAdvice(scanId: string): Promise<AdvisoryResponse | null> {
    const user = this.requireUser();
    try {
      const { scans } = await this.store();
      const raw = await scans.advice(user.id, scanId);
      if (typeof raw !== "object" || raw === null) return null;
      const entry = raw as Record<string, unknown>;
      const advisory = validateAdvisory(entry["advisory"]);
      return {
        case_id: null,
        source: asSource(entry["source"]),
        advisory,
        dosage: (entry["dosage"] as AdvisoryResponse["dosage"]) ?? null,
      };
    } catch (err) {
      if (err instanceof EngineError) throw err;
      return null;
    }
  }

  async deleteScan(scanId: string): Promise<void> {
    const user = this.requireUser();
    try {
      const { scans } = await this.store();
      await scans.remove(user.id, scanId);
    } catch (err) {
      throw this.wrap(err, "scan not deleted");
    }
  }

  async clearScans(): Promise<void> {
    const user = this.requireUser();
    try {
      const { scans } = await this.store();
      await scans.clear(user.id);
    } catch (err) {
      throw this.wrap(err, "history not cleared");
    }
  }

  async ledgerStats(): Promise<LedgerStats> {
    const user = this.requireUser();
    try {
      const { scans } = await this.store();
      return await scans.stats(user.id);
    } catch (err) {
      throw this.wrap(err, "history unavailable");
    }
  }
}
