import {
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");

const TYPES: Record<string, string> = {
  ".onnx": "application/octet-stream",
  ".json": "application/json",
  ".jsonl": "text/plain",
  ".pub": "text/plain",
  ".sig": "text/plain",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
};

function inside(base: string, rel: string): string | null {
  const full = normalize(join(base, rel));
  return full.startsWith(base + sep) &&
    existsSync(full) &&
    statSync(full).isFile()
    ? full
    : null;
}

function locate(path: string): string | null {
  if (path.startsWith("/ort/"))
    return inside(
      resolve(here, "node_modules", "onnxruntime-web", "dist"),
      path.slice(5),
    );
  if (path.startsWith("/models/"))
    return inside(resolve(repo, "models"), path.slice(8));
  if (path.startsWith("/knowledge/")) {
    const name = path.slice(11);
    return (
      inside(resolve(repo, ".dev", "knowledge"), name) ??
      inside(resolve(repo, "knowledge"), name)
    );
  }
  return null;
}

const kvFile = resolve(repo, ".dev", "data", "kv.json");

function readKv(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(kvFile, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function handleKv(
  method: string,
  key: string,
  req: NodeJS.ReadableStream,
  res: { statusCode: number; end: (body?: string) => void },
): void {
  if (!/^[\w.:-]{1,64}$/.test(key)) {
    res.statusCode = 400;
    res.end();
    return;
  }
  const store = readKv();
  if (method === "GET") {
    const value = store[key];
    res.statusCode = value === undefined ? 204 : 200;
    res.end(value);
    return;
  }
  const chunks: Buffer[] = [];
  req.on("data", (c: Buffer) => chunks.push(c));
  req.on("end", () => {
    store[key] = Buffer.concat(chunks).toString("utf-8");
    mkdirSync(dirname(kvFile), { recursive: true });
    writeFileSync(kvFile, JSON.stringify(store, null, 2));
    res.statusCode = 204;
    res.end();
  });
}

function modelFolders(): string[] {
  const base = resolve(repo, "models");
  if (!existsSync(base)) return [];
  return readdirSync(base, { withFileTypes: true })
    .filter(
      (d) =>
        d.isDirectory() &&
        inside(join(base, d.name), "vision.onnx") !== null &&
        inside(join(base, d.name), "labels.json") !== null,
    )
    .map((d) => d.name);
}

export function devAssets(): Plugin {
  return {
    name: "dev-assets",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__dev", (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname === "/models.json") {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(modelFolders()));
          return;
        }
        if (url.pathname.startsWith("/kv/")) {
          handleKv(
            req.method === "PUT" ? "PUT" : "GET",
            decodeURIComponent(url.pathname.slice(4)),
            req,
            res,
          );
          return;
        }
        const file = locate(decodeURIComponent(url.pathname));
        if (file === null) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader(
          "Content-Type",
          TYPES[extname(file)] ?? "application/octet-stream",
        );
        res.setHeader("Cache-Control", "no-store");
        createReadStream(file).on("error", next).pipe(res);
      });
    },
  };
}