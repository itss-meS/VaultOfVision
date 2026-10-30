import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdviceView } from "../components/AdviceView";
import { ConfidenceBar } from "../components/ConfidenceBar";
import { LeafIcon } from "../components/Icons";
import { Page } from "../components/Page";
import type {
  AdvisoryResponse,
  EngineClient,
  Lang,
  ScanRecord,
} from "../contracts/types";
import { LANGUAGES } from "../i18n";
import { formatDate } from "../lib/label";
import { useLabel } from "../lib/useLabel";

interface Props {
  engine: EngineClient;
  scan: ScanRecord;
  onSpeak: (text: string, lang?: Lang) => Promise<void>;
  speakError: string | null;
  onBack: () => void;
}

export function ScanDetail({
  engine,
  scan,
  onSpeak,
  speakError,
  onBack,
}: Props) {
  const { t, i18n } = useTranslation();
  const label = useLabel();
  const [advice, setAdvice] = useState<AdvisoryResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const shown = label(scan.label, scan.kind);
  const locale =
    LANGUAGES.find((l) => l.code === i18n.language)?.locale ?? "en-IN";

  useEffect(() => {
    let live = true;
    setLoaded(false);
    engine
      .getAdvice(scan.id)
      .then((a) => {
        if (live) setAdvice(a);
      })
      .catch(() => {
        if (live) setAdvice(null);
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [engine, scan.id]);

  return (
    <Page title={t("history.detail")} onBack={onBack}>
      <div className="card flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {scan.thumb ? (
            <img
              src={scan.thumb}
              alt=""
              className="h-24 w-24 shrink-0 rounded-3xl border border-line object-cover"
            />
          ) : (
            <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-3xl bg-tint text-brand dark:text-mint">
              <LeafIcon className="h-10 w-10" />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            {shown.chip ? (
              <span className="pill w-fit bg-fg text-[11px] uppercase tracking-wide text-bg">
                {shown.chip}
              </span>
            ) : null}
            <p className="text-xl font-bold text-fg">{shown.name}</p>
            <p className="text-sm text-muted">
              {formatDate(scan.createdAt, locale)}
            </p>
          </div>
        </div>
        <ConfidenceBar value={scan.confidence} />
      </div>
      {advice ? (
        <AdviceView
          response={advice}
          onSpeak={onSpeak}
          speakError={speakError}
        />
      ) : loaded ? (
        <p className="card text-base text-muted">{t("history.noAdvice")}</p>
      ) : null}
    </Page>
  );
}
