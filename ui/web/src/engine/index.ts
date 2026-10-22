import { Capacitor } from "@capacitor/core";
import type { EngineClient } from "../contracts/types";
import { NativeEngineClient } from "./native";
import { WebEngineClient } from "./web";

export function createEngine(): EngineClient {
  if (Capacitor.isNativePlatform()) return new NativeEngineClient();
  return new WebEngineClient();
}
