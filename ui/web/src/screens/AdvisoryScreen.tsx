import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SeverityBadge } from '../components/SeverityBadge';
import { ErrorBanner, Shell } from '../components/Shell';
import type { AdvisoryResponse, Priority } from '../contracts/types';
import { diseaseKey } from '../lib/severity';

interface Props {
  response: AdvisoryResponse;
  onSpeak: (text: string) => Promise<void>;
  onBack: () => void;
  onRestart: () => void;
  speakError: string | null;
}

const PRIORITY_TONE: Record<Priority, string> = {
  critical: 'border-l-bad text-bad',
  high: 'border-l-warn text-warn',
  normal: 'border-l-accent text-accent',
};

export function AdvisoryScreen({ response, onSpeak, onBack, onRestart, speakError }: Props) {
  const { t, i18n } = useTranslation();
  const [playing, setPlaying] = useState(false);
  const { advisory, dosage, source } = response;
  const key = `diseases.${diseaseKey(advisory.diagnosis.primary)}`;
  const title = i18n.exists(key) ? t(key) : advisory.diagnosis.primary;

  const spoken = [
    title,
    ...advisory.actions.map((a) => a.text),
    ...advisory.preventive,
    advisory.safety_notice,
  ].join('. ');

  async function play() {
    setPlaying(true);
    try {
      await onSpeak(spoken);
    } finally {
      setPlaying(false);
    }
  }

  return (
    <Shell title={t('advisory.title')} onBack={onBack}>
      <div className="card flex flex-col gap-3">
        <p className="text-xl font-semibold text-fg">{title}</p>
        {advisory.severity ? <SeverityBadge level={advisory.severity.level} /> : null}
        {source === 'fallback' ? <p className="text-sm font-medium text-warn">{t('advisory.fallback')}</p> : null}
        {source === 'refusal' ? <p className="text-sm font-medium text-bad">{t('advisory.refusal')}</p> : null}
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="steps">
        <h2 id="steps" className="text-sm font-medium uppercase tracking-wide text-muted">
          {t('advisory.steps')}
        </h2>
        <ol className="flex flex-col gap-3">
          {advisory.actions.map((a, i) => (
            <li key={i} className={`rounded-lg border border-line border-l-4 bg-panel p-4 ${PRIORITY_TONE[a.priority]}`}>
              <span className="mono mb-1 block text-xs uppercase">
                {i + 1} / {t(`priority.${a.priority}`)}
              </span>
              <span className="text-base text-fg">{a.text}</span>
            </li>
          ))}
        </ol>
      </section>

      {dosage ? (
        <section className="card flex flex-col gap-1" aria-labelledby="dose">
          <h2 id="dose" className="text-sm font-medium uppercase tracking-wide text-muted">
            {t('advisory.dosage')}
          </h2>
          <p className="mono text-fg">
            {dosage.available && dosage.total != null
              ? t('advisory.dosageTotal', {
                  total: dosage.total,
                  unit: dosage.unit ?? '',
                  product: dosage.product ?? '',
                  area: dosage.area_ha ?? '',
                })
              : t('advisory.dosageMissing')}
          </p>
        </section>
      ) : null}

      {advisory.preventive.length > 0 ? (
        <section className="flex flex-col gap-2" aria-labelledby="prevent">
          <h2 id="prevent" className="text-sm font-medium uppercase tracking-wide text-muted">
            {t('advisory.prevent')}
          </h2>
          <ul className="list-disc pl-6 text-base text-fg">
            {advisory.preventive.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-lg border border-warn/50 bg-warn/10 p-4" aria-labelledby="safety">
        <h2 id="safety" className="text-sm font-medium uppercase tracking-wide text-warn">
          {t('advisory.safety')}
        </h2>
        <p className="mt-1 text-base text-fg">{advisory.safety_notice}</p>
      </section>

      <ErrorBanner message={speakError} />
      <button type="button" className="btn-primary" onClick={() => void play()} disabled={playing}>
        {playing ? t('advisory.playing') : t('advisory.play')}
      </button>
      <button type="button" className="btn-secondary" onClick={onRestart}>
        {t('advisory.newCheck')}
      </button>
    </Shell>
  );
}
