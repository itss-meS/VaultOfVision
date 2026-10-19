import { useTranslation } from 'react-i18next';
import { ConfidenceBar } from '../components/ConfidenceBar';
import { MaskOverlay } from '../components/MaskOverlay';
import { SeverityBadge } from '../components/SeverityBadge';
import { ErrorBanner, Shell } from '../components/Shell';
import type { VisionResult } from '../contracts/types';
import { diseaseKey } from '../lib/severity';

interface Props {
  vision: VisionResult;
  photoUrl: string;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onAdvice: () => void;
}

export function Result({ vision, photoUrl, busy, error, onBack, onAdvice }: Props) {
  const { t, i18n } = useTranslation();
  const key = `diseases.${diseaseKey(vision.label)}`;
  const name = i18n.exists(key) ? t(key) : vision.label;
  const healthy = vision.label === 'Healthy' && !vision.low_confidence;
  return (
    <Shell title={t('result.title')} onBack={onBack}>
      <MaskOverlay src={photoUrl} vision={vision} />
      {vision.low_confidence ? (
        <>
          <p role="alert" className="rounded-lg border border-warn/50 bg-warn/10 p-3 text-sm font-medium text-warn">
            {t('result.retake')}
          </p>
          <button type="button" className="btn-primary" onClick={onBack}>
            {t('result.retakeButton')}
          </button>
        </>
      ) : (
        <div className="card flex flex-col gap-4">
          <p className="text-2xl font-semibold text-fg">{name}</p>
          <ConfidenceBar value={vision.confidence} />
          {healthy ? <p className="text-base font-medium text-ok">{t('result.healthy')}</p> : null}
          {vision.severity_level !== null ? (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-muted">{t('result.severity')}</span>
              <SeverityBadge level={vision.severity_level} />
              {vision.affected_area_pct != null ? (
                <span className="text-sm text-muted">
                  {t('result.affected')}: <span className="mono text-fg">{t('common.percent', { value: vision.affected_area_pct })}</span>
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
      <ErrorBanner message={error} />
      {!vision.low_confidence ? (
        <button type="button" className="btn-primary" onClick={onAdvice} disabled={busy}>
          {busy ? t('common.loading') : t('result.advice')}
        </button>
      ) : null}
    </Shell>
  );
}
