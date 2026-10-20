import { describe, expect, it } from "vitest";
import { DevBrowserPorts } from "../src/engine/devBrowser";
import { LocalEngineClient } from "../src/engine/core/engine";
import { ASSETS } from "../src/engine/core/engine";
import signed from "./fixtures/signed.json";

class WithAssets extends DevBrowserPorts {
  override async readAsset(name: string): Promise<Uint8Array | null> {
    const enc = new TextEncoder();
    const table: Record<string, string> = {
      [ASSETS.trust]: signed.public_pem,
      [ASSETS.banned]: signed.banned,
      [ASSETS.bannedSig]: signed.banned_sig,
      [ASSETS.dosage]: signed.dosage,
      [ASSETS.dosageSig]: signed.dosage_sig,
    };
    const v = table[name];
    return v === undefined ? null : enc.encode(v);
  }
}

describe("dev browser engine", () => {
  it("signs up, analyzes and advises with sample data", async () => {
    const engine = new LocalEngineClient(new WithAssets(), { pinIterations: 1000 });
    await engine.login("farmer1", "1234");
    const vision = await engine.analyzeImage(
      new Blob([new Uint8Array(2048)], { type: "image/jpeg" }),
    );
    expect(vision.label).toBe("Early Blight");
    const out = await engine.ask("what to do", vision, { lang: "en", area_ha: 1 });
    expect(out.source).toBe("llm");
    expect(out.advisory.actions.length).toBeGreaterThan(0);
  });
});
