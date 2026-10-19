import { Capacitor } from "@capacitor/core";
import type { EngineClient } from "../contracts/types";
import { HttpEngineClient } from "./http";
import { NativeEngineClient } from "./native";

export function createEngine(): EngineClient {
  const mode = import.meta.env.VITE_ENGINE as string | undefined;
  if (mode === "native" || (mode === undefined && Capacitor.isNativePlatform()))
    return new NativeEngineClient();
  return new HttpEngineClient();
}
