import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorBanner, Shell } from "../components/Shell";
import {
  type EngineClient,
  EngineError,
  type SessionInfo,
} from "../contracts/types";

interface Props {
  engine: EngineClient;
  onSession: (s: SessionInfo) => void;
}

export function Login({ engine, onSession }: Props) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onSession(
        await engine.login(profile.trim(), pin, code.trim() || undefined),
      );
    } catch (err) {
      const code = err instanceof EngineError ? err.code : "unknown";
      setError(code === "auth" ? t("login.failed") : t(`errors.${code}`));
    } finally {
      setPin("");
      setCode("");
      setBusy(false);
    }
  }

  return (
    <Shell title={t("login.title")}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="label">
          {t("login.profile")}
          <input
            className="field"
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            required
          />
        </label>
        <label className="label">
          {t("login.pin")}
          <input
            className="field"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            autoComplete="off"
            required
          />
        </label>
        <label className="label">
          {t("login.totp")}
          <input
            className="field mono"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
          />
        </label>
        <ErrorBanner message={error} />
        <button type="submit" className="btn-primary" disabled={busy}>
          {t("login.submit")}
        </button>
      </form>
    </Shell>
  );
}
