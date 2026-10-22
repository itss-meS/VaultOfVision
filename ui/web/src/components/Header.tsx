import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Lang } from "../contracts/types";
import { LANGUAGES } from "../i18n";
import type { ThemeChoice } from "../lib/prefs";
import {
  CheckIcon,
  ChevronDownIcon,
  InfoIcon,
  MoonIcon,
  SproutIcon,
  SunIcon,
  TranslateIcon,
} from "./Icons";

interface Props {
  lang: Lang;
  theme: ThemeChoice;
  onLang: (lang: Lang) => void;
  onTheme: () => void;
  onAbout: () => void;
}

export function Brand() {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
        <SproutIcon className="h-6 w-6" />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[13px] font-semibold text-fg">
          {t("app.name1")}
        </span>
        <span className="text-[17px] font-bold text-fg">
          {t("app.name2").replace(" AI", "")}{" "}
          <span className="text-mint">AI</span>
        </span>
      </span>
    </div>
  );
}

export function Header({ lang, theme, onLang, onTheme, onAbout }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return undefined;
    function outside(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node))
        setOpen(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-line bg-panel/95 px-4 py-3 backdrop-blur">
      <Brand />
      <div className="flex items-center gap-2">
        <div className="relative" ref={box}>
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={t("header.language")}
            onClick={() => setOpen((v) => !v)}
            className={`flex h-11 items-center gap-1.5 rounded-2xl border px-3 text-sm font-semibold transition ${
              open
                ? "border-brand bg-brand text-white"
                : "border-line bg-panel text-fg hover:bg-raised"
            }`}
          >
            <TranslateIcon className="h-4 w-4" />
            <span>{current?.native}</span>
            <ChevronDownIcon
              className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`}
            />
          </button>
          {open ? (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+8px)] z-40 w-64 rounded-3xl border border-line bg-panel p-2 shadow-lift"
            >
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {t("header.language")}
              </p>
              {LANGUAGES.map((l) => {
                const active = l.code === lang;
                return (
                  <button
                    key={l.code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      onLang(l.code);
                      setOpen(false);
                    }}
                    className={`flex min-h-[48px] w-full items-center justify-between rounded-2xl px-3 text-left text-base transition ${
                      active ? "bg-brand text-white" : "text-fg hover:bg-raised"
                    }`}
                  >
                    <span className="font-semibold">
                      {l.native}{" "}
                      <span className={active ? "text-white/80" : "text-muted"}>
                        ({l.english})
                      </span>
                    </span>
                    {active ? <CheckIcon className="h-5 w-5" /> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          aria-label={t("header.theme")}
          onClick={onTheme}
          className="icon-btn"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          type="button"
          aria-label={t("header.about")}
          onClick={onAbout}
          className="icon-btn"
        >
          <InfoIcon />
        </button>
      </div>
    </header>
  );
}
