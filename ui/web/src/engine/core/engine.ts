import {
  type AdvisoryResponse,
  type AskOptions,
  type DeviceHealth,
  type EngineClient,
  EngineError,
  type Lang,
  type SessionInfo,
  type VisionResult,
} from "../../contracts/types";
import {
  checkPin,
  makeProfile,
  type StoredProfile,
  Throttle,
  validPin,
  validProfileId,
} from "./localAuth";
import {
  DEFAULT_CONFIG,
  detectionToVision,
  Orchestrator,
} from "./orchestrator";
import { Bm25Retriever } from "./retriever";
import { rulesFromDocument } from "./rules";
import { loadSignedJson, publicKeyFromPem } from "./signing";
import { dosageFromDocument } from "./tools";
import type { NativePorts, Retriever } from "./types";
import { validateVision } from "./validate";

export const ASSETS = {
  trust: "knowledge/release_ed25519.pub",
  banned: "knowledge/banned_pesticides.json",
  bannedSig: "knowledge/banned_pesticides.json.sig",
  dosage: "knowledge/dosage_table.json",
  dosageSig: "knowledge/dosage_table.json.sig",
  chunks: "knowledge/chunks.jsonl",
} as const;

export interface LocalEngineOptions {
  confThreshold: number;
  thresholds: readonly number[];
  sessionSeconds: number;
  maxImageBytes: number;
  pinIterations: number;
}

export const DEFAULT_OPTIONS: LocalEngineOptions = {
  confThreshold: 0.55,
  thresholds: [5, 15, 30, 50],
  sessionSeconds: 3600,
  maxImageBytes: 8_000_000,
  pinIterations: 210000,
};

const dec = new TextDecoder();

interface Loaded {
  orchestrator: Orchestrator;
  bannedVersion: number;
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

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export class LocalEngineClient implements EngineClient {
  readonly kind = "native" as const;
  private session: SessionInfo | null = null;
  private expiresAt = 0;
  private loading: Promise<Loaded> | null = null;
  private busy = false;
  private readonly started = Date.now();
  private readonly throttle = new Throttle();
  private readonly opts: LocalEngineOptions;

  constructor(
    private readonly ports: NativePorts,
    options: Partial<LocalEngineOptions> = {},
  ) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
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
      return {
        orchestrator: new Orchestrator(
          p,
          retriever,
          rules,
          table,
          DEFAULT_CONFIG,
        ),
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

  private requireSession(): SessionInfo {
    if (this.session === null || Date.now() >= this.expiresAt) {
      this.session = null;
      throw new EngineError("auth", "sign in required");
    }
    return this.session;
  }

  async restoreSession(): Promise<SessionInfo | null> {
    if (this.session === null || Date.now() >= this.expiresAt) return null;
    return this.session;
  }

  private async readProfiles(): Promise<string[]> {
    const raw = await this.ports.kvGet("profiles");
    if (!raw) return [];
    try {
      const v = JSON.parse(raw) as unknown;
      return Array.isArray(v)
        ? v.filter((x): x is string => typeof x === "string")
        : [];
    } catch {
      return [];
    }
  }

  async login(
    profileId: string,
    pin: string,
    _totp?: string,
  ): Promise<SessionInfo> {
    if (this.throttle.locked())
      throw new EngineError("rate", "too many attempts");
    if (!validProfileId(profileId) || !validPin(pin)) {
      this.throttle.failed();
      throw new EngineError("auth", "invalid credentials");
    }
    const ids = await this.readProfiles();
    let profile: StoredProfile;
    if (ids.length === 0) {
      profile = await makeProfile(
        profileId,
        pin,
        "farmer",
        this.opts.pinIterations,
      );
      await this.ports.kvSet(`profile:${profileId}`, JSON.stringify(profile));
      await this.ports.kvSet("profiles", JSON.stringify([profileId]));
    } else {
      const raw = ids.includes(profileId)
        ? await this.ports.kvGet(`profile:${profileId}`)
        : null;
      if (!raw) {
        this.throttle.failed();
        throw new EngineError("auth", "invalid credentials");
      }
      profile = JSON.parse(raw) as StoredProfile;
      if (!(await checkPin(profile, pin))) {
        this.throttle.failed();
        throw new EngineError("auth", "invalid credentials");
      }
    }
    this.throttle.ok();
    this.session = {
      profile_id: profile.id,
      role: profile.role,
      lang: "en",
      csrf: randomToken(),
      expires_in: this.opts.sessionSeconds,
    };
    this.expiresAt = Date.now() + this.opts.sessionSeconds * 1000;
    return this.session;
  }

  async logout(): Promise<void> {
    this.session = null;
    this.expiresAt = 0;
  }

  async analyzeImage(photo: Blob): Promise<VisionResult> {
    this.requireSession();
    if (photo.size === 0 || photo.size > this.opts.maxImageBytes)
      throw new EngineError("rejected", "image size not accepted");
    const b64 = await toBase64(photo);
    if (base64Size(b64) > this.opts.maxImageBytes)
      throw new EngineError("rejected", "image size not accepted");
    if (this.busy) throw new EngineError("busy", "engine busy");
    this.busy = true;
    try {
      const det = await this.ports.detect(b64);
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

  async ask(
    query: string,
    vision: VisionResult | undefined,
    options: AskOptions,
  ): Promise<AdvisoryResponse> {
    const session = this.requireSession();
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
      const caseId = crypto.randomUUID();
      await this.saveCase(
        session.profile_id,
        caseId,
        out.advisory.diagnosis.primary,
      );
      return {
        case_id: caseId,
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

  private async saveCase(
    profileId: string,
    caseId: string,
    diagnosis: string,
  ): Promise<void> {
    try {
      const raw = await this.ports.kvGet(`cases:${profileId}`);
      const list = raw
        ? (JSON.parse(raw) as Array<Record<string, unknown>>)
        : [];
      list.push({ id: caseId, at: new Date().toISOString(), diagnosis });
      await this.ports.kvSet(
        `cases:${profileId}`,
        JSON.stringify(list.slice(-100)),
      );
    } catch {
      return;
    }
  }

  async speak(text: string, lang: Lang): Promise<void> {
    this.requireSession();
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
}
