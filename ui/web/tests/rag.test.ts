import { describe, expect, it } from "vitest";
import { openSqlJs } from "../src/db/sqlJs";
import { StreamGuard } from "../src/engine/core/chat";
import { LocalEngineClient } from "../src/engine/core/engine";
import { KnowledgeBase } from "../src/engine/core/knowledge";
import { RuleEngine } from "../src/engine/core/rules";
import type { VisionResult } from "../src/engine/core/types";
import { FakePorts } from "./fakePorts";

const farmer = {
  name: "Asha Patil",
  mobile: "9876543210",
  password: "secret1",
};

const card = {
  id: "tomato-early-blight",
  crop: "Tomato",
  name: "Early Blight",
  kind: "disease",
  lang: "en",
  summary:
    "A fungus disease that makes brown target-like spots on older tomato leaves.",
  symptoms: ["Brown spots with rings on older leaves.", "Yellow leaf edges."],
  causes: [
    "A fungus that survives on crop waste and spreads in warm wet weather.",
  ],
  actions: [
    { text: "Remove the badly spotted leaves.", priority: "critical" },
    {
      text: "Ask your agriculture officer about a registered spray.",
      priority: "high",
    },
    { text: "Water at the base of the plant.", priority: "normal" },
  ],
  prevention: ["Rotate crops every season.", "Space plants for airflow."],
  help: "Call the extension officer if half the leaves are spotted.",
  sources: [
    { title: "Example Extension", url: "https://extension.example.edu/eb" },
  ],
};

const cardsJson = JSON.stringify({ version: 1, cards: [card] });

const chunk = (id: string, text: string, disease: string, crop: string) =>
  JSON.stringify({
    id,
    text,
    crop,
    disease,
    stage: "any",
    lang: "en",
    region: "any",
    source: "Example Extension",
  });

const chunks = [
  chunk(
    "a:summary",
    "Potato Late Blight. A fast water mould disease of potato leaves in cool wet weather.",
    "Late Blight",
    "Potato",
  ),
  chunk(
    "a:actions",
    "Potato Late Blight what to do: remove infected plants and bury them far from the field.",
    "Late Blight",
    "Potato",
  ),
].join("\n");

const enc = new TextEncoder();

async function engine(
  ports: FakePorts,
  extra: Record<string, unknown> = {},
): Promise<LocalEngineClient> {
  const sql = await openSqlJs();
  const e = new LocalEngineClient(ports, () => Promise.resolve(sql), {
    pinIterations: 1000,
    groundScore: 0.5,
    ...extra,
  });
  await e.signUp(farmer);
  return e;
}

const vision = (label: string, level: number | null = 3): VisionResult => ({
  class_id: 1,
  label,
  confidence: 0.9,
  bbox: [0, 0, 1, 1],
  mask_polygon: [],
  severity_level: level,
  low_confidence: false,
  affected_area_pct: 20,
});

describe("advice from the knowledge base", () => {
  it("builds the answer from the card without calling the model", async () => {
    const ports = new FakePorts({ cards: cardsJson });
    const e = await engine(ports);
    const r = await e.ask("what to do", vision("tomato early blight"), {
      lang: "en",
      area_ha: 0.4,
    });
    expect(r.source).toBe("knowledge");
    expect(ports.prompts.length).toBe(0);
    expect(r.advisory.diagnosis.primary).toBe("Tomato Early Blight");
    expect(r.advisory.actions[0]?.text).toBe(
      "Remove the badly spotted leaves.",
    );
    expect(r.advisory.actions.map((a) => a.priority)).toEqual([
      "critical",
      "high",
      "normal",
    ]);
    expect(r.advisory.preventive).toEqual(card.prevention);
    expect(r.advisory.details?.summary).toBe(card.summary);
    expect(r.advisory.details?.symptoms).toEqual(card.symptoms);
    expect(r.advisory.details?.sources[0]?.title).toBe("Example Extension");
    expect(r.dosage).toMatchObject({ available: true });
  });

  it("puts a severity warning first when many leaves are affected", async () => {
    const e = await engine(new FakePorts({ cards: cardsJson }));
    const r = await e.ask("q", vision("Tomato Early Blight", 5), {
      lang: "en",
    });
    expect(r.advisory.actions[0]?.priority).toBe("critical");
    expect(r.advisory.actions[0]?.text).toContain("Many leaves");
    expect(r.advisory.actions.length).toBe(4);
  });

  it("uses the English card and says so when the language has none", async () => {
    const e = await engine(new FakePorts({ cards: cardsJson }));
    const r = await e.ask("q", vision("Tomato Early Blight"), { lang: "hi" });
    expect(r.source).toBe("knowledge");
    expect(r.advisory.lang).toBe("en");
  });

  it("gives safe generic steps for a disease without a card", async () => {
    const ports = new FakePorts({ cards: cardsJson });
    const e = await engine(ports);
    const r = await e.ask("q", vision("Potato Late Blight"), { lang: "en" });
    expect(r.source).toBe("fallback");
    expect(ports.prompts.length).toBe(0);
    expect(r.advisory.diagnosis.primary).toBe("Potato Late Blight");
    expect(r.advisory.actions.length).toBeGreaterThanOrEqual(3);
    expect(r.advisory.details).toBeUndefined();
  });

  it("gives pest steps for an insect without a card", async () => {
    const e = await engine(new FakePorts({ cards: cardsJson }));
    const r = await e.ask("q", vision("Pest brown plant hopper", null), {
      lang: "en",
    });
    expect(r.source).toBe("fallback");
    expect(r.advisory.diagnosis.primary).toBe("Brown Plant Hopper");
    expect(r.advisory.actions[0]?.text).toContain("insects");
  });

  it("answers a healthy leaf from the template", async () => {
    const e = await engine(new FakePorts({ cards: cardsJson }));
    const r = await e.ask("q", vision("Apple leaf", null), { lang: "en" });
    expect(r.source).toBe("knowledge");
    expect(r.advisory.diagnosis.primary).toBe("Healthy");
  });

  it("ignores a broken cards file", async () => {
    const e = await engine(
      new FakePorts({ assets: { cards: enc.encode("not json") } }),
    );
    const r = await e.ask("q", vision("Tomato Early Blight"), { lang: "en" });
    expect(r.source).toBe("fallback");
  });
});

describe("knowledge base", () => {
  it("skips malformed cards and finds by normalised label", () => {
    const kb = KnowledgeBase.fromJson(
      JSON.stringify({
        cards: [card, { id: "x" }, 7, { ...card, lang: "fr" }],
      }),
    );
    expect(kb.size).toBe(1);
    expect(kb.find("tomato early blight", "en")?.name).toBe("Early Blight");
    expect(kb.find("Tomato  Early_Blight", "te")?.name).toBe("Early Blight");
    expect(kb.find("Tomato Late Blight", "en")).toBeNull();
  });
});

describe("grounded chat", () => {
  const ask = (text: string) => [{ role: "user" as const, content: text }];

  it("sends verified facts to the model and cites the source", async () => {
    const ports = new FakePorts({
      chunks,
      replies: ["Remove infected plants and bury them."],
    });
    const e = await engine(ports);
    const out = await e.chat(ask("How do I stop late blight in potato?"), "en");
    const system = ports.prompts[0]?.[0]?.content ?? "";
    expect(system).toContain("Verified facts");
    expect(system).toContain("bury them far from the field");
    expect(out).toContain("Remove infected plants");
    expect(out).toContain("Source: Example Extension");
    expect(out).not.toContain("General guidance only");
  });

  it("keeps the topic from the scan in the search", async () => {
    const ports = new FakePorts({ chunks, replies: ["ok"] });
    const e = await engine(ports);
    await e.chat(ask("What should I do now?"), "en", "Potato Late Blight");
    expect(ports.prompts[0]?.[0]?.content).toContain("Verified facts");
  });

  it("marks the answer as general guidance when nothing matches", async () => {
    const ports = new FakePorts({ chunks, replies: ["Water in the morning."] });
    const e = await engine(ports);
    const out = await e.chat(ask("When to irrigate banana?"), "en");
    expect(ports.prompts[0]?.[0]?.content).not.toContain("Verified facts");
    expect(out).toContain("General guidance only");
    expect(out).not.toContain("Source:");
  });

  it("falls back to English facts for a Hindi question with a scan topic", async () => {
    const ports = new FakePorts({ chunks, replies: ["ठीक है"] });
    const e = await engine(ports);
    await e.chat(ask("अब क्या करें?"), "hi", "Potato Late Blight");
    expect(ports.prompts[0]?.[0]?.content).toContain("Verified facts");
  });

  it("drops fact chunks that name a banned product", async () => {
    const bad = chunk(
      "b:actions",
      "Potato Late Blight what to do: spray endosulfan every week.",
      "Late Blight",
      "Potato",
    );
    const ports = new FakePorts({ chunks: bad, replies: ["ok"] });
    const e = await engine(ports);
    await e.chat(ask("late blight in potato"), "en");
    expect(ports.prompts[0]?.[0]?.content.toLowerCase()).not.toContain(
      "endosulfan",
    );
  });

  it("removes the footer from earlier answers before asking again", async () => {
    const ports = new FakePorts({ chunks, replies: ["ok"] });
    const e = await engine(ports);
    await e.chat(
      [
        { role: "user", content: "late blight in potato" },
        {
          role: "assistant",
          content: "Remove plants.\n\n— Source: Example Extension",
        },
        { role: "user", content: "and then?" },
      ],
      "en",
      "Potato Late Blight",
    );
    const sent = (ports.prompts[0] ?? []).map((m) => m.content).join("|");
    expect(sent).toContain("Remove plants.");
    expect(sent).not.toContain("Source: Example Extension|");
    expect(sent).not.toContain("— Source");
  });
});

describe("streaming chat", () => {
  const ask = [{ role: "user" as const, content: "When to water?" }];

  it("reports growing text and returns the final answer", async () => {
    const e = await engine(
      new FakePorts({ replies: ["Water early in the morning every day."] }),
    );
    const seen: string[] = [];
    const out = await e.chat(ask, "en", undefined, (t) => seen.push(t));
    expect(seen.length).toBeGreaterThan(2);
    for (let i = 1; i < seen.length; i++)
      expect((seen[i] ?? "").startsWith(seen[i - 1] ?? "")).toBe(true);
    expect(seen[seen.length - 1]).toBe("Water early in the morning every");
    expect(out).toContain("Water early in the morning every day.");
  });

  it("never shows a quantity while it streams", async () => {
    const e = await engine(
      new FakePorts({
        replies: [
          "Keep leaves dry. Mix 5 ml per litre of water. Rotate crops.",
        ],
      }),
    );
    const seen: string[] = [];
    const out = await e.chat(ask, "en", undefined, (t) => seen.push(t));
    expect(seen.some((t) => /5 ml|\b5\b/.test(t))).toBe(false);
    expect(out).not.toMatch(/5 ml/);
    expect(out).toContain("Advice screen");
  });

  it("never shows a banned product while it streams", async () => {
    const e = await engine(
      new FakePorts({ replies: ["Use Endosulfan on the plants today."] }),
    );
    const seen: string[] = [];
    const out = await e.chat(ask, "en", undefined, (t) => seen.push(t));
    expect(seen.some((t) => /endosulfan/i.test(t))).toBe(false);
    expect(out).toContain("not permitted");
  });
});

describe("stream guard", () => {
  const rules = new RuleEngine(["Endosulfan"]);

  it("holds back a word that is still being written", () => {
    const g = new StreamGuard(rules);
    expect(g.push("Water ear")).toBe("Water");
    expect(g.push("ly. ")).toBe("Water early.");
  });

  it("holds a sentence with a number until it ends", () => {
    const g = new StreamGuard(rules);
    expect(g.push("Dry leaves. Use 5 ")).toBe("Dry leaves.");
    expect(g.push("ml per litre. Rotate crops. ")).toBe(
      "Dry leaves. Rotate crops.",
    );
  });

  it("hides control tokens and stays blocked after a banned name", () => {
    const g = new StreamGuard(rules);
    expect(g.push("Hello <|eot")).toBe("Hello");
    expect(g.push("_id|> there ")).toBe("Hello there");
    expect(g.push("Endosulfan now ")).toBe("");
    expect(g.push("more text ")).toBe("");
  });
});

describe("warm up", () => {
  it("loads the model once the engine is ready", async () => {
    const ports = new FakePorts();
    const e = await engine(ports);
    await e.warmUp();
    expect(ports.warmed).toBe(1);
  });

  it("never throws when the model cannot load", async () => {
    const ports = new FakePorts();
    ports.warmUp = () => Promise.reject(new Error("llm_missing"));
    const e = await engine(ports);
    await expect(e.warmUp()).resolves.toBeUndefined();
  });

  it("needs a signed in user", async () => {
    const sql = await openSqlJs();
    const e = new LocalEngineClient(
      new FakePorts(),
      () => Promise.resolve(sql),
      {
        pinIterations: 1000,
      },
    );
    await expect(e.warmUp()).rejects.toMatchObject({ code: "auth" });
  });
});
