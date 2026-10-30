import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { AdvisoryResponse, Lang, Priority } from "../contracts/types";
import { diseaseKey } from "../lib/severity";
import { SeverityBadge } from "./SeverityBadge";
import { ErrorBanner } from "./Page";

interface Props {
  response: AdvisoryResponse;
  onSpeak: (text: string, lang?: Lang) => Promise<void>;
  speakError: string | null;
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const PRIORITY_TONE: Record<Priority, string> = {
  critical: "border-l-bad",
  high: "border-l-warn",
  normal: "border-l-mint",
};

const PRIORITY_TEXT: Record<Priority, string> = {
  critical: "text-bad",
  high: "text-warn",
  normal: "text-mint",
};

export function AdviceView({ response, onSpeak, speakError }: Props) {
  const { t, i18n } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const { advisory, dosage, source } = response;
  const key = `diseases.${diseaseKey(advisory.diagnosis.primary)}`;
  const title = i18n.exists(key) ? t(key) : advisory.diagnosis.primary;

  const details = advisory.details;
  const spoken = [
    title,
    ...(details ? [details.summary] : []),
    ...advisory.actions.map((a) => a.text),
    ...advisory.preventive,
    advisory.safety_notice,
  ].join(". ");

  async function play() {
    setPlaying(true);
    try {
      await onSpeak(spoken, advisory.lang);
    } finally {
      setPlaying(false);
    }
  }

  return (
    <>
      <div className="card flex flex-col gap-3">
        <p className="text-xl font-bold text-fg">{title}</p>
        {advisory.severity ? (
          <SeverityBadge level={advisory.severity.level} />
        ) : null}
        {source === "fallback" ? (
          <p className="text-sm font-medium text-warn">
            {t("advisory.fallback")}
          </p>
        ) : null}
        {source === "refusal" ? (
          <p className="text-sm font-medium text-bad">
            {t("advisory.refusal")}
          </p>
        ) : null}
      </div>

      {details ? (
        <>
          {advisory.lang !== i18n.language ? (
            <p className="text-sm text-muted">{t("advisory.englishOnly")}</p>
          ) : null}
          <section className="card flex flex-col gap-2" aria-labelledby="about">
            <h2
              id="about"
              className="text-sm font-semibold uppercase tracking-wide text-muted"
            >
              {t("advisory.about")}
            </h2>
            <p className="text-base text-fg">{details.summary}</p>
          </section>
          {details.symptoms.length > 0 ? (
            <section className="flex flex-col gap-2" aria-labelledby="symptoms">
              <h2
                id="symptoms"
                className="text-sm font-semibold uppercase tracking-wide text-muted"
              >
                {t("advisory.symptoms")}
              </h2>
              <ul className="list-disc pl-6 text-base text-fg">
                {details.symptoms.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {details.causes.length > 0 ? (
            <section className="flex flex-col gap-2" aria-labelledby="causes">
              <h2
                id="causes"
                className="text-sm font-semibold uppercase tracking-wide text-muted"
              >
                {t("advisory.causes")}
              </h2>
              <ul className="list-disc pl-6 text-base text-fg">
                {details.causes.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="steps">
        <h2
          id="steps"
          className="text-sm font-semibold uppercase tracking-wide text-muted"
        >
          {t("advisory.steps")}
        </h2>
        <ol className="flex flex-col gap-3">
          {advisory.actions.map((a, i) => (
            <li
              key={i}
              className={`rounded-2xl border border-line border-l-4 bg-panel p-4 ${PRIORITY_TONE[a.priority]}`}
            >
              <span
                className={`mono mb-1 block text-xs uppercase ${PRIORITY_TEXT[a.priority]}`}
              >
                {i + 1} / {t(`priority.${a.priority}`)}
              </span>
              <span className="text-base text-fg">{a.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {dosage ? (
        <section className="card flex flex-col gap-1" aria-labelledby="dose">
          <h2
            id="dose"
            className="text-sm font-semibold uppercase tracking-wide text-muted"
          >
            {t("advisory.dosage")}
          </h2>
          <p className="text-base text-fg">
            {dosage.available && dosage.total != null
              ? t("advisory.dosageTotal", {
                  total: dosage.total,
                  unit: dosage.unit ?? "",
                  product: dosage.product ?? "",
                  area: dosage.area_ha ?? "",
                })
              : t("advisory.dosageMissing")}
          </p>
        </section>
      ) : null}

      {advisory.preventive.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="prevent">
          <h2
            id="prevent"
            className="text-sm font-semibold uppercase tracking-wide text-muted"
          >
            {t("advisory.prevent")}
          </h2>
          <ul className="list-disc pl-6 text-base text-fg">
            {advisory.preventive.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {details?.help ? (
        <section className="card flex flex-col gap-1" aria-labelledby="help">
          <h2
            id="help"
            className="text-sm font-semibold uppercase tracking-wide text-muted"
          >
            {t("advisory.help")}
          </h2>
          <p className="text-base text-fg">{details.help}</p>
        </section>
      ) : null}

      <section
        className="rounded-2xl border border-warn/40 bg-warn/10 p-4"
        aria-labelledby="safety"
      >
        <h2
          id="safety"
          className="text-sm font-semibold uppercase tracking-wide text-warn"
        >
          {t("advisory.safety")}
        </h2>
        <p className="mt-1 text-base text-fg">{advisory.safety_notice}</p>
      </section>

      {details && details.sources.length > 0 ? (
        <section className="flex flex-col gap-1" aria-labelledby="sources">
          <h2
            id="sources"
            className="text-sm font-semibold uppercase tracking-wide text-muted"
          >
            {t("advisory.sources")}
          </h2>
          <ul className="flex flex-col gap-1 text-sm text-muted">
            {details.sources.map((src, i) => (
              <li key={i}>
                {src.title}
                {host(src.url) ? ` (${host(src.url)})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ErrorBanner message={speakError} />
      <button
        type="button"
        className="btn-primary"
        onClick={() => void play()}
        disabled={playing}
      >
        {playing ? t("advisory.playing") : t("advisory.play")}
      </button>
    </>
  );
}
