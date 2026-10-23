import { useTranslation } from "react-i18next";
import { ConfidenceBar, PercentBar } from "../components/ConfidenceBar";
import { MaskOverlay } from "../components/MaskOverlay";
import { ErrorBanner, Page } from "../components/Page";
import { SeverityBadge } from "../components/SeverityBadge";
import type { Candidate, ScanKind, VisionResult } from "../contracts/types";
import { sourceKey } from "../lib/label";
import { useLabel } from "../lib/useLabel";

interface Props {
  vision: VisionResult;
  kind: ScanKind;
  candidates: Candidate[];
  photoUrl: string;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onAdvice: () => void;
}

export function Result({
  vision,
  kind,
  candidates,
  photoUrl,
  busy,
  error,
  onBack,
  onAdvice,
}: Props) {
  const { t } = useTranslation();
  const label = useLabel();
  const shown = label(vision.label, kind);
  const healthy = kind === "healthy" && !vision.low_confidence;
  const notCrop = vision.label === "unsupported";
  return (
    <Page title={t("result.title")} onBack={onBack}>
      <MaskOverlay src={photoUrl} vision={vision} />
      {vision.low_confidence ? (
        <>
          <p
            role="alert"
            className="rounded-2xl border border-warn/40 bg-warn/10 p-3 text-sm font-medium text-warn"
          >
            {t(notCrop ? "result.notCrop" : "result.retake")}
          </p>
          <button type="button" className="btn-primary" onClick={onBack}>
            {t("result.retakeButton")}
          </button>
        </>
      ) : (
        <div className="card flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            {shown.chip ? (
              <span className="pill w-fit bg-fg text-[11px] uppercase tracking-wide text-bg">
                {shown.chip}
              </span>
            ) : null}
            <p className="text-2xl font-bold text-fg">{shown.name}</p>
          </div>
          <ConfidenceBar value={vision.confidence} />
          {healthy ? (
            <p className="text-base font-medium text-ok">
              {t("result.healthy")}
            </p>
          ) : null}
          {vision.severity_level !== null ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-muted">
                {t("result.severity")}
              </span>
              <SeverityBadge level={vision.severity_level} />
              {vision.affected_area_pct != null ? (
                <span className="text-sm text-muted">
                  {t("result.affected")}:{" "}
                  <span className="mono text-fg">
                    {t("common.percent", { value: vision.affected_area_pct })}
                  </span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      {!vision.low_confidence && candidates.length > 1 ? (
        <section className="card flex flex-col gap-4">
          <h2 className="text-sm font-bold text-fg">{t("result.all")}</h2>
          <ul className="flex flex-col gap-4">
            {candidates.map((c) => {
              const row = label(c.label, c.kind);
              const name =
                row.chip && c.kind !== "pest"
                  ? `${row.chip} ${row.name}`
                  : row.name;
              return (
                <li
                  key={`${c.source}-${c.label}`}
                  className="flex flex-col gap-1.5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-fg">
                      {name}
                    </span>
                    <span className="mono text-sm text-fg">
                      {t("common.percent", {
                        value: Math.round(c.confidence * 100),
                      })}
                    </span>
                  </div>
                  <PercentBar value={c.confidence} />
                  <span className="text-xs text-muted">
                    {t(`result.sources.${sourceKey(c)}`)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <ErrorBanner message={error} />
      {!vision.low_confidence ? (
        <button
          type="button"
          className="btn-primary"
          onClick={onAdvice}
          disabled={busy}
        >
          {busy ? t("common.loading") : t("result.advice")}
        </button>
      ) : null}
    </Page>
  );
}
