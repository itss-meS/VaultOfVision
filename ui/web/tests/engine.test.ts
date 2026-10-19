import { describe, expect, it } from "vitest";
import { LocalEngineClient } from "../src/engine/core/engine";
import {
  hexToBytes,
  loadSignedJson,
  publicKeyFromPem,
} from "../src/engine/core/signing";
import { EngineError } from "../src/contracts/types";
import signed from "./fixtures/signed.json";
import { FakePorts, goodAdvisory } from "./fakePorts";

const enc = new TextEncoder();
const fast = { pinIterations: 1000 };
const photo = () => new Blob([new Uint8Array(2000)]);

async function signedIn(ports: FakePorts) {
  const engine = new LocalEngineClient(ports, fast);
  await engine.login("farmer1", "123456");
  return engine;
}

describe("signing", () => {
  const key = publicKeyFromPem(signed.public_pem);
  it("verifies a Python-signed document", () => {
    const doc = loadSignedJson(
      enc.encode(signed.banned),
      signed.banned_sig,
      key,
    );
    expect(doc["version"]).toBe(3);
  });
  it("rejects tampering and a wrong key", () => {
    expect(() =>
      loadSignedJson(enc.encode(signed.banned + " "), signed.banned_sig, key),
    ).toThrow();
    expect(() =>
      loadSignedJson(enc.encode(signed.dosage), signed.banned_sig, key),
    ).toThrow();
    expect(() => hexToBytes("zz")).toThrow();
    expect(() =>
      publicKeyFromPem(
        "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----",
      ),
    ).toThrow();
  });
});

describe("local engine auth", () => {
  it("creates the first profile, then enforces its PIN", async () => {
    const ports = new FakePorts();
    const a = new LocalEngineClient(ports, fast);
    expect(await a.restoreSession()).toBeNull();
    const s = await a.login("farmer1", "123456");
    expect(s.role).toBe("farmer");
    expect(await a.restoreSession()).toEqual(s);
    expect(ports.store.get("profile:farmer1")).not.toContain("123456");

    const b = new LocalEngineClient(ports, fast);
    await expect(b.login("farmer1", "000000")).rejects.toMatchObject({
      code: "auth",
    });
    await expect(b.login("other", "123456")).rejects.toMatchObject({
      code: "auth",
    });
    await expect(b.login("farmer1", "123456")).resolves.toBeTruthy();
  });
  it("locks out after repeated failures", async () => {
    const ports = new FakePorts();
    await new LocalEngineClient(ports, fast).login("farmer1", "123456");
    const e = new LocalEngineClient(ports, fast);
    for (let i = 0; i < 5; i++)
      await e.login("farmer1", "999999").catch(() => undefined);
    await expect(e.login("farmer1", "123456")).rejects.toMatchObject({
      code: "rate",
    });
  });
  it("rejects malformed credentials and requires a session", async () => {
    const e = new LocalEngineClient(new FakePorts(), fast);
    await expect(e.login("x", "12")).rejects.toBeInstanceOf(EngineError);
    await expect(e.analyzeImage(photo())).rejects.toMatchObject({
      code: "auth",
    });
    await expect(e.speak("hi", "en")).rejects.toMatchObject({ code: "auth" });
  });
  it("logout ends the session", async () => {
    const e = await signedIn(new FakePorts());
    await e.logout();
    expect(await e.restoreSession()).toBeNull();
  });
});

describe("local engine flow", () => {
  it("analyses a photo and returns advice with dosage", async () => {
    const ports = new FakePorts({ replies: [goodAdvisory()] });
    const e = await signedIn(ports);
    const v = await e.analyzeImage(photo());
    expect(v.label).toBe("Early Blight");
    const r = await e.ask(
      "what to do",
      { ...v, severity_level: 3, affected_area_pct: 20 },
      { lang: "en", area_ha: 0.4 },
    );
    expect(r.source).toBe("llm");
    expect(r.dosage).toMatchObject({ available: true, total: 1 });
    expect(r.case_id).toMatch(/[0-9a-f-]{36}/);
    expect(JSON.parse(ports.store.get("cases:farmer1") ?? "[]")).toHaveLength(
      1,
    );
  });
  it("rejects empty and oversized photos and invalid vision or area", async () => {
    const e = await signedIn(new FakePorts({ replies: [goodAdvisory()] }));
    await expect(e.analyzeImage(new Blob([]))).rejects.toMatchObject({
      code: "rejected",
    });
    await expect(
      e.analyzeImage(new Blob([new Uint8Array(8_000_001)])),
    ).rejects.toMatchObject({ code: "rejected" });
    const v = await e.analyzeImage(photo());
    await expect(
      e.ask("q", { ...v, confidence: 5 }, { lang: "en" }),
    ).rejects.toMatchObject({ code: "rejected" });
    await expect(
      e.ask("q", v, { lang: "en", area_ha: -1 }),
    ).rejects.toMatchObject({ code: "rejected" });
  });
  it("returns unsupported when the detector finds nothing", async () => {
    const e = await signedIn(new FakePorts({ detection: null }));
    const v = await e.analyzeImage(photo());
    expect(v.low_confidence).toBe(true);
    const r = await e.ask("q", v, { lang: "en" });
    expect(r.source).toBe("retake");
  });
  it("fails closed when assets are missing or tampered", async () => {
    const missing = await signedIn(
      new FakePorts({ assets: { banned: null }, replies: [goodAdvisory()] }),
    );
    const v = await missing.analyzeImage(photo());
    await expect(missing.ask("q", v, { lang: "en" })).rejects.toBeInstanceOf(
      EngineError,
    );
    expect((await missing.health()).status).toBe("degraded");

    const tampered = await signedIn(
      new FakePorts({
        assets: { banned: enc.encode('{"version":9,"items":["zzz"]}') },
        replies: [goodAdvisory()],
      }),
    );
    await expect(tampered.ask("q", v, { lang: "en" })).rejects.toBeInstanceOf(
      EngineError,
    );
  });
  it("reports health and speaks", async () => {
    const ports = new FakePorts();
    const e = await signedIn(ports);
    const h = await e.health();
    expect(h.status).toBe("ok");
    expect(h.banned_list_version).toBe("3");
    await e.speak("namaste", "hi");
    expect(ports.spoken).toEqual([["namaste", "hi"]]);
  });
});
