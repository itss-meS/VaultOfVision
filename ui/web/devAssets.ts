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
  if (path.startsWith("/sql/"))
    return inside(
      resolve(here, "node_modules", "sql.js", "dist"),
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

const dbFile = resolve(repo, ".dev", "data", "agriedge.sqlite");
const MAX_DB_BYTES = 64 * 1024 * 1024;

function handleDb(
  method: string,
  req: NodeJS.ReadableStream,
  res: {
    statusCode: number;
    setHeader: (k: string, v: string) => void;
    end: (body?: Buffer) => void;
  },
): void {
  if (method === "GET") {
    if (!existsSync(dbFile)) {
      res.statusCode = 204;
      res.end();
      return;
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(readFileSync(dbFile));
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let tooBig = false;
  req.on("data", (c: Buffer) => {
    size += c.length;
    if (size > MAX_DB_BYTES) tooBig = true;
    else chunks.push(c);
  });
  req.on("end", () => {
    if (tooBig) {
      res.statusCode = 413;
      res.end();
      return;
    }
    mkdirSync(dirname(dbFile), { recursive: true });
    writeFileSync(dbFile, Buffer.concat(chunks));
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
        if (url.pathname === "/db") {
          handleDb(req.method === "PUT" ? "PUT" : "GET", req, res);
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
