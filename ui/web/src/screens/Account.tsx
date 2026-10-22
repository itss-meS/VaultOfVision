import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LeafIcon,
  LockIcon,
  PinIcon,
  ShieldIcon,
  UserIcon,
} from "../components/Icons";
import { ErrorBanner } from "../components/Page";
import {
  EngineError,
  type ProfilePatch,
  type UserProfile,
} from "../contracts/types";

interface Props {
  user: UserProfile;
  onSave: (patch: ProfilePatch) => Promise<void>;
  onLogout: () => void;
  onDelete: (password: string) => Promise<void>;
}

export function Account({ user, onSave, onLogout, onDelete }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(user.name);
  const [village, setVillage] = useState(user.village);
  const [area, setArea] = useState(
    user.areaHa === null ? "" : String(user.areaHa),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  function describe(err: unknown): string {
    const code = err instanceof EngineError ? err.code : "unknown";
    if (code === "auth") return t("auth.errors.wrong");
    return t(`errors.${code}`);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const trimmed = area.trim();
    const parsed = trimmed === "" ? null : Number.parseFloat(trimmed);
    if (
      parsed !== null &&
      !(Number.isFinite(parsed) && parsed > 0 && parsed <= 1000)
    ) {
      setError(t("account.invalidArea"));
      return;
    }
    setBusy(true);
    try {
      await onSave({ name, village, areaHa: parsed });
      setMessage(t("account.saved"));
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await onDelete(password);
    } catch (err) {
      setError(describe(err));
      setBusy(false);
    }
  }

  return (
    <div className="pb-32">
      <section className="flex flex-col items-center gap-3 bg-brand px-4 pb-14 pt-8 text-center">
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white text-brand">
          <LeafIcon className="h-12 w-12" />
        </span>
        <h1 className="text-2xl font-bold text-white">{user.name}</h1>
        <p className="mono text-base text-white/80">{user.mobile}</p>
      </section>

      <div className="-mt-8 flex flex-col gap-4 px-4">
        <form
          onSubmit={(e) => void save(e)}
          noValidate
          className="card flex flex-col gap-4 rounded-[28px] p-5 shadow-lift"
        >
          <label className="label">
            {t("account.name")}
            <span className="field-wrap">
              <UserIcon className="h-5 w-5 text-muted" />
              <input
                className="field-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
              />
            </span>
          </label>
          <label className="label">
            {t("account.village")}
            <span className="field-wrap">
              <PinIcon className="h-5 w-5 text-mint" />
              <input
                className="field-input"
                value={village}
                onChange={(e) => setVillage(e.target.value)}
                placeholder={t("account.villagePlaceholder")}
                maxLength={60}
              />
            </span>
          </label>
          <label className="label">
            {t("account.area")}
            <span className="field-wrap">
              <LeafIcon className="h-5 w-5 text-mint" />
              <input
                className="field-input"
                inputMode="decimal"
                value={area}
                onChange={(e) => setArea(e.target.value)}
                placeholder={t("account.areaPlaceholder")}
                maxLength={8}
              />
            </span>
          </label>
          <ErrorBanner message={error} />
          {message ? (
            <p className="text-sm font-semibold text-ok">{message}</p>
          ) : null}
          <button type="submit" className="btn-primary" disabled={busy}>
            {t("account.save")}
          </button>
        </form>

        <div className="flex items-start gap-3 rounded-3xl bg-brand p-4 text-white">
          <ShieldIcon className="mt-0.5 h-6 w-6 shrink-0" />
          <p className="text-base">{t("account.privacyNote")}</p>
        </div>

        <button type="button" className="btn-secondary" onClick={onLogout}>
          {t("account.logout")}
        </button>

        {removing ? (
          <form
            onSubmit={(e) => void remove(e)}
            className="card flex flex-col gap-3"
          >
            <p className="text-sm text-muted">{t("account.deleteHelp")}</p>
            <span className="field-wrap">
              <LockIcon className="h-5 w-5 text-muted" />
              <input
                className="field-input"
                type="password"
                aria-label={t("account.password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                maxLength={64}
              />
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRemoving(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="btn-danger"
                disabled={busy || password.length === 0}
              >
                {t("account.deleteConfirm")}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            className="btn-danger"
            onClick={() => setRemoving(true)}
          >
            {t("account.delete")}
          </button>
        )}
      </div>
    </div>
  );
}
