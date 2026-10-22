import {
  EngineError,
  type Lang,
  type ProfilePatch,
  type SignUpInput,
  type UserProfile,
} from "../../contracts/types";
import type { Sql } from "../../db/sql";
import {
  checkCredential,
  type Credential,
  LOCK,
  makeCredential,
  normalizeMobile,
  validMobile,
  validName,
  validPassword,
} from "./localAuth";

export const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const LANGS: readonly Lang[] = ["en", "hi", "mr", "te"];

interface UserRow {
  id: string;
  name: string;
  mobile: string;
  salt: string;
  hash: string;
  iterations: number;
  village: string;
  area_ha: number | null;
  lang: string;
  failed: number;
  locked_until: number;
}

function asLang(value: string): Lang {
  return LANGS.find((l) => l === value) ?? "en";
}

function toProfile(row: UserRow): UserProfile {
  return {
    id: row.id,
    name: row.name,
    mobile: row.mobile,
    village: row.village,
    areaHa: row.area_ha,
    lang: asLang(row.lang),
  };
}

function invalid(message: string): EngineError {
  return new EngineError("invalid", message);
}

export class Accounts {
  private dummy: Promise<Credential> | null = null;

  constructor(
    private readonly sql: Sql,
    private readonly iterations: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  private async row(where: string, value: string): Promise<UserRow | null> {
    const rows = await this.sql.all<UserRow>(
      `SELECT id, name, mobile, salt, hash, iterations, village, area_ha, lang, failed, locked_until FROM users WHERE ${where} = ?`,
      [value],
    );
    return rows[0] ?? null;
  }

  private async begin(userId: string): Promise<void> {
    await this.sql.run(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('session', ?)",
      [JSON.stringify({ u: userId, exp: this.now() + SESSION_MS })],
    );
  }

  async signUp(input: SignUpInput): Promise<UserProfile> {
    const name = input.name.trim();
    const mobile = normalizeMobile(input.mobile);
    const village = (input.village ?? "").trim();
    if (!validName(name)) throw invalid("name");
    if (!validMobile(mobile)) throw invalid("mobile");
    if (!validPassword(input.password)) throw invalid("password");
    if (village.length > 60) throw invalid("village");
    if (await this.row("mobile", mobile))
      throw new EngineError("exists", "mobile already registered");
    const credential = await makeCredential(input.password, this.iterations);
    const id = crypto.randomUUID();
    const lang = input.lang ?? "en";
    await this.sql.run(
      "INSERT INTO users (id, name, mobile, salt, hash, iterations, village, lang, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        id,
        name,
        mobile,
        credential.salt,
        credential.hash,
        credential.iterations,
        village,
        lang,
        this.now(),
      ],
    );
    await this.begin(id);
    const created = await this.row("id", id);
    if (!created) throw new EngineError("unknown", "account not saved");
    return toProfile(created);
  }

  private fakeCredential(): Promise<Credential> {
    if (this.dummy === null) this.dummy = makeCredential("x", this.iterations);
    return this.dummy;
  }

  async login(rawMobile: string, password: string): Promise<UserProfile> {
    const mobile = normalizeMobile(rawMobile);
    const user = validMobile(mobile) ? await this.row("mobile", mobile) : null;
    if (user === null) {
      await checkCredential(await this.fakeCredential(), password);
      throw new EngineError("auth", "invalid credentials");
    }
    if (user.locked_until > this.now())
      throw new EngineError("rate", "too many attempts");
    const ok = await checkCredential(user, password);
    if (!ok) {
      const failed = user.failed + 1;
      const locked = failed >= LOCK.maxFails;
      await this.sql.run(
        "UPDATE users SET failed = ?, locked_until = ? WHERE id = ?",
        [locked ? 0 : failed, locked ? this.now() + LOCK.lockMs : 0, user.id],
      );
      throw new EngineError("auth", "invalid credentials");
    }
    await this.sql.run(
      "UPDATE users SET failed = 0, locked_until = 0 WHERE id = ?",
      [user.id],
    );
    await this.begin(user.id);
    return toProfile(user);
  }

  async restore(): Promise<UserProfile | null> {
    const rows = await this.sql.all<{ value: string }>(
      "SELECT value FROM meta WHERE key = 'session'",
    );
    const raw = rows[0]?.value;
    if (!raw) return null;
    let session: { u?: unknown; exp?: unknown };
    try {
      session = JSON.parse(raw) as { u?: unknown; exp?: unknown };
    } catch {
      return null;
    }
    if (typeof session.u !== "string" || typeof session.exp !== "number")
      return null;
    if (session.exp <= this.now()) {
      await this.end();
      return null;
    }
    const user = await this.row("id", session.u);
    return user ? toProfile(user) : null;
  }

  async end(): Promise<void> {
    await this.sql.run("DELETE FROM meta WHERE key = 'session'");
  }

  async update(userId: string, patch: ProfilePatch): Promise<UserProfile> {
    const current = await this.row("id", userId);
    if (!current) throw new EngineError("auth", "no such user");
    const name = patch.name === undefined ? current.name : patch.name.trim();
    const village =
      patch.village === undefined ? current.village : patch.village.trim();
    const area = patch.areaHa === undefined ? current.area_ha : patch.areaHa;
    const lang = patch.lang === undefined ? asLang(current.lang) : patch.lang;
    if (!validName(name)) throw invalid("name");
    if (village.length > 60) throw invalid("village");
    if (area !== null && !(area > 0 && area <= 1000)) throw invalid("area");
    if (!LANGS.includes(lang)) throw invalid("language");
    await this.sql.run(
      "UPDATE users SET name = ?, village = ?, area_ha = ?, lang = ? WHERE id = ?",
      [name, village, area, lang, userId],
    );
    const next = await this.row("id", userId);
    if (!next) throw new EngineError("unknown", "profile not saved");
    return toProfile(next);
  }

  async remove(userId: string, password: string): Promise<void> {
    const user = await this.row("id", userId);
    if (!user || !(await checkCredential(user, password)))
      throw new EngineError("auth", "invalid credentials");
    await this.sql.run("DELETE FROM scans WHERE user_id = ?", [userId]);
    await this.sql.run("DELETE FROM users WHERE id = ?", [userId]);
    await this.end();
  }
}
