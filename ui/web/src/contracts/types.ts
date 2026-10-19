export type Lang = 'en' | 'hi' | 'mr';
export type Role = 'farmer' | 'champion' | 'officer' | 'admin';

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

export type Priority = 'critical' | 'high' | 'normal';

export interface Advisory {
  schema_version: 'advisory_v3';
  diagnosis: { primary: string; confidence: number; differential: string[] };
  severity: { level: number; label: string; affected_area_pct: number } | null;
  actions: Array<{ text: string; priority: Priority }>;
  tool_call: { tool: 'calc_dosage'; args: { crop: 'tomato'; area_ha: number; severity: number } } | null;
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

export type AdvisorySource = 'llm' | 'fallback' | 'refusal' | 'retake';

export interface AdvisoryResponse {
  case_id: string | null;
  source: AdvisorySource;
  advisory: Advisory;
  dosage: DosageResult | null;
}

export interface SessionInfo {
  profile_id: string;
  role: Role;
  lang: Lang;
  csrf: string;
  expires_in: number;
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
  readonly kind: 'http' | 'native';
  restoreSession(): Promise<SessionInfo | null>;
  login(profileId: string, pin: string, totp?: string): Promise<SessionInfo>;
  logout(): Promise<void>;
  analyzeImage(photo: Blob): Promise<VisionResult>;
  ask(query: string, vision: VisionResult | undefined, options: AskOptions): Promise<AdvisoryResponse>;
  speak(text: string, lang: Lang): Promise<void>;
  health(): Promise<DeviceHealth>;
}

export type EngineErrorCode = 'auth' | 'busy' | 'rate' | 'rejected' | 'network' | 'unknown';

export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}
