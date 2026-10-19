import { ed25519 } from "@noble/curves/ed25519.js";

export class SignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureError";
  }
}

const SPKI_PREFIX = "302a300506032b6570032100";

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean))
    throw new SignatureError("bad hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function publicKeyFromPem(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  let bin: string;
  try {
    bin = atob(body);
  } catch {
    throw new SignatureError("bad trust key");
  }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  if (bytes.length !== 44 || !hex.startsWith(SPKI_PREFIX))
    throw new SignatureError("trust key is not Ed25519");
  return bytes.slice(12);
}

export function verifySignature(
  publicKey: Uint8Array,
  payload: Uint8Array,
  signature: Uint8Array,
): void {
  let ok = false;
  try {
    ok = ed25519.verify(signature, payload, publicKey);
  } catch {
    ok = false;
  }
  if (!ok) throw new SignatureError("bad signature");
}

export function loadSignedJson(
  payload: Uint8Array,
  sigHex: string,
  publicKey: Uint8Array,
): Record<string, unknown> {
  verifySignature(publicKey, payload, hexToBytes(sigHex));
  const data = JSON.parse(new TextDecoder().decode(payload)) as unknown;
  if (typeof data !== "object" || data === null || Array.isArray(data))
    throw new SignatureError("signed document must be an object");
  return data as Record<string, unknown>;
}
