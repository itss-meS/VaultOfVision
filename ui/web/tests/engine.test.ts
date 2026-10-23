import { describe, expect, it } from "vitest";
import { openSqlJs } from "../src/db/sqlJs";
import type { Sql } from "../src/db/sql";
import { LocalEngineClient } from "../src/engine/core/engine";
import {
  hexToBytes,
  loadSignedJson,
  publicKeyFromPem,
} from "../src/engine/core/signing";
import { EngineError } from "../src/contracts/types";
import signed from "./fixtures/signed.json";
import { FakePorts, goodAdvisory } from "./fakePorts";
import type { RawDetection } from "../src/engine/core/types";

const enc = new TextEncoder();
const fast = { pinIterations: 1000 };
const photo = () => new Blob([new Uint8Array(2000)]);
const farmer = {
  name: "Asha Patil",
  mobile: "9876543210",
  password: "secret1",
};

async function memorySql(): Promise<Sql> {
  return openSqlJs();
}

function engineOn(ports: FakePorts, sql: Sql): LocalEngineClient {
  return new LocalEngineClient(ports, () => Promise.resolve(sql), fast);
}

async function signedIn(ports: FakePorts, sql?: Sql) {
  const engine = engineOn(ports, sql ?? (await memorySql()));
  await engine.signUp(farmer);
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

describe("local engine accounts", () => {
  it("signs up, stores a salted hash and restores the session after restart", async () => {
    const sql = await memorySql();
    const first = engineOn(new FakePorts(), sql);
    expect(await first.restoreSession()).toBeNull();
    const user = await first.signUp({
      ...farmer,
      village: "Baramati",
      lang: "mr",
    });
    expect(user).toMatchObject({
      name: "Asha Patil",
      mobile: "9876543210",
      village: "Baramati",
      lang: "mr",
      areaHa: null,
    });
    const rows = await sql.all<{ hash: string; salt: string }>(
      "SELECT hash, salt FROM users",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain("secret1");

    const second = engineOn(new FakePorts(), sql);
    expect(await second.restoreSession()).toEqual(user);
    await second.logout();
    expect(await engineOn(new FakePorts(), sql).restoreSession()).toBeNull();
  });
  it("logs in with mobile and password, accepting a +91 prefix", async () => {
    const sql = await memorySql();
    await signedIn(new FakePorts(), sql);
    const e = engineOn(new FakePorts(), sql);
    await expect(e.login("9876543210", "wrong1")).rejects.toMatchObject({
      code: "auth",
    });
    await expect(e.login("9123456780", "secret1")).rejects.toMatchObject({
      code: "auth",
    });
    const user = await e.login("+91 98765 43210", "secret1");
    expect(user.name).toBe("Asha Patil");
  });
  it("rejects duplicate mobiles and invalid sign up fields", async () => {
    const sql = await memorySql();
    const e = engineOn(new FakePorts(), sql);
    await e.signUp(farmer);
    await expect(e.signUp(farmer)).rejects.toMatchObject({ code: "exists" });
    for (const bad of [
      { ...farmer, mobile: "12345", name: "Bhima" },
      { ...farmer, mobile: "5876543210", name: "Bhima" },
      { ...farmer, mobile: "9000000001", name: "B" },
      { ...farmer, mobile: "9000000002", password: "123" },
      { ...farmer, mobile: "9000000003", village: "x".repeat(61) },
    ])
      await expect(e.signUp(bad)).rejects.toMatchObject({ code: "invalid" });
  });
  it("locks an account after repeated failures", async () => {
    const sql = await memorySql();
    await signedIn(new FakePorts(), sql);
    const e = engineOn(new FakePorts(), sql);
    for (let i = 0; i < 5; i++)
      await e.login("9876543210", "bad-pass").catch(() => undefined);
    await expect(e.login("9876543210", "secret1")).rejects.toMatchObject({
      code: "rate",
    });
    const other = engineOn(new FakePorts(), sql);
    await expect(other.login("9876543210", "secret1")).rejects.toMatchObject({
      code: "rate",
    });
  });
  it("requires a session for protected calls", async () => {
    const e = engineOn(new FakePorts(), await memorySql());
    await expect(e.analyzeImage(photo())).rejects.toMatchObject({
      code: "auth",
    });
    await expect(e.speak("hi", "en")).rejects.toMatchObject({ code: "auth" });
    await expect(e.listScans()).rejects.toMatchObject({ code: "auth" });
    await expect(e.updateProfile({ village: "x" })).rejects.toMatchObject({
      code: "auth",
    });
  });
  it("updates the profile and validates changes", async () => {
    const e = await signedIn(new FakePorts());
    const next = await e.updateProfile({
      village: " Latur ",
      areaHa: 1.5,
      lang: "te",
    });
    expect(next).toMatchObject({ village: "Latur", areaHa: 1.5, lang: "te" });
    await expect(e.updateProfile({ areaHa: 0 })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(e.updateProfile({ areaHa: 5000 })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(e.updateProfile({ name: "" })).rejects.toMatchObject({
      code: "invalid",
    });
    expect((await e.updateProfile({ areaHa: null })).areaHa).toBeNull();
  });
  it("deletes the account and its scans only with the right password", async () => {
    const sql = await memorySql();
    const e = await signedIn(new FakePorts(), sql);
    const v = await e.analyzeImage(photo());
    await e.saveScan({ vision: v, thumb: "", durationMs: 10 });
    await expect(e.deleteAccount("nope-nope")).rejects.toMatchObject({
      code: "auth",
    });
    await e.deleteAccount("secret1");
    expect(await sql.all("SELECT id FROM users")).toHaveLength(0);
    expect(await sql.all("SELECT id FROM scans")).toHaveLength(0);
    await expect(e.listScans()).rejects.toMatchObject({ code: "auth" });
    await expect(
      engineOn(new FakePorts(), sql).login("9876543210", "secret1"),
    ).rejects.toMatchObject({ code: "auth" });
  });
});

describe("local engine scan history", () => {
  it("saves, lists, attaches advice, deletes and clears", async () => {
    const ports = new FakePorts({ replies: [goodAdvisory()] });
    const e = await signedIn(ports);
    const v = await e.analyzeImage(photo());
    const thumb = "data:image/jpeg;base64,AAAA";
    const id = await e.saveScan({ vision: v, thumb, durationMs: 321.6 });
    const second = await e.saveScan({
      vision: { ...v, label: "Tomato Healthy", confidence: 0.8 },
      thumb: "not-a-thumb",
      durationMs: 5,
    });
    let list = await e.listScans();
    expect(list.map((s) => s.id)).toEqual([second, id]);
    expect(list[1]).toMatchObject({
      label: "Early Blight",
      kind: "disease",
      durationMs: 322,
      thumb,
      hasAdvice: false,
    });
    expect(list[0]).toMatchObject({ kind: "healthy", thumb: "" });

    const response = await e.ask("q", v, { lang: "en", area_ha: 0.4 });
    await e.attachAdvice(id, response);
    expect((await e.listScans())[1]?.hasAdvice).toBe(true);
    const saved = await e.getAdvice(id);
    expect(saved?.advisory.diagnosis.primary).toBe("Early Blight");
    expect(await e.getAdvice(second)).toBeNull();

    const stats = await e.ledgerStats();
    expect(stats.scans).toBe(2);
    expect(stats.bytes).toBeGreaterThan(0);
    expect(stats.lastAt).not.toBeNull();

    await e.deleteScan(id);
    list = await e.listScans();
    expect(list).toHaveLength(1);
    await e.clearScans();
    expect(await e.listScans()).toEqual([]);
    expect((await e.ledgerStats()).scans).toBe(0);
  });
  it("marks pest model results as pests and keeps scans private per user", async () => {
    const sql = await memorySql();
    const ports = new FakePorts({
      detection: {
        class_id: 3,
        label: "flea beetle",
        confidence: 0.8,
        model: "ip102/vision.onnx",
      },
    });
    const a = engineOn(ports, sql);
    await a.signUp(farmer);
    const v = await a.analyzeImage(photo());
    await a.saveScan({ vision: v, thumb: "", durationMs: 1 });
    expect((await a.listScans())[0]?.kind).toBe("pest");

    const b = engineOn(ports, sql);
    await b.signUp({ ...farmer, name: "Ravi Kumar", mobile: "9123456789" });
    expect(await b.listScans()).toEqual([]);
  });
  it("keeps only the newest 500 scans", async () => {
    const sql = await memorySql();
    const e = await signedIn(new FakePorts(), sql);
    const v = await e.analyzeImage(photo());
    const user = (await e.restoreSession())?.id ?? "";
    for (let i = 0; i < 502; i++)
      await sql.run(
        "INSERT INTO scans (id, user_id, label, kind, confidence, duration_ms, created_at) VALUES (?, ?, 'x', 'disease', 0.5, 1, ?)",
        [`old-${i}`, user, i],
      );
    await e.saveScan({ vision: v, thumb: "", durationMs: 1 });
    expect(await e.listScans()).toHaveLength(500);
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
    expect(r.case_id).toBeNull();
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

describe("candidates", () => {
  const detection = {
    class_id: 3,
    label: "flea beetle",
    confidence: 0.87,
    model: "ip102/vision.onnx",
    alternatives: [
      {
        class_id: 5,
        label: "Tomato Early Blight",
        confidence: 0.41,
        model: "plantvillage-all/vision.onnx",
      },
      {
        class_id: 1,
        label: "Cassava Mosaic",
        confidence: 0.03,
        model: "cassava/vision.onnx",
      },
    ],
  };
  it("lists the best answer of every model with its confidence", async () => {
    const e = await signedIn(new FakePorts({ detection }));
    const v = await e.analyzeImage(photo());
    expect(v.label).toBe("flea beetle");
    const list = e.candidates();
    expect(list.map((c) => c.label)).toEqual([
      "flea beetle",
      "Tomato Early Blight",
      "Cassava Mosaic",
    ]);
    expect(list.map((c) => c.kind)).toEqual(["pest", "disease", "disease"]);
    expect(list.map((c) => c.confidence)).toEqual([0.87, 0.41, 0.03]);
  });
  it("saves the pest kind for an insect model result", async () => {
    const e = await signedIn(new FakePorts({ detection }));
    const v = await e.analyzeImage(photo());
    const id = await e.saveScan({ vision: v, thumb: "", durationMs: 5 });
    const rows = await e.listScans();
    expect(rows.find((r) => r.id === id)?.kind).toBe("pest");
  });
  it("has no candidates when nothing is detected", async () => {
    const e = await signedIn(new FakePorts({ detection: null }));
    await e.analyzeImage(photo()).catch(() => undefined);
    expect(e.candidates()).toEqual([]);
  });
});

describe("photos that are not a leaf or insect", () => {
  const base: RawDetection = {
    class_id: 1,
    label: "Early Blight",
    confidence: 0.8,
    model: "plantvillage-all/vision.onnx",
  };
  it("returns unsupported with no candidates for a weak answer", async () => {
    const e = await signedIn(
      new FakePorts({ detection: { ...base, confidence: 0.3 } }),
    );
    const v = await e.analyzeImage(photo());
    expect(v.label).toBe("unsupported");
    expect(v.low_confidence).toBe(true);
    expect(e.candidates()).toEqual([]);
  });
  it("returns unsupported when there is no plant colour", async () => {
    const e = await signedIn(
      new FakePorts({
        detection: { ...base, confidence: 0.99, plant_ratio: 0.0007 },
      }),
    );
    expect((await e.analyzeImage(photo())).label).toBe("unsupported");
  });
  it("returns unsupported when every model says not a leaf or insect", async () => {
    const e = await signedIn(
      new FakePorts({
        detection: {
          class_id: 0,
          label: "Not a leaf or insect",
          confidence: 0.97,
          alternatives: [
            { class_id: 0, label: "Not a leaf or insect", confidence: 0.9 },
          ],
        },
      }),
    );
    expect((await e.analyzeImage(photo())).label).toBe("unsupported");
  });
  it("keeps a real answer and drops the not-a-leaf vote from the list", async () => {
    const e = await signedIn(
      new FakePorts({
        detection: {
          class_id: 0,
          label: "Not a leaf or insect",
          confidence: 0.95,
          model: "plantvillage-all/vision.onnx",
          alternatives: [
            {
              class_id: 7,
              label: "Colomerus vitis",
              confidence: 0.92,
              model: "ip102/vision.onnx",
            },
          ],
        },
      }),
    );
    const v = await e.analyzeImage(photo());
    expect(v.label).toBe("Colomerus vitis");
    expect(e.candidates().map((c) => c.label)).toEqual(["Colomerus vitis"]);
  });
});

describe("chat", () => {
  const history = [{ role: "user" as const, content: "When to water?" }];
  it("answers through the language model with a farming prompt", async () => {
    const ports = new FakePorts({ replies: ["Water early in the morning."] });
    const e = await signedIn(ports);
    expect(await e.chat(history, "hi")).toBe("Water early in the morning.");
    const sent = ports.prompts[0] ?? [];
    expect(sent[0]?.role).toBe("system");
    expect(sent[0]?.content).toContain("Hindi");
    expect(sent[1]).toEqual({ role: "user", content: "When to water?" });
  });
  it("tells the model about the scanned leaf and cleans the topic", async () => {
    const ports = new FakePorts({ replies: ["ok"] });
    const e = await signedIn(ports);
    await e.chat(history, "en", "Tomato <b>Early</b>\nBlight");
    const system = ports.prompts[0]?.[0]?.content ?? "";
    expect(system).toContain("the app found: Tomato b Early /b Blight");
    expect(system).not.toContain("<");
    await e.chat(history, "en");
    expect(ports.prompts[1]?.[0]?.content).not.toContain("just scanned");
  });
  it("requires a signed in user and a last user message", async () => {
    const e = engineOn(new FakePorts({ replies: ["x"] }), await memorySql());
    await expect(e.chat(history, "en")).rejects.toMatchObject({
      code: "auth",
    });
    await e.signUp(farmer);
    await expect(e.chat([], "en")).rejects.toMatchObject({ code: "rejected" });
    await expect(
      e.chat([{ role: "assistant", content: "hi" }], "en"),
    ).rejects.toMatchObject({ code: "rejected" });
    await expect(
      e.chat([{ role: "user", content: "   " }], "en"),
    ).rejects.toMatchObject({ code: "rejected" });
  });
  it("replaces answers that name a banned product", async () => {
    const e = await signedIn(
      new FakePorts({ replies: ["Spray Endosulfan on the plants."] }),
    );
    const out = await e.chat(history, "en");
    expect(out).not.toMatch(/endosulfan/i);
    expect(out).toContain("not permitted");
  });
  it("removes quantities and points to the advice screen", async () => {
    const e = await signedIn(
      new FakePorts({
        replies: [
          "Keep leaves dry. Mix 5 ml per litre of water. Rotate crops.",
        ],
      }),
    );
    const out = await e.chat(history, "en");
    expect(out).not.toMatch(/5 ml/);
    expect(out).toContain("Keep leaves dry.");
    expect(out).toContain("Rotate crops.");
    expect(out).toContain("Advice screen");
  });
  it("strips control tokens and handles an empty answer", async () => {
    const e = await signedIn(
      new FakePorts({ replies: ["<|eot_id|>", "Hello <|eot_id|>"] }),
    );
    expect(await e.chat(history, "en")).toContain("could not prepare");
    expect(await e.chat(history, "en")).toBe("Hello");
  });
  it("reports an unavailable model and other failures", async () => {
    const off = await signedIn(
      new FakePorts({ replies: [new Error("llm_unavailable")] }),
    );
    await expect(off.chat(history, "en")).rejects.toMatchObject({
      code: "unavailable",
    });
    const broken = await signedIn(
      new FakePorts({ replies: [new Error("boom")] }),
    );
    await expect(broken.chat(history, "en")).rejects.toMatchObject({
      code: "unknown",
    });
  });
  it("passes the native reason on when the model fails to run", async () => {
    const reason = "llm_load_failed: runtime returned code 18";
    const e = await signedIn(new FakePorts({ replies: [new Error(reason)] }));
    await expect(e.chat(history, "en")).rejects.toMatchObject({
      code: "llm",
      message: reason,
    });
  });
  it("keeps only the latest turns", async () => {
    const ports = new FakePorts({ replies: ["ok"] });
    const e = await signedIn(ports);
    const long = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `m${i}`,
    }));
    long.push({ role: "user", content: "last" });
    await e.chat(long, "en");
    const sent = ports.prompts[0] ?? [];
    expect(sent.length).toBeLessThanOrEqual(9);
    expect(sent[1]?.role).toBe("user");
    expect(sent[sent.length - 1]?.content).toBe("last");
  });
});
