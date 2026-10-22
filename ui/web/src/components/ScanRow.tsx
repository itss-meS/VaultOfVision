import { useTranslation } from "react-i18next";
import type { ScanRecord } from "../contracts/types";
import { LANGUAGES } from "../i18n";
import { formatDate } from "../lib/label";
import { useLabel } from "../lib/useLabel";
import { ChevronRightIcon, LeafIcon, TrashIcon } from "./Icons";

interface Props {
  scan: ScanRecord;
  detailed?: boolean;
  onOpen: () => void;
  onDelete?: () => void;
}

export function ScanRow({ scan, detailed = false, onOpen, onDelete }: Props) {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const shown = label(scan.label, scan.kind);
  const locale =
    LANGUAGES.find((l) => l.code === i18n.language)?.locale ?? "en-IN";
  const percent = Math.round(scan.confidence * 100);
  return (
    <div className="flex items-center gap-2 rounded-3xl border border-line bg-panel p-3 shadow-card">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {scan.thumb ? (
          <img
            src={scan.thumb}
            alt=""
            className="h-14 w-14 shrink-0 rounded-2xl border border-line object-cover"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-tint text-brand dark:text-mint">
            <LeafIcon className="h-7 w-7" />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            {shown.chip ? (
              <span className="pill bg-fg text-[11px] uppercase tracking-wide text-bg">
                {shown.chip}
              </span>
            ) : null}
            {detailed ? (
              <span className="pill bg-tint text-mint">
                {t("history.match", { value: percent })}
              </span>
            ) : null}
          </span>
          <span className="truncate text-base font-semibold text-fg">
            {shown.name}
          </span>
          {detailed ? (
            <span className="flex items-center gap-2 truncate text-xs text-muted">
              <span>{formatDate(scan.createdAt, locale)}</span>
              <span className="h-1 w-1 rounded-full bg-muted" />
              <span>{t("history.ms", { value: scan.durationMs })}</span>
            </span>
          ) : null}
        </span>
        {detailed ? null : (
          <span className="pill bg-tint text-mint">
            {t("common.percent", { value: percent })}
          </span>
        )}
      </button>
      {onDelete ? (
        <button
          type="button"
          aria-label={t("history.deleteScan")}
          onClick={onDelete}
          className="icon-btn border-0 text-muted"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
      ) : null}
      <ChevronRightIcon className="h-5 w-5 shrink-0 text-muted" />
    </div>
  );
}
