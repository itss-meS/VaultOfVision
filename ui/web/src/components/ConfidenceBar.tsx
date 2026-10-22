import { useTranslation } from "react-i18next";

const WIDTHS: Record<number, string> = {
  0: "w-0",
  10: "w-[10%]",
  20: "w-[20%]",
  30: "w-[30%]",
  40: "w-[40%]",
  50: "w-[50%]",
  60: "w-[60%]",
  70: "w-[70%]",
  80: "w-[80%]",
  90: "w-[90%]",
  100: "w-full",
};

export function PercentBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const bucket = Math.round(pct / 10) * 10;
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2 w-full overflow-hidden rounded-full bg-raised"
    >
      <div
        className={`h-full rounded-full bg-brand dark:bg-mint ${WIDTHS[bucket] ?? "w-0"}`}
      />
    </div>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const { t } = useTranslation();
  const pct = Math.round(value * 100);
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-sm font-medium text-muted">
        <span>{t("result.confidence")}</span>
        <span className="mono text-fg">
          {t("common.percent", { value: pct })}
        </span>
      </div>
      <PercentBar value={value} />
    </div>
  );
}
