import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import dosageSchema from "../../../schemas/dosage_table.schema.json";
import {
  canonicalCrop,
  displayLabel,
  isUnsupportedLabel,
  nameKey,
  parseLabel,
} from "../src/engine/core/labelParse";
import { Orchestrator, mentionsDose } from "../src/engine/core/orchestrator";
import { Bm25Retriever } from "../src/engine/core/retriever";
import { RuleEngine, rulesFromDocument } from "../src/engine/core/rules";
import { DosageTable, dosageFromDocument } from "../src/engine/core/tools";
import { SYSTEM_RULES } from "../src/engine/core/prompts";
import type { VisionResult } from "../src/engine/core/types";
import labels from "./fixtures/all_crops_labels.json";
import { FakePorts, goodAdvisory } from "./fakePorts";

const read = (name: string): string =>
  readFileSync(resolve(process.cwd(), "..", "..", "knowledge", name), "utf-8");

const bannedDoc: unknown = JSON.parse(read("banned_pesticides.json"));
const dosageDoc: unknown = JSON.parse(read("dosage_table.json"));
const chunksText = read("chunks.jsonl");

function vision(label: string, over: Partial<VisionResult> = {}): VisionResult {
  return {
    class_id: 1,
    label,
    confidence: 0.9,
    bbox: [0, 0, 1, 1],
    mask_polygon: [],
    severity_level: 3,
    low_confidence: false,
    affected_area_pct: 20,
    ...over,
  };
}

function setup(replies: string[]) {
  const ports = new FakePorts({ replies });
  const rules = rulesFromDocument(bannedDoc);
  const table = dosageFromDocument(dosageDoc);
  const retriever = Bm25Retriever.fromJsonl(chunksText);
  return {
    ports,
    rules,
    table,
    orch: new Orchestrator(ports, retriever, rules, table),
  };
}

describe("parseLabel", () => {
  const cases: Array<
    [string, { kind: string; crop: string | null; name: string }]
  > = [
    [
      "Potato Late Blight",
      { kind: "disease", crop: "potato", name: "Late Blight" },
    ],
    [
      "potato late blight",
      { kind: "disease", crop: "potato", name: "Late Blight" },
    ],
    [
      "  POTATO   LATE_BLIGHT ",
      { kind: "disease", crop: "potato", name: "Late Blight" },
    ],
    ["Rice Blast", { kind: "disease", crop: "rice", name: "Blast" }],
    ["Grape Black Rot", { kind: "disease", crop: "grape", name: "Black Rot" }],
    [
      "Grapevine Leafroll Disease",
      { kind: "disease", crop: "grape", name: "Leafroll Disease" },
    ],
    [
      "Maize Common Rust",
      { kind: "disease", crop: "corn", name: "Common Rust" },
    ],
    [
      "Corn Common Rust",
      { kind: "disease", crop: "corn", name: "Common Rust" },
    ],
    [
      "Pepper bell Bacterial Spot",
      { kind: "disease", crop: "bell pepper", name: "Bacterial Spot" },
    ],
    [
      "Bell Pepper Bacterial Spot",
      { kind: "disease", crop: "bell pepper", name: "Bacterial Spot" },
    ],
    [
      "Cassava Bacterial Blight (CBB)",
      { kind: "disease", crop: "cassava", name: "Bacterial Blight" },
    ],
    ["Potato Healthy", { kind: "healthy", crop: "potato", name: "Healthy" }],
    ["potato healthy", { kind: "healthy", crop: "potato", name: "Healthy" }],
    ["Healthy Potato", { kind: "healthy", crop: "potato", name: "Healthy" }],
    [
      "Potato Healthy Leaf",
      { kind: "healthy", crop: "potato", name: "Healthy" },
    ],
    [
      "Pepper bell Healthy",
      { kind: "healthy", crop: "bell pepper", name: "Healthy" },
    ],
    ["Healthy", { kind: "healthy", crop: null, name: "Healthy" }],
    ["healthy", { kind: "healthy", crop: null, name: "Healthy" }],
    [
      "Pest Brown Plant Hopper",
      { kind: "pest", crop: null, name: "Brown Plant Hopper" },
    ],
    [
      "pest brown plant hopper",
      { kind: "pest", crop: null, name: "Brown Plant Hopper" },
    ],
    ["Pest Aphids", { kind: "pest", crop: null, name: "Aphids" }],
    ["Early Blight", { kind: "disease", crop: null, name: "Early Blight" }],
  ];
  it.each(cases)("parses %s", (label, expected) => {
    expect(parseLabel(label)).toEqual(expected);
  });

  it("parses every scanner label to a sensible shape", () => {
    expect(labels.length).toBe(230);
    for (const label of labels) {
      const p = parseLabel(label);
      if (/^pest\s/i.test(label)) {
        expect(p.kind).toBe("pest");
        expect(p.crop).toBeNull();
        expect(p.name.length).toBeGreaterThan(0);
      } else if (/healthy/i.test(label)) {
        expect(p.kind).toBe("healthy");
        expect(p.crop, label).not.toBeNull();
      } else if (label !== "images") {
        expect(p.kind).toBe("disease");
        expect(p.crop, label).not.toBeNull();
        expect(p.name.length, label).toBeGreaterThan(0);
      }
    }
  });

  it("gives a stray label no crop so it can never get advice", () => {
    expect(parseLabel("images")).toMatchObject({ kind: "disease", crop: null });
  });

  it("normalises crop spellings and name keys", () => {
    expect(canonicalCrop("Maize")).toBe("corn");
    expect(canonicalCrop("pepper bell")).toBe("bell pepper");
    expect(canonicalCrop("unknown crop")).toBeNull();
    expect(nameKey("Late  Blight")).toBe(nameKey("late blight (LB)"));
    expect(displayLabel(parseLabel("potato late blight"))).toBe(
      "Potato Late Blight",
    );
    expect(displayLabel(parseLabel("pest aphids"))).toBe("Pest Aphids");
  });

  it("recognises unsupported scanner labels without naming a crop", () => {
    for (const l of [
      "unsupported",
      "not_tomato",
      "Not_Potato",
      "other_crop",
      "other crop",
    ])
      expect(isUnsupportedLabel(l)).toBe(true);
    expect(isUnsupportedLabel("Potato Late Blight")).toBe(false);
  });
});

describe("shipped knowledge files", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });

  it("dosage table matches its JSON schema", () => {
    const validate = ajv.compile(dosageSchema);
    expect(validate(dosageDoc), JSON.stringify(validate.errors)).toBe(true);
  });

  it("every entry survives loading, so every entry has a valid source", () => {
    const raw = (dosageDoc as { entries: unknown[] }).entries;
    expect(raw.length).toBeGreaterThan(0);
    expect(dosageFromDocument(dosageDoc).entries.length).toBe(raw.length);
  });

  it("covers potato, rice, tomato and grape", () => {
    const crops = dosageFromDocument(dosageDoc).crops();
    for (const c of ["potato", "rice", "tomato", "grape"])
      expect(crops.has(c)).toBe(true);
  });

  it("no product in the table is on the banned list", () => {
    const rules = rulesFromDocument(bannedDoc);
    for (const e of dosageFromDocument(dosageDoc).entries)
      expect(
        rules.mentionsBanned(String(e["product"])),
        String(e["product"]),
      ).toBe(false);
  });

  it("the banned list holds the official names", () => {
    const rules = rulesFromDocument(bannedDoc);
    for (const n of [
      "Endosulfan",
      "Dicofol",
      "Dinocap",
      "Methomyl",
      "Triazophos",
      "Dichlorvos",
    ])
      expect(rules.mentionsBanned(`use ${n} on the crop`), n).toBe(true);
  });

  it("entries without a valid source are dropped when loading", () => {
    const base = {
      kind: "disease",
      crop: "potato",
      disease: "Late Blight",
      severity_min: 1,
      severity_max: 5,
      product: "Mancozeb 75% WG",
      dose_per_ha: 1,
      unit: "kg",
    };
    const good = {
      ...base,
      source: {
        authority: "CIBRC",
        document: "Major Uses of Pesticides",
        url: "https://example.org/a",
      },
    };
    const table = dosageFromDocument({
      version: 1,
      entries: [
        base,
        {
          ...base,
          source: {
            authority: "A blog",
            document: "x y z",
            url: "https://example.org",
          },
        },
        {
          ...base,
          source: {
            authority: "ICAR",
            document: "Doc name here",
            url: "http://example.org",
          },
        },
        good,
      ],
    });
    expect(table.entries.length).toBe(1);
  });

  it("every chunk has a source and no chunk names a banned product", () => {
    const rules = rulesFromDocument(bannedDoc);
    const lines = chunksText.split("\n").filter((l) => l.trim() !== "");
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const rec = JSON.parse(line) as { text: string; source: { url: string } };
      expect(rec.source.url.startsWith("https://")).toBe(true);
      expect(rules.mentionsBanned(rec.text)).toBe(false);
    }
  });
});

describe("system prompt", () => {
  it("is crop neutral", () => {
    expect(SYSTEM_RULES.toLowerCase()).not.toContain("tomato");
  });
});

describe("multi crop advice", () => {
  it("gives potato advice with the potato dose from the table", async () => {
    const reply = goodAdvisory({
      diagnosis: {
        primary: "Potato Late Blight",
        confidence: 0.9,
        differential: [],
      },
      tool_call: {
        tool: "calc_dosage",
        args: { crop: "potato", area_ha: 99, severity: 5 },
      },
    });
    const { ports, orch } = setup([reply]);
    const out = await orch.advise(
      "what to do",
      vision("Potato Late Blight"),
      "en",
      "",
      2,
    );
    expect(out.source).toBe("llm");
    expect(out.advisory.tool_call?.args).toEqual({
      crop: "potato",
      area_ha: 2,
      severity: 3,
    });
    expect(out.dosage).toMatchObject({
      available: true,
      product: "Mancozeb 75% WG",
      dose_per_ha: 1,
      total: 2,
      unit: "kg",
    });
    const body = ports.prompts[0]?.[1]?.content ?? "";
    expect(body).toContain('"crop":"potato"');
    expect(body).toContain("<mode>disease</mode>");
    expect(body).toContain("Phytophthora infestans");
  });

  it("accepts the same disease name under other crop spellings in the label", async () => {
    const { orch } = setup([goodAdvisory()]);
    const out = await orch.advise(
      "q",
      vision("potato  late_blight"),
      "en",
      "",
      1,
    );
    expect(out.source).toBe("llm");
    expect(out.dosage).toMatchObject({ available: true });
  });

  it("returns the safe template for a crop that has no data", async () => {
    const { ports, orch } = setup([goodAdvisory()]);
    const out = await orch.advise("q", vision("Wheat Leaf Rust"), "en", "", 1);
    expect(out.source).toBe("fallback");
    expect(ports.prompts.length).toBe(0);
    expect(out.dosage).toBeNull();
    expect(out.advisory.tool_call).toBeNull();
    const text = out.advisory.actions
      .map((a) => a.text)
      .join(" ")
      .toLowerCase();
    expect(text).toContain("no vetted dosage");
    expect(text).toContain("extension officer");
    expect(mentionsDose(out.advisory)).toBe(false);
  });

  it("returns the safe template in every language", async () => {
    const { orch } = setup([goodAdvisory()]);
    for (const lang of ["en", "hi", "mr", "te"] as const) {
      const out = await orch.advise(
        "q",
        vision("Wheat Leaf Rust"),
        lang,
        "",
        1,
      );
      expect(out.source).toBe("fallback");
      expect(out.advisory.lang).toBe(lang);
      expect(out.advisory.actions.length).toBe(3);
    }
  });

  it("gives no invented dose for an unknown disease of a supported crop", async () => {
    const { ports, orch } = setup([goodAdvisory()]);
    const out = await orch.advise("q", vision("Potato Blackleg"), "en", "", 1);
    expect(out.source).toBe("fallback");
    expect(ports.prompts.length).toBe(0);
    expect(out.dosage).toBeNull();
    expect(out.advisory.tool_call).toBeNull();
  });

  it("gives no dose for a grape disease that has no table row", async () => {
    const { orch } = setup([goodAdvisory()]);
    const out = await orch.advise("q", vision("Grape Black Rot"), "en", "", 1);
    expect(out.source).toBe("fallback");
    expect(out.dosage).toBeNull();
  });

  it("gives no advice for a label with no recognisable crop", async () => {
    const { orch } = setup([goodAdvisory()]);
    for (const label of ["images", "Early Blight"]) {
      const out = await orch.advise("q", vision(label), "en", "", 1);
      expect(out.source).toBe("fallback");
      expect(out.dosage).toBeNull();
    }
  });

  it("refuses unsupported scans for any crop wording", async () => {
    const { orch } = setup([goodAdvisory()]);
    for (const label of ["unsupported", "not_potato", "other_crop"]) {
      const out = await orch.advise("q", vision(label), "en", "", 1);
      expect(out.source).toBe("refusal");
    }
  });

  it("gives care tips and no treatment for a healthy leaf", async () => {
    const { ports, orch } = setup([goodAdvisory()]);
    for (const label of ["Potato Healthy", "Pepper bell Healthy", "Healthy"]) {
      const out = await orch.advise(
        "q",
        vision(label, { severity_level: null }),
        "en",
        "",
        1,
      );
      expect(out.source).toBe("llm");
      expect(out.dosage).toBeNull();
      expect(out.advisory.tool_call).toBeNull();
      expect(out.advisory.preventive.length).toBeGreaterThan(0);
      expect(out.advisory.actions.length).toBe(1);
      const text = JSON.stringify(out.advisory).toLowerCase();
      expect(text).not.toMatch(/spray|fungicide|pesticide|dose/);
    }
    expect(ports.prompts.length).toBe(0);
  });

  it("gives pest advice with the dose only when the table has a pest row", async () => {
    const { ports, orch } = setup([goodAdvisory()]);
    const out = await orch.advise(
      "q",
      vision("Pest Brown Plant Hopper", { severity_level: null }),
      "en",
      "",
      2,
    );
    expect(out.source).toBe("llm");
    expect(out.dosage).toMatchObject({
      available: true,
      product: "Buprofezin 25% SC",
      dose_per_ha: 0.8,
      total: 1.6,
      unit: "l",
    });
    expect(out.advisory.tool_call).toBeNull();
    const body = ports.prompts[0]?.[1]?.content ?? "";
    expect(body).toContain("<mode>pest</mode>");
    expect(body).toContain("hopper");
  });

  it("gives pest advice without a dose when the table has no row for that pest", async () => {
    const { ports, orch } = setup([goodAdvisory()]);
    const out = await orch.advise(
      "q",
      vision("Pest Rice Leaf Roller", { severity_level: null }),
      "en",
      "",
      2,
    );
    expect(out.source).toBe("llm");
    expect(ports.prompts.length).toBe(1);
    expect(out.dosage).toMatchObject({
      available: false,
      reason: "no_vetted_entry",
    });
    expect(out.advisory.tool_call).toBeNull();
  });

  it("gives pest advice without a dose for aphids and thrips", async () => {
    for (const label of [
      "Pest aphids",
      "Pest Thrips",
      "Pest Scirtothrips dorsalis Hood",
    ]) {
      const { ports, orch } = setup([goodAdvisory()]);
      const out = await orch.advise(
        "q",
        vision(label, { severity_level: null }),
        "en",
        "",
        2,
      );
      expect(out.source, label).toBe("llm");
      expect(ports.prompts.length).toBe(1);
      expect(out.dosage).toMatchObject({
        available: false,
        reason: "no_vetted_entry",
      });
    }
  });

  it("returns the safe template for a pest with no knowledge chunks", async () => {
    const { ports, orch } = setup([goodAdvisory()]);
    const out = await orch.advise(
      "q",
      vision("Pest Wireworm", { severity_level: null }),
      "en",
      "",
      1,
    );
    expect(out.source).toBe("fallback");
    expect(ports.prompts.length).toBe(0);
    expect(out.dosage).toBeNull();
  });

  it("never lets a banned product through", async () => {
    const { ports, orch, rules, table } = setup([
      goodAdvisory({
        actions: [
          { text: "Spray Endosulfan on the leaves.", priority: "high" },
        ],
      }),
    ]);
    const out = await orch.advise(
      "q",
      vision("Potato Late Blight"),
      "en",
      "",
      1,
    );
    expect(out.source).toBe("fallback");
    expect(JSON.stringify(out.advisory)).not.toMatch(/endosulfan/i);
    const asked = await orch.advise(
      "how much thiodan",
      vision("Potato Late Blight"),
      "en",
      "",
      1,
    );
    expect(asked.source).toBe("refusal");
    expect(ports.prompts.length).toBeGreaterThan(0);
    const poisoned = new DosageTable([
      {
        kind: "disease",
        crop: "potato",
        disease: "Late Blight",
        severity_min: 1,
        severity_max: 5,
        product: "Endosulfan 35% EC",
        dose_per_ha: 1,
        unit: "l",
      },
    ]);
    const o2 = new Orchestrator(
      new FakePorts({ replies: [goodAdvisory()] }),
      Bm25Retriever.fromJsonl(chunksText),
      rules,
      poisoned,
    );
    const out2 = await o2.advise(
      "q",
      vision("Potato Late Blight"),
      "en",
      "",
      1,
    );
    expect(out2.dosage).toMatchObject({
      available: false,
      reason: "product_not_permitted",
    });
    expect(table.entries.length).toBeGreaterThan(0);
  });

  it("rejects model text that states its own dose", async () => {
    const bad = goodAdvisory({
      actions: [
        { text: "Spray 2 g per litre of water every week.", priority: "high" },
      ],
    });
    const { orch } = setup([bad, bad, bad]);
    const out = await orch.advise(
      "q",
      vision("Potato Late Blight"),
      "en",
      "",
      1,
    );
    expect(out.source).toBe("fallback");
    expect(out.attempts).toBe(3);
    expect(out.dosage).toBeNull();
  });

  it("detects doses written in other languages", () => {
    const make = (text: string) => ({
      ...(JSON.parse(goodAdvisory()) as object),
      actions: [{ text, priority: "high" }],
    });
    for (const text of [
      "2 किलो प्रति एकड़",
      "५ लीटर पानी",
      "2 లీటరు నీరు",
      "10 ml per litre",
      "5 kg/ha",
    ])
      expect(mentionsDose(make(text) as never), text).toBe(true);
    for (const text of [
      "Remove leaves for 10 minutes",
      "Check after 7 days",
      "Keep 30 cm spacing",
    ])
      expect(mentionsDose(make(text) as never), text).toBe(false);
  });

  it("rules engine still blocks banned names after normalisation", () => {
    expect(new RuleEngine(["Endosulfan"]).mentionsBanned("END-OSULFAN")).toBe(
      true,
    );
  });
});
