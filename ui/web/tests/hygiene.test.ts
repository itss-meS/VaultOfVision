import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../src/i18n/en.json";
import hi from "../src/i18n/hi.json";
import mr from "../src/i18n/mr.json";
import te from "../src/i18n/te.json";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const full = join(dir, n);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

function keys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" && v !== null
      ? keys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe("source hygiene", () => {
  const sources = files("src").filter((f) => /\.(ts|tsx)$/.test(f));

  it("uses browser storage only in prefs.ts and never for tokens", () => {
    for (const f of sources) {
      const text = readFileSync(f, "utf8");
      if (f.endsWith("prefs.ts")) {
        expect(text).not.toMatch(/token|csrf|session|password|pin/i);
        continue;
      }
      expect(text, f).not.toMatch(
        /localStorage|sessionStorage|indexedDB|document\.cookie/,
      );
    }
  });

  it("never uses dangerous HTML sinks or dynamic code", () => {
    for (const f of sources) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(
        /dangerouslySetInnerHTML|innerHTML|outerHTML|eval\(|new Function|document\.write/,
      );
    }
  });

  it("has no external URLs or CDN references", () => {
    for (const f of [...sources, "index.html"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(
        /https?:\/\/(?!www\.w3\.org)/,
      );
    }
  });

  it("has no emoji or decorative symbols in sources", () => {
    for (const f of sources) {
      const bad = Array.from(readFileSync(f, "utf8")).filter((ch) => {
        const c = ch.codePointAt(0) ?? 0;
        return (c >= 0x2190 && c <= 0x2bff) || c >= 0x1f000;
      });
      expect(bad, f).toEqual([]);
    }
  });

  it("has no inline style attributes or secrets in sources", () => {
    for (const f of sources.filter((s) => s.endsWith(".tsx"))) {
      const text = readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/style=\{\{/);
      expect(text, f).not.toMatch(/api[_-]?key|secret\s*[:=]\s*['"]/i);
    }
  });

  it("keeps translations complete across languages", () => {
    const base = keys(en).sort();
    expect(keys(hi).sort()).toEqual(base);
    expect(keys(mr).sort()).toEqual(base);
    expect(keys(te).sort()).toEqual(base);
  });
});
