import { beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  detect: vi.fn(),
  generate: vi.fn(),
  cancelGenerate: vi.fn(),
  speak: vi.fn(),
  readAsset: vi.fn(),
  kvGet: vi.fn(),
  kvSet: vi.fn(),
  health: vi.fn(),
  modelStatus: vi.fn(),
  downloadModels: vi.fn(),
  cancelDownload: vi.fn(),
  addListener: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({ registerPlugin: () => plugin }));

import {
  cancelDownload,
  cancelGenerate,
  downloadModels,
  modelStatus,
  nativePorts,
} from "../src/engine/native";

beforeEach(() => {
  for (const fn of Object.values(plugin)) fn.mockReset();
});

describe("native plugin bridge", () => {
  it("passes the chosen vision model and unwraps the detection", async () => {
    const det = { class_id: 2, label: "x", confidence: 0.9, model: "ip102", kind: "pest" };
    plugin.detect.mockResolvedValue({ detection: det });
    expect(await nativePorts.detect("QUJD")).toEqual(det);
    expect(plugin.detect).toHaveBeenLastCalledWith({ imageBase64: "QUJD" });
    const port = nativePorts.detect as (b: string, m?: string) => Promise<unknown>;
    await port("QUJD", "cassava");
    expect(plugin.detect).toHaveBeenLastCalledWith({ imageBase64: "QUJD", model: "cassava" });
  });

  it("returns null when nothing is detected", async () => {
    plugin.detect.mockResolvedValue({ detection: null });
    expect(await nativePorts.detect("QUJD")).toBeNull();
  });

  it("turns a missing voice into an error the engine can report", async () => {
    plugin.speak.mockResolvedValue({ status: "voice_not_installed" });
    await expect(nativePorts.speak("hi", "hi")).rejects.toThrow("voice_not_installed");
    plugin.speak.mockResolvedValue({ status: "ok" });
    await expect(nativePorts.speak("hi", "en")).resolves.toBeUndefined();
  });

  it("decodes assets and treats a missing asset as null", async () => {
    plugin.readAsset.mockResolvedValue({ base64: "QUJD" });
    expect(Array.from((await nativePorts.readAsset("knowledge/a")) ?? [])).toEqual([65, 66, 67]);
    plugin.readAsset.mockResolvedValue({ base64: null });
    expect(await nativePorts.readAsset("knowledge/a")).toBeNull();
  });

  it("maps storage and generation calls", async () => {
    plugin.kvGet.mockResolvedValue({ value: "v" });
    expect(await nativePorts.kvGet("profiles")).toBe("v");
    await nativePorts.kvSet("profiles", "[]");
    expect(plugin.kvSet).toHaveBeenCalledWith({ key: "profiles", value: "[]" });
    plugin.generate.mockResolvedValue({ text: "t" });
    expect(await nativePorts.generate([{ role: "user", content: "q" }], 5)).toBe("t");
  });

  it("reports model status and forwards the verify flag", async () => {
    const status = { files: [] };
    plugin.modelStatus.mockResolvedValue(status);
    expect(await modelStatus()).toBe(status);
    expect(plugin.modelStatus).toHaveBeenLastCalledWith({ verify: false });
    await modelStatus(true);
    expect(plugin.modelStatus).toHaveBeenLastCalledWith({ verify: true });
  });

  it("downloads with progress and always removes the listener", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    plugin.addListener.mockResolvedValue({ remove });
    plugin.downloadModels.mockRejectedValue(new Error("hash_mismatch"));
    const files = [{ name: "tokenizer.model", url: "u", sha256: "s", size: 1 }];
    const onProgress = vi.fn();
    await expect(downloadModels(files, onProgress)).rejects.toThrow("hash_mismatch");
    expect(plugin.addListener).toHaveBeenCalledWith("downloadProgress", onProgress);
    expect(remove).toHaveBeenCalledTimes(1);
    plugin.downloadModels.mockResolvedValue({ files: [] });
    await downloadModels(files);
    expect(plugin.addListener).toHaveBeenCalledTimes(1);
  });

  it("exposes cancel calls", async () => {
    plugin.cancelDownload.mockResolvedValue(undefined);
    plugin.cancelGenerate.mockResolvedValue(undefined);
    await cancelDownload();
    await cancelGenerate();
    expect(plugin.cancelDownload).toHaveBeenCalledTimes(1);
    expect(plugin.cancelGenerate).toHaveBeenCalledTimes(1);
  });
});
