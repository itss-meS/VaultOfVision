export type Lang = "en" | "hi" | "mr" | "te";

export interface VisionResult {
  class_id: number;
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
  mask_polygon: Array<[number, number]>;
  severity_level: number | null;
  low_confidence: boolean;
  affected_area_pct?: number | null;
}

export type Priority = "critical" | "high" | "normal";

export interface Advisory {
  schema_version: "advisory_v3";
  diagnosis: { primary: string; confidence: number; differential: string[] };
  severity: { level: number; label: string; affected_area_pct: number } | null;
  actions: Array<{ text: string; priority: Priority }>;
  tool_call: {
    tool: "calc_dosage";
    args: { crop: "tomato"; area_ha: number; severity: number };
  } | null;
  preventive: string[];
  safety_notice: string;
  lang: Lang;
}

export interface DosageResult {
  available: boolean;
  reason?: string | null;
  product?: string | null;
  dose_per_ha?: number | null;
  total?: number | null;
  unit?: string | null;
  area_ha?: number | null;
  notes?: string | null;
}

export type AdvisorySource = "llm" | "fallback" | "refusal" | "retake";

export interface AdvisoryResponse {
  case_id: string | null;
  source: AdvisorySource;
  advisory: Advisory;
  dosage: DosageResult | null;
}

export interface UserProfile {
  id: string;
  name: string;
  mobile: string;
  village: string;
  areaHa: number | null;
  lang: Lang;
}

export interface SignUpInput {
  name: string;
  mobile: string;
  password: string;
  village?: string;
  lang?: Lang;
}

export type ProfilePatch = Partial<
  Pick<UserProfile, "name" | "village" | "areaHa" | "lang">
>;

export type ScanKind = "disease" | "pest" | "healthy";

export interface ScanRecord {
  id: string;
  label: string;
  kind: ScanKind;
  confidence: number;
  severity: number | null;
  durationMs: number;
  thumb: string;
  createdAt: number;
  hasAdvice: boolean;
}

export interface Candidate {
  label: string;
  confidence: number;
  kind: ScanKind;
  source: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface NewScan {
  vision: VisionResult;
  thumb: string;
  durationMs: number;
}

export interface LedgerStats {
  scans: number;
  bytes: number;
  lastAt: number | null;
}

export interface DeviceHealth {
  status: string;
  platform: string;
  uptime_s: number;
  adapters: { vision: string; llm: string; retriever: string; audio: string };
  models: { vision: string; llm: string };
  banned_list_version: string;
  ota_version: number;
  peak_rss_kb: number | null;
  temp_c: number | null;
}

export interface AskOptions {
  lang: Lang;
  area_ha?: number;
}

export interface EngineClient {
  readonly kind: "device";
  restoreSession(): Promise<UserProfile | null>;
  signUp(input: SignUpInput): Promise<UserProfile>;
  login(mobile: string, password: string): Promise<UserProfile>;
  logout(): Promise<void>;
  updateProfile(patch: ProfilePatch): Promise<UserProfile>;
  deleteAccount(password: string): Promise<void>;
  analyzeImage(photo: Blob): Promise<VisionResult>;
  candidates(): Candidate[];
  chat(history: ChatTurn[], lang: Lang, topic?: string): Promise<string>;
  ask(
    query: string,
    vision: VisionResult | undefined,
    options: AskOptions,
  ): Promise<AdvisoryResponse>;
  speak(text: string, lang: Lang): Promise<void>;
  health(): Promise<DeviceHealth>;
  saveScan(scan: NewScan): Promise<string>;
  attachAdvice(scanId: string, response: AdvisoryResponse): Promise<void>;
  listScans(): Promise<ScanRecord[]>;
  getAdvice(scanId: string): Promise<AdvisoryResponse | null>;
  deleteScan(scanId: string): Promise<void>;
  clearScans(): Promise<void>;
  ledgerStats(): Promise<LedgerStats>;
}

export type EngineErrorCode =
  | "auth"
  | "busy"
  | "rate"
  | "rejected"
  | "exists"
  | "invalid"
  | "unavailable"
  | "unknown";

export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
  }
}
