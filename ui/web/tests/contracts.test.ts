import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import advisorySchema from "../../../schemas/advisory_v3.schema.json";
import visionSchema from "../../../schemas/vision_result.schema.json";
import { FakeEngineClient } from "./fakeEngine";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateVision = ajv.compile(visionSchema);
const validateAdvisory = ajv.compile(advisorySchema);

describe("fake engine honours the shared JSON schemas", () => {
  const engine = new FakeEngineClient(0, true);

  it("produces valid VisionResult for many photos", async () => {
    for (let size = 1000; size < 1400; size += 7) {
      const result = await engine.analyzeImage(
        new Blob([new Uint8Array(size)]),
      );
      expect(
        validateVision(result),
        JSON.stringify(validateVision.errors),
      ).toBe(true);
    }
  });

  it("produces valid Advisory in every language", async () => {
    const vision = await engine.analyzeImage(new Blob([new Uint8Array(1234)]));
    for (const lang of ["en", "hi", "mr", "te"] as const) {
      const res = await engine.ask("help", vision, { lang, area_ha: 0.5 });
      expect(
        validateAdvisory(res.advisory),
        JSON.stringify(validateAdvisory.errors),
      ).toBe(true);
    }
  });

  it("schemas reject unknown fields", () => {
    expect(validateVision({ extra: 1 })).toBe(false);
    expect(validateAdvisory({ extra: 1 })).toBe(false);
  });
});
