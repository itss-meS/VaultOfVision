import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Shell } from "../components/Shell";
import type { Lang } from "../contracts/types";
import i18n, { LANGUAGES } from "../i18n";
import {
  type ThemeChoice,
  applyTheme,
  loadTheme,
  saveLang,
  saveTheme,
} from "../lib/prefs";

const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

export interface Profile {
  lang: Lang;
  region: string;
  areaHa: number | undefined;
}

interface Props {
  initial: Profile;
  onDone: (p: Profile) => void;
  onDevice?: (() => void) | undefined;
}

export function Setup({ initial, onDone, onDevice }: Props) {
  const { t } = useTranslation();
  const [lang, setLang] = useState<Lang>(initial.lang);
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme());
  const [region, setRegion] = useState(initial.region);
  const [area, setArea] = useState(
    initial.areaHa === undefined ? "" : String(initial.areaHa),
  );

  function choose(next: Lang) {
    setLang(next);
    saveLang(next);
    void i18n.changeLanguage(next);
  }

  function chooseTheme(next: ThemeChoice) {
    setTheme(next);
    saveTheme(next);
    applyTheme(next);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = Number.parseFloat(area);
    onDone({
      lang,
      region: region.trim(),
      areaHa: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
    });
  }

  return (
    <Shell
      title={t("setup.title")}
      action={
        onDevice ? { label: t("device.open"), onClick: onDevice } : undefined
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-5">
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="label mb-2">{t("setup.language")}</legend>
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              type="button"
              aria-pressed={lang === l.code}
              onClick={() => choose(l.code)}
              className={lang === l.code ? "btn-primary" : "btn-secondary"}
            >
              {l.native}
            </button>
          ))}
        </fieldset>
        <fieldset className="grid grid-cols-3 gap-2">
          <legend className="label mb-2">{t("setup.theme")}</legend>
          {THEME_CHOICES.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={theme === c}
              onClick={() => chooseTheme(c)}
              className={theme === c ? "btn-primary" : "btn-secondary"}
            >
              {t(`theme.${c}`)}
            </button>
          ))}
        </fieldset>
        <div className="card flex items-center justify-between text-base font-medium">
          <span>{t("setup.crop")}</span>
          <span className="mono text-accent">{t("setup.cropValue")}</span>
        </div>
        <label className="label">
          {t("setup.region")}
          <input
            className="field"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            maxLength={60}
          />
        </label>
        <label className="label">
          {t("setup.area")}
          <input
            className="field"
            inputMode="decimal"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            maxLength={8}
          />
        </label>
        <p className="text-sm text-muted">{t("setup.consent")}</p>
        <button type="submit" className="btn-primary">
          {t("common.continue")}
        </button>
      </form>
    </Shell>
  );
}
