import {
  type AdvisoryResponse,
  type AskOptions,
  type DeviceHealth,
  type EngineClient,
  EngineError,
  type EngineErrorCode,
  type Lang,
  type SessionInfo,
  type VisionResult,
} from "../contracts/types";

function codeFor(status: number): EngineErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate";
  if (status === 503) return "busy";
  if (status === 413 || status === 422) return "rejected";
  return "unknown";
}

export class HttpEngineClient implements EngineClient {
  readonly kind = "http" as const;
  private csrf = "";
  private readonly base: string;
  private audio: HTMLAudioElement | null = null;

  constructor(base = "/api/v1") {
    this.base = base;
  }

  private async call(
    path: string,
    init: RequestInit & { json?: unknown } = {},
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.csrf) headers.set("X-CSRF-Token", this.csrf);
    let body = init.body;
    if (init.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.json);
    }
    let res: Response;
    try {
      res = await fetch(`${this.base}${path}`, {
        ...init,
        headers,
        body,
        credentials: "same-origin",
      });
    } catch {
      throw new EngineError("network", "engine unreachable");
    }
    if (!res.ok)
      throw new EngineError(
        codeFor(res.status),
        `request failed (${res.status})`,
      );
    return res;
  }

  async restoreSession(): Promise<SessionInfo | null> {
    try {
      const res = await this.call("/session");
      const info = (await res.json()) as SessionInfo;
      this.csrf = info.csrf;
      return info;
    } catch (err) {
      if (err instanceof EngineError && err.code === "auth") return null;
      throw err;
    }
  }

  async login(
    profileId: string,
    pin: string,
    totp?: string,
  ): Promise<SessionInfo> {
    const json: Record<string, string> = { profile_id: profileId, secret: pin };
    if (totp) json.totp = totp;
    const res = await this.call("/session", { method: "POST", json });
    const info = (await res.json()) as SessionInfo;
    this.csrf = info.csrf;
    return info;
  }

  async logout(): Promise<void> {
    await this.call("/session", { method: "DELETE" });
    this.csrf = "";
  }

  async analyzeImage(photo: Blob): Promise<VisionResult> {
    const form = new FormData();
    form.append("photo", photo, "leaf.jpg");
    const res = await this.call("/vision/analyze", {
      method: "POST",
      body: form,
    });
    return (await res.json()) as VisionResult;
  }

  async ask(
    query: string,
    vision: VisionResult | undefined,
    options: AskOptions,
  ): Promise<AdvisoryResponse> {
    const json: Record<string, unknown> = { query, lang: options.lang };
    if (vision) json.vision = vision;
    if (options.area_ha !== undefined) json.area_ha = options.area_ha;
    const res = await this.call("/advisory", { method: "POST", json });
    return (await res.json()) as AdvisoryResponse;
  }

  async health(): Promise<DeviceHealth> {
    const res = await this.call("/health");
    return (await res.json()) as DeviceHealth;
  }

  async speak(text: string, lang: Lang): Promise<void> {
    const res = await this.call("/tts", {
      method: "POST",
      json: { text, lang },
    });
    const url = URL.createObjectURL(await res.blob());
    this.audio?.pause();
    const audio = new Audio(url);
    this.audio = audio;
    await new Promise<void>((resolve) => {
      const done = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      audio.play().catch(done);
    });
  }
}
