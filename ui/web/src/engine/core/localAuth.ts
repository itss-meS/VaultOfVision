import type { Role } from "./types";

const ITERATIONS = 210000;
const MAX_FAILS = 5;
const LOCK_MS = 30000;

export interface StoredProfile {
  id: string;
  role: Role;
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
  pin: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
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

export async function makeProfile(
  id: string,
  pin: string,
  role: Role,
  iterations = ITERATIONS,
): Promise<StoredProfile> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return {
    id,
    role,
    salt: toHex(salt),
    hash: await derive(pin, salt, iterations),
    iterations,
  };
}

export async function checkPin(
  profile: StoredProfile,
  pin: string,
): Promise<boolean> {
  const hash = await derive(pin, fromHex(profile.salt), profile.iterations);
  return constantTimeEqual(hash, profile.hash);
}

export function validPin(pin: string): boolean {
  return /^[0-9]{4,12}$/.test(pin);
}

export function validProfileId(id: string): boolean {
  return /^[A-Za-z0-9_-]{2,32}$/.test(id);
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
