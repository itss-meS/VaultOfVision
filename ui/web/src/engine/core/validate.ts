import type { Advisory, VisionResult } from "./types";

export class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaError";
  }
}

type Obj = Record<string, unknown>;

function fail(path: string, why: string): never {
  throw new SchemaError(`${path}: ${why}`);
}

function obj(v: unknown, path: string, keys: readonly string[]): Obj {
  if (typeof v !== "object" || v === null || Array.isArray(v))
    fail(path, "expected object");
  const o = v as Obj;
  for (const k of Object.keys(o))
    if (!keys.includes(k)) fail(path, `unknown field ${k}`);
  return o;
}

function need(o: Obj, key: string, path: string): unknown {
  if (!Object.prototype.hasOwnProperty.call(o, key))
    fail(path, `missing ${key}`);
  return o[key];
}

function str(v: unknown, path: string, min: number, max: number): string {
  if (typeof v !== "string") return fail(path, "expected string");
  if (v.length < min || v.length > max) fail(path, "length out of range");
  return v;
}

function num(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v))
    return fail(path, "expected number");
  if (v < min || v > max) fail(path, "out of range");
  return v;
}

function int(v: unknown, path: string, min: number, max: number): number {
  const n = num(v, path, min, max);
  if (!Number.isInteger(n)) fail(path, "expected integer");
  return n;
}

function arr(v: unknown, path: string, min: number, max: number): unknown[] {
  if (!Array.isArray(v)) return fail(path, "expected array");
  if (v.length < min || v.length > max) fail(path, "size out of range");
  return v;
}

function oneOf<T extends string>(
  v: unknown,
  path: string,
  allowed: readonly T[],
): T {
  if (typeof v !== "string" || !allowed.includes(v as T))
    return fail(path, "not allowed");
  return v as T;
}

function validateDetails(value: unknown): void {
  const d = obj(value, "details", [
    "summary",
    "symptoms",
    "causes",
    "help",
    "sources",
  ]);
  str(need(d, "summary", "details"), "details.summary", 1, 600);
  for (const s of arr(need(d, "symptoms", "details"), "details.symptoms", 0, 8))
    str(s, "details.symptoms", 1, 300);
  for (const c of arr(need(d, "causes", "details"), "details.causes", 0, 6))
    str(c, "details.causes", 1, 300);
  if (Object.prototype.hasOwnProperty.call(d, "help"))
    str(d["help"], "details.help", 1, 300);
  for (const src of arr(
    need(d, "sources", "details"),
    "details.sources",
    0,
    6,
  )) {
    const item = obj(src, "details.sources", ["title", "url"]);
    str(need(item, "title", "source"), "source.title", 1, 160);
    str(need(item, "url", "source"), "source.url", 1, 300);
  }
}

export function validateAdvisory(value: unknown): Advisory {
  const root = obj(value, "advisory", [
    "schema_version",
    "diagnosis",
    "severity",
    "actions",
    "tool_call",
    "preventive",
    "safety_notice",
    "lang",
    "details",
  ]);
  oneOf(need(root, "schema_version", "advisory"), "schema_version", [
    "advisory_v3",
  ]);
  const diag = obj(need(root, "diagnosis", "advisory"), "diagnosis", [
    "primary",
    "confidence",
    "differential",
  ]);
  str(need(diag, "primary", "diagnosis"), "diagnosis.primary", 1, 120);
  num(need(diag, "confidence", "diagnosis"), "diagnosis.confidence", 0, 1);
  for (const d of arr(
    need(diag, "differential", "diagnosis"),
    "diagnosis.differential",
    0,
    5,
  ))
    str(d, "diagnosis.differential", 1, 120);

  const sev = need(root, "severity", "advisory");
  if (sev !== null) {
    const s = obj(sev, "severity", ["level", "label", "affected_area_pct"]);
    int(need(s, "level", "severity"), "severity.level", 1, 5);
    str(need(s, "label", "severity"), "severity.label", 1, 40);
    num(
      need(s, "affected_area_pct", "severity"),
      "severity.affected_area_pct",
      0,
      100,
    );
  }

  for (const a of arr(need(root, "actions", "advisory"), "actions", 1, 12)) {
    const item = obj(a, "actions", ["text", "priority"]);
    str(need(item, "text", "actions"), "actions.text", 1, 600);
    oneOf(need(item, "priority", "actions"), "actions.priority", [
      "critical",
      "high",
      "normal",
    ]);
  }

  const call = need(root, "tool_call", "advisory");
  if (call !== null) {
    const c = obj(call, "tool_call", ["tool", "args"]);
    oneOf(need(c, "tool", "tool_call"), "tool_call.tool", ["calc_dosage"]);
    const args = obj(need(c, "args", "tool_call"), "tool_call.args", [
      "crop",
      "area_ha",
      "severity",
    ]);
    str(need(args, "crop", "args"), "args.crop", 1, 40);
    const area = num(need(args, "area_ha", "args"), "args.area_ha", 0, 1000);
    if (area <= 0) fail("args.area_ha", "must be positive");
    int(need(args, "severity", "args"), "args.severity", 1, 5);
  }

  for (const p of arr(
    need(root, "preventive", "advisory"),
    "preventive",
    0,
    12,
  ))
    str(p, "preventive", 1, 400);
  str(need(root, "safety_notice", "advisory"), "safety_notice", 1, 600);
  oneOf(need(root, "lang", "advisory"), "lang", ["en", "hi", "mr", "te"]);
  if (Object.prototype.hasOwnProperty.call(root, "details"))
    validateDetails(root["details"]);
  return value as Advisory;
}

export function validateVision(value: unknown): VisionResult {
  const root = obj(value, "vision", [
    "class_id",
    "label",
    "confidence",
    "bbox",
    "mask_polygon",
    "severity_level",
    "low_confidence",
    "affected_area_pct",
  ]);
  int(need(root, "class_id", "vision"), "class_id", 0, 1000);
  str(need(root, "label", "vision"), "label", 1, 64);
  num(need(root, "confidence", "vision"), "confidence", 0, 1);
  for (const b of arr(need(root, "bbox", "vision"), "bbox", 4, 4))
    num(b, "bbox", 0, 1);
  for (const pt of arr(
    need(root, "mask_polygon", "vision"),
    "mask_polygon",
    0,
    2000,
  ))
    for (const c of arr(pt, "mask_polygon", 2, 2)) num(c, "mask_polygon", 0, 1);
  const lvl = need(root, "severity_level", "vision");
  if (lvl !== null) int(lvl, "severity_level", 1, 5);
  if (typeof need(root, "low_confidence", "vision") !== "boolean")
    fail("low_confidence", "expected boolean");
  if (Object.prototype.hasOwnProperty.call(root, "affected_area_pct")) {
    const pct = root["affected_area_pct"];
    if (pct !== null && pct !== undefined)
      num(pct, "affected_area_pct", 0, 100);
  }
  return value as VisionResult;
}
