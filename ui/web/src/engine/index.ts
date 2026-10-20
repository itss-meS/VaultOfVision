import { Capacitor } from "@capacitor/core";
import type { EngineClient } from "../contracts/types";
import { HttpEngineClient } from "./http";
import { NativeEngineClient } from "./native";
import { WebEngineClient } from "./web";

export function createEngine(): EngineClient {
  const mode = import.meta.env.VITE_ENGINE as string | undefined;
  if (mode === "native" || (mode === undefined && Capacitor.isNativePlatform()))
    return new NativeEngineClient();
  if (import.meta.env.DEV && mode !== "http") return new WebEngineClient();
  return new HttpEngineClient();
}