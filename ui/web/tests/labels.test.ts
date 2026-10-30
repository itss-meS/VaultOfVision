import { describe, expect, it } from "vitest";
import cases from "../../../tests/label_cases.json";
import { isJunkLabel, parseLabel } from "../src/engine/core/labels";

interface Case {
  raw: string;
  kind: string;
  crop: string | null;
  name: string;
  label: string;
  key: string;
}

describe("label parsing matches the Python trainer", () => {
  for (const c of cases.cases as Case[]) {
    it(`parses ${JSON.stringify(c.raw)}`, () => {
      const got = parseLabel(c.raw);
      expect(got.kind).toBe(c.kind);
      expect(got.crop).toBe(c.crop);
      expect(got.name).toBe(c.name);
      expect(got.label).toBe(c.label);
      expect(got.key).toBe(c.key);
    });
  }

  it("detects junk class names", () => {
    for (const n of cases.junk) expect(isJunkLabel(n)).toBe(true);
    for (const n of cases.notjunk) expect(isJunkLabel(n)).toBe(false);
  });
});
