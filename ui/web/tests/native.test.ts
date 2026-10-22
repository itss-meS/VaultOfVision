import { beforeEach, describe, expect, it, vi } from "vitest";

const plugin = vi.hoisted(() => ({
  detect: vi.fn(),
  generate: vi.fn(),
  speak: vi.fn(),
  readAsset: vi.fn(),
  health: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({ registerPlugin: () => plugin }));
vi.mock("../src/db/capacitorSql", () => ({ openCapacitorSql: vi.fn() }));

import { nativePorts } from "../src/engine/native";

beforeEach(() => {
  for (const fn of Object.values(plugin)) fn.mockReset();
});

describe("native plugin bridge", () => {
  it("unwraps the detection", async () => {
    const detection = { class_id: 1, label: "Early Blight", confidence: 0.9 };
    plugin.detect.mockResolvedValue({ detection });
    expect(await nativePorts.detect("QUJD")).toBe(detection);
    expect(plugin.detect).toHaveBeenLastCalledWith({ imageBase64: "QUJD" });
  });

  it("returns null when nothing is detected", async () => {
    plugin.detect.mockResolvedValue({ detection: null });
    expect(await nativePorts.detect("QUJD")).toBeNull();
  });

  it("passes messages to generate and returns the text", async () => {
    plugin.generate.mockResolvedValue({ text: "{}" });
    const messages = [{ role: "user" as const, content: "hi" }];
    expect(await nativePorts.generate(messages, 64)).toBe("{}");
    expect(plugin.generate).toHaveBeenLastCalledWith({ messages, maxTokens: 64 });
  });

  it("forwards speech and health calls", async () => {
    plugin.speak.mockResolvedValue(undefined);
    await nativePorts.speak("hello", "te");
    expect(plugin.speak).toHaveBeenLastCalledWith({ text: "hello", lang: "te" });
    const status = { vision: true };
    plugin.health.mockResolvedValue(status);
    expect(await nativePorts.health()).toBe(status);
  });

  it("decodes assets and treats a missing asset as null", async () => {
    plugin.readAsset.mockResolvedValueOnce({ base64: "QUJD" });
    expect(Array.from((await nativePorts.readAsset("a.json")) ?? [])).toEqual([65, 66, 67]);
    plugin.readAsset.mockResolvedValueOnce({ base64: null });
    expect(await nativePorts.readAsset("missing.json")).toBeNull();
  });
});
