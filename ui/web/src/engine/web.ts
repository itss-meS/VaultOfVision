import { isPlantPixel } from "./core/crop";
import { openDevSql } from "../db/devSql";
import { LocalEngineClient } from "./core/engine";
import type {
  ChatMessage,
  Lang,
  NativeHealth,
  NativePorts,
  RawDetection,
} from "./core/types";

type Ort = typeof import("onnxruntime-web");
type Session = Awaited<ReturnType<Ort["InferenceSession"]["create"]>>;

interface Loaded {
  ort: Ort;
  session: Session;
  labels: string[];
  side: number;
  model: string;
}

const BASE = "/__dev";
const LANG_TAG: Record<Lang, string> = {
  en: "en-IN",
  hi: "hi-IN",
  mr: "mr-IN",
  te: "te-IN",
};

function modelPath(): string {
  const wanted = new URLSearchParams(window.location.search).get("model");
  return wanted && /^[\w-]+$/.test(wanted) ? `${wanted}/` : "";
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function softmax(x: Float32Array): Float32Array {
  let max = -Infinity;
  for (const v of x) max = Math.max(max, v);
  const e = Float32Array.from(x, (v) => Math.exp(v - max));
  let sum = 0;
  for (const v of e) sum += v;
  return e.map((v) => v / sum);
}

let loading: Promise<Loaded[]> | null = null;

async function loadOne(ort: Ort, folder: string): Promise<Loaded> {
  const dir = `${BASE}/models/${folder}`;
  const labelsRes = await fetch(`${dir}labels.json`);
  if (!labelsRes.ok) throw new Error(`labels.json not found at ${dir}`);
  const labels = (await labelsRes.json()) as string[];
  const session = await ort.InferenceSession.create(`${dir}vision.onnx`, {
    executionProviders: ["wasm"],
  });
  const meta = session.inputMetadata[0];
  const shape = meta && meta.isTensor ? meta.shape : [];
  const dim = shape[2];
  const side = typeof dim === "number" && dim > 0 ? dim : 224;
  return { ort, session, labels, side, model: `${folder}vision.onnx` };
}

async function folders(): Promise<string[]> {
  const wanted = modelPath();
  if (wanted) return [wanted];
  const res = await fetch(`${BASE}/models.json`);
  const names = res.ok ? ((await res.json()) as string[]) : [];
  if (names.length > 0) return names.map((n) => `${n}/`);
  const rootModel = await fetch(`${BASE}/models/vision.onnx`, {
    method: "HEAD",
  });
  return rootModel.ok ? [""] : [];
}

async function load(): Promise<Loaded[]> {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = `${BASE}/ort/`;
  ort.env.wasm.numThreads = 1;
  const dirs = await folders();
  if (dirs.length === 0)
    throw new Error(
      "no model found: put vision.onnx and labels.json in models/<name>/",
    );
  return Promise.all(dirs.map((d) => loadOne(ort, d)));
}

function loaded(): Promise<Loaded[]> {
  if (loading === null) {
    loading = load().catch((err: unknown) => {
      console.error("vision model failed to load", err);
      loading = null;
      throw err;
    });
  }
  return loading;
}

async function classify(
  m: Loaded,
  b64: string,
): Promise<{ label: string; id: number; score: number; top: string[] }> {
  const input = await toTensor(b64, m.side);
  const name = m.session.inputNames[0];
  if (name === undefined) throw new Error("model has no input");
  const tensor = new m.ort.Tensor("float32", input, [1, 3, m.side, m.side]);
  const result = await m.session.run({ [name]: tensor });
  const first = result[m.session.outputNames[0] ?? ""];
  if (!first) throw new Error("model returned no output");
  let scores = Float32Array.from(first.data as Float32Array);
  if (scores.length !== m.labels.length)
    throw new Error(
      `${m.model} has ${scores.length} outputs but labels.json has ${m.labels.length}`,
    );
  const sum = scores.reduce((a, b) => a + b, 0);
  if (Math.min(...scores) < 0 || Math.abs(sum - 1) > 1e-2)
    scores = softmax(scores);
  const ranked = Array.from(scores, (s, i) => ({ s, i })).sort(
    (a, b) => b.s - a.s,
  );
  const best = ranked[0];
  if (!best) throw new Error("empty output");
  return {
    label: m.labels[best.i] ?? "unsupported",
    id: best.i,
    score: best.s,
    top: ranked
      .slice(0, 3)
      .map((r) => `${(r.s * 100).toFixed(1)}% ${m.labels[r.i] ?? ""}`),
  };
}

async function toTensor(b64: string, side: number): Promise<Float32Array> {
  const blob = new Blob([fromBase64(b64)]);
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, side, side);
  const { data } = ctx.getImageData(0, 0, side, side);
  const plane = side * side;
  const out = new Float32Array(plane * 3);
  for (let i = 0; i < plane; i++) {
    out[i] = (data[i * 4] ?? 0) / 255;
    out[plane + i] = (data[i * 4 + 1] ?? 0) / 255;
    out[2 * plane + i] = (data[i * 4 + 2] ?? 0) / 255;
  }
  return out;
}

async function plantRatio(b64: string): Promise<number> {
  const side = 64;
  const bitmap = await createImageBitmap(new Blob([fromBase64(b64)]));
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  if (!ctx) return 1;
  ctx.drawImage(bitmap, 0, 0, side, side);
  const { data } = ctx.getImageData(0, 0, side, side);
  let hits = 0;
  for (let i = 0; i < side * side; i++)
    if (
      isPlantPixel(data[i * 4] ?? 0, data[i * 4 + 1] ?? 0, data[i * 4 + 2] ?? 0)
    )
      hits += 1;
  return hits / (side * side);
}

export const webPorts: NativePorts = {
  async detect(imageBase64): Promise<RawDetection | null> {
    const models = await loaded();
    const classifiers = models.filter((m) => m.model !== "router/vision.onnx");
    if (classifiers.length === 0) return null;
    const results = await Promise.all(
      classifiers.map(async (m) => ({
        m,
        r: await classify(m, imageBase64),
      })),
    );
    const plant = await plantRatio(imageBase64);
    for (const { m, r } of results) console.info("vision", m.model, r.top);
    const ranked = [...results].sort((a, b) => b.r.score - a.r.score);
    const win = ranked[0];
    if (!win) return null;
    return {
      class_id: win.r.id,
      label: win.r.label,
      confidence: win.r.score,
      model: win.m.model,
      bbox: [0, 0, 1, 1],
      mask_polygon: [],
      plant_ratio: plant,
      alternatives: ranked.slice(1).map(({ m, r }) => ({
        class_id: r.id,
        label: r.label,
        confidence: r.score,
        model: m.model,
      })),
    };
  },
  generate(_messages: ChatMessage[], _maxTokens: number): Promise<string> {
    return Promise.reject(new Error("llm_unavailable"));
  },
  speak(text, lang) {
    if (typeof speechSynthesis === "undefined") return Promise.resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG_TAG[lang];
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return Promise.resolve();
  },
  async readAsset(name) {
    const res = await fetch(`${BASE}/${name}`);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  },
  health(): Promise<NativeHealth> {
    return Promise.resolve({
      platform: "browser-dev",
      vision_adapter: "onnxruntime-web",
      llm_adapter: "none",
      audio_adapter: "speechSynthesis",
      vision_model: "all models in models/",
      llm_model: "none",
      peak_rss_kb: null,
      temp_c: null,
    });
  },
};

export class WebEngineClient extends LocalEngineClient {
  constructor() {
    super(webPorts, openDevSql);
  }
}
