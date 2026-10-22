import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DeviceHealth, EngineClient } from "../contracts/types";
import { Brand } from "./Header";

interface Props {
  engine: EngineClient;
  onClose: () => void;
}

const VERSION = "0.1.0";

export function AboutSheet({ engine, onClose }: Props) {
  const { t } = useTranslation();
  const [health, setHealth] = useState<DeviceHealth | null>(null);

  useEffect(() => {
    let live = true;
    engine
      .health()
      .then((h) => {
        if (live) setHealth(h);
      })
      .catch(() => {
        if (live) setHealth(null);
      });
    return () => {
      live = false;
    };
  }, [engine]);

  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [onClose]);

  const rows: Array<[string, string]> = [
    [t("about.version"), VERSION],
    [t("about.platform"), health?.platform ?? t("about.none")],
    [t("about.vision"), health?.models.vision ?? t("about.none")],
    [t("about.llm"), health?.models.llm ?? t("about.none")],
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("about.title")}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] rounded-t-[32px] bg-panel p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-lift"
      >
        <Brand />
        <p className="mt-4 text-base text-muted">{t("about.text")}</p>
        <dl className="mt-4 flex flex-col divide-y divide-line rounded-2xl border border-line">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="mono truncate text-fg">{v}</dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          autoFocus
          className="btn-primary mt-5"
          onClick={onClose}
        >
          {t("about.close")}
        </button>
      </div>
    </div>
  );
}
