export type {
  Advisory,
  AdvisoryResponse,
  AdvisorySource,
  DeviceHealth,
  DosageResult,
  Lang,
  VisionResult,
} from "../../contracts/types";

import type { Lang } from "../../contracts/types";

export interface SeverityInfo {
  level: number;
  label: string;
  affected_area_pct: number;
}

export interface ToolCall {
  tool: "calc_dosage";
  args: { crop: string; area_ha: number; severity: number };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface RawDetection {
  class_id: number;
  label: string;
  confidence: number;
  bbox?: [number, number, number, number];
  mask_polygon?: Array<[number, number]>;
  model?: string;
  leaf_polygon?: Array<[number, number]>;
  plant_ratio?: number;
  alternatives?: Array<{
    class_id: number;
    label: string;
    confidence: number;
    model?: string;
  }>;
}

export interface Chunk {
  id: string;
  text: string;
  crop: string;
  disease: string;
  stage: string;
  lang: string;
  region: string;
  score: number;
}

export interface Retriever {
  search(query: string, filters: Record<string, string>, k: number): Chunk[];
}

export interface LlmPort {
  generate(messages: ChatMessage[], maxTokens: number): Promise<string>;
}

export interface NativeHealth {
  platform: string;
  vision_adapter: string;
  llm_adapter: string;
  audio_adapter: string;
  vision_model: string;
  llm_model: string;
  peak_rss_kb: number | null;
  temp_c: number | null;
}

export interface NativePorts extends LlmPort {
  detect(imageBase64: string): Promise<RawDetection | null>;
  speak(text: string, lang: Lang): Promise<void>;
  readAsset(name: string): Promise<Uint8Array | null>;
  health(): Promise<NativeHealth>;
}
