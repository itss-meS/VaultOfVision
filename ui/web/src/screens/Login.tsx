import { type FormEvent, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  PhoneIcon,
  PinIcon,
  SproutIcon,
  UserIcon,
  ChevronDownIcon,
} from "../components/Icons";
import { ErrorBanner } from "../components/Page";
import {
  type EngineClient,
  EngineError,
  type Lang,
  type UserProfile,
} from "../contracts/types";

interface Props {
  engine: EngineClient;
  lang: Lang;
  onUser: (user: UserProfile) => void;
}

type Mode = "login" | "create";

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="label">
      {label}
      <span className="field-wrap">
        <span className="text-muted">{icon}</span>
        {children}
      </span>
    </label>
  );
}

export function Login({ engine, lang, onUser }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [village, setVillage] = useState("");
  const [more, setMore] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const creating = mode === "create";

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirm("");
  }

  function check(): string | null {
    if (creating && (name.trim().length < 2 || name.trim().length > 60))
      return t("auth.errors.name");
    if (!/^[6-9][0-9]{9}$/.test(mobile)) return t("auth.errors.mobile");
    if (password.length < 6 || password.length > 64)
      return t("auth.errors.password");
    if (creating && password !== confirm) return t("auth.errors.mismatch");
    return null;
  }

  function describe(err: unknown): string {
    const code = err instanceof EngineError ? err.code : "unknown";
    if (code === "auth") return t("auth.errors.wrong");
    if (code === "exists") return t("auth.errors.exists");
    if (code === "rate") return t("auth.errors.locked");
    return t(`errors.${code}`);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = check();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = creating
        ? await engine.signUp({ name, mobile, password, village, lang })
        : await engine.login(mobile, password);
      onUser(user);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  }

  const tabClass = (active: boolean) =>
    `flex min-h-[48px] flex-1 items-center justify-center rounded-2xl text-base font-semibold transition ${
      active ? "bg-brand text-white shadow-card" : "text-muted hover:text-fg"
    }`;

  return (
    <div className="flex flex-col gap-6 px-4 pb-10 pt-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-brand text-white shadow-lift">
          <SproutIcon className="h-9 w-9" />
        </span>
        <h1 className="text-2xl font-bold text-fg">{t("auth.welcome")}</h1>
        <p className="max-w-[320px] text-base text-muted">
          {creating ? t("auth.subtitleCreate") : t("auth.subtitleLogin")}
        </p>
      </div>

      <div role="tablist" className="flex gap-1 rounded-3xl bg-raised p-1.5">
        <button
          type="button"
          role="tab"
          aria-selected={!creating}
          className={tabClass(!creating)}
          onClick={() => switchMode("login")}
        >
          {t("auth.tabLogin")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={creating}
          className={tabClass(creating)}
          onClick={() => switchMode("create")}
        >
          {t("auth.tabCreate")}
        </button>
      </div>

      <form
        onSubmit={(e) => void submit(e)}
        noValidate
        className="flex flex-col gap-4"
      >
        {creating ? (
          <Field label={t("auth.name")} icon={<UserIcon className="h-5 w-5" />}>
            <input
              className="field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("auth.namePlaceholder")}
              autoComplete="name"
              maxLength={60}
            />
          </Field>
        ) : null}
        <Field
          label={t("auth.mobile")}
          icon={<PhoneIcon className="h-5 w-5" />}
        >
          <span className="text-base font-semibold text-fg">+91</span>
          <input
            className="field-input"
            type="tel"
            inputMode="numeric"
            value={mobile}
            onChange={(e) =>
              setMobile(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))
            }
            placeholder={t("auth.mobilePlaceholder")}
            autoComplete="tel-national"
          />
        </Field>
        <Field
          label={t("auth.password")}
          icon={<LockIcon className="h-5 w-5" />}
        >
          <input
            className="field-input"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              creating ? t("auth.passwordNew") : t("auth.passwordPlaceholder")
            }
            autoComplete={creating ? "new-password" : "current-password"}
            maxLength={64}
          />
          <button
            type="button"
            aria-label={show ? t("auth.hide") : t("auth.show")}
            onClick={() => setShow((v) => !v)}
            className="text-muted hover:text-fg"
          >
            {show ? (
              <EyeOffIcon className="h-5 w-5" />
            ) : (
              <EyeIcon className="h-5 w-5" />
            )}
          </button>
        </Field>
        {creating ? (
          <>
            <Field
              label={t("auth.confirm")}
              icon={<LockIcon className="h-5 w-5" />}
            >
              <input
                className="field-input"
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t("auth.confirmPlaceholder")}
                autoComplete="new-password"
                maxLength={64}
              />
            </Field>
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore((v) => !v)}
              className="field-wrap justify-between text-base font-semibold"
            >
              <span className="flex items-center gap-3">
                <PinIcon className="h-5 w-5 text-mint" />
                {t("auth.optional")}
              </span>
              <ChevronDownIcon
                className={`h-5 w-5 transition ${more ? "rotate-180" : ""}`}
              />
            </button>
            {more ? (
              <Field
                label={t("auth.village")}
                icon={<PinIcon className="h-5 w-5" />}
              >
                <input
                  className="field-input"
                  value={village}
                  onChange={(e) => setVillage(e.target.value)}
                  placeholder={t("auth.villagePlaceholder")}
                  maxLength={60}
                />
              </Field>
            ) : null}
          </>
        ) : null}
        <ErrorBanner message={error} />
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy
            ? t("common.loading")
            : creating
              ? t("auth.submitCreate")
              : t("auth.submitLogin")}
        </button>
      </form>

      <p className="text-center text-base text-muted">
        {creating ? t("auth.toLogin") : t("auth.toCreate")}{" "}
        <button
          type="button"
          onClick={() => switchMode(creating ? "login" : "create")}
          className="font-semibold text-mint"
        >
          {creating ? t("auth.toLoginLink") : t("auth.toCreateLink")}
        </button>
      </p>
      <p className="text-center text-sm text-muted">{t("auth.privacy")}</p>
    </div>
  );
}
