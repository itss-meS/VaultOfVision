import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DatabaseIcon } from "../components/Icons";
import { ScanRow } from "../components/ScanRow";
import type { LedgerStats, ScanRecord } from "../contracts/types";
import { LANGUAGES } from "../i18n";
import { formatDate, formatKb } from "../lib/label";

type Filter = "all" | "disease" | "pest" | "healthy";
const FILTERS: readonly Filter[] = ["all", "disease", "pest", "healthy"];

interface Props {
  scans: ScanRecord[];
  stats: LedgerStats;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 rounded-2xl bg-panel p-3 text-center shadow-card">
      <span className="text-xs text-muted">{label}</span>
      <span className="max-w-full truncate text-lg font-bold text-mint">
        {value}
      </span>
    </div>
  );
}

export function History({ scans, stats, onOpen, onDelete, onClear }: Props) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");
  const [confirming, setConfirming] = useState(false);
  const locale =
    LANGUAGES.find((l) => l.code === i18n.language)?.locale ?? "en-IN";
  const shown =
    filter === "all" ? scans : scans.filter((s) => s.kind === filter);
  const filterLabel: Record<Filter, string> = {
    all: t("history.filterAll"),
    disease: t("history.filterDisease"),
    pest: t("history.filterPest"),
    healthy: t("history.filterHealthy"),
  };

  function clear() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onClear();
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-32 pt-4">
      <section className="flex flex-col gap-4 rounded-[28px] border border-line bg-raised p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
            <DatabaseIcon className="h-6 w-6" />
          </span>
          <div className="flex min-w-0 flex-col">
            <h1 className="text-lg font-bold text-fg">{t("history.ledger")}</h1>
            <p className="text-sm font-medium text-mint">
              {t("history.ledgerSub")}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label={t("history.scans")} value={String(stats.scans)} />
          <Stat
            label={t("history.storage")}
            value={t("history.kb", { value: formatKb(stats.bytes) })}
          />
          <Stat
            label={t("history.last")}
            value={
              stats.lastAt === null
                ? t("history.never")
                : formatDate(stats.lastAt, locale)
            }
          />
        </div>
      </section>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`shrink-0 rounded-full px-5 py-2.5 text-base font-semibold transition ${
              filter === f
                ? "bg-brand text-white"
                : "bg-raised text-fg hover:bg-line"
            }`}
          >
            {filterLabel[f]}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-fg">
          {t("history.title")} ({scans.length})
        </h2>
        {scans.length > 0 ? (
          <button
            type="button"
            onClick={clear}
            className={`text-sm font-semibold ${confirming ? "text-bad" : "text-muted"}`}
          >
            {confirming ? t("history.clearConfirm") : t("history.clear")}
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <p className="card text-base text-muted">{t("history.empty")}</p>
      ) : (
        shown.map((s) => (
          <ScanRow
            key={s.id}
            scan={s}
            detailed
            onOpen={() => onOpen(s.id)}
            onDelete={() => onDelete(s.id)}
          />
        ))
      )}
    </div>
  );
}
