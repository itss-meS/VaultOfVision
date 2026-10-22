import { registerPlugin } from "@capacitor/core";
import { openCapacitorSql } from "../db/capacitorSql";
import { LocalEngineClient } from "./core/engine";
import type {
  ChatMessage,
  Lang,
  NativeHealth,
  NativePorts,
  RawDetection,
} from "./core/types";

interface AgriEdgePlugin {
  detect(args: {
    imageBase64: string;
  }): Promise<{ detection: RawDetection | null }>;
  generate(args: {
    messages: ChatMessage[];
    maxTokens: number;
  }): Promise<{ text: string }>;
  speak(args: { text: string; lang: Lang }): Promise<void>;
  readAsset(args: { name: string }): Promise<{ base64: string | null }>;
  health(): Promise<NativeHealth>;
}

const Plugin = registerPlugin<AgriEdgePlugin>("AgriEdgeEngine");

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const nativePorts: NativePorts = {
  async detect(imageBase64) {
    return (await Plugin.detect({ imageBase64 })).detection;
  },
  async generate(messages, maxTokens) {
    return (await Plugin.generate({ messages, maxTokens })).text;
  },
  speak(text, lang) {
    return Plugin.speak({ text, lang });
  },
  async readAsset(name) {
    const { base64 } = await Plugin.readAsset({ name });
    return base64 ? fromBase64(base64) : null;
  },
  health() {
    return Plugin.health();
  },
};

export class NativeEngineClient extends LocalEngineClient {
  constructor() {
    super(nativePorts, openCapacitorSql);
  }
}
