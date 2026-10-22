const ITERATIONS = 210000;
const MAX_FAILS = 5;
const LOCK_MS = 30000;

export interface Credential {
  salt: string;
  hash: string;
  iterations: number;
}

const enc = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function derive(
  secret: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function makeCredential(
  password: string,
  iterations = ITERATIONS,
): Promise<Credential> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    salt: toHex(salt),
    hash: await derive(password, salt, iterations),
    iterations,
  };
}

export async function checkCredential(
  credential: Credential,
  password: string,
): Promise<boolean> {
  const hash = await derive(
    password,
    fromHex(credential.salt),
    credential.iterations,
  );
  return constantTimeEqual(hash, credential.hash);
}

export function validName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 60;
}

export function normalizeMobile(mobile: string): string {
  const digits = mobile.replace(/[\s-]/g, "");
  return digits.replace(/^(\+91|91|0)(?=[6-9][0-9]{9}$)/, "");
}

export function validMobile(mobile: string): boolean {
  return /^[6-9][0-9]{9}$/.test(mobile);
}

export function validPassword(password: string): boolean {
  return password.length >= 6 && password.length <= 64;
}

export class Throttle {
  private fails = 0;
  private lockedUntil = 0;

  constructor(private readonly now: () => number = () => Date.now()) {}

  locked(): boolean {
    return this.now() < this.lockedUntil;
  }

  failed(): void {
    this.fails += 1;
    if (this.fails >= MAX_FAILS) {
      this.lockedUntil = this.now() + LOCK_MS;
      this.fails = 0;
    }
  }

  ok(): void {
    this.fails = 0;
  }
}

export const LOCK = { maxFails: MAX_FAILS, lockMs: LOCK_MS };
