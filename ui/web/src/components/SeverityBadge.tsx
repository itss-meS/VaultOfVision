import { useTranslation } from 'react-i18next';
import { TONE_CLASS, TONE_DOT, severityTone } from '../lib/severity';

export function SeverityBadge({ level }: { level: number }) {
  const { t } = useTranslation();
  const tone = severityTone(level);
  return (
    <span
      className={`inline-flex w-fit items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium ${TONE_CLASS[tone]}`}
    >
      <span className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
      <span className="mono">{level}/5</span>
      <span>{t(`severityLevels.${level}`)}</span>
    </span>
  );
}
