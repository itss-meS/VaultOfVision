import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner, Shell } from '../components/Shell';
import { type DeviceHealth, type EngineClient, EngineError } from '../contracts/types';

interface Props {
  engine: EngineClient;
  onBack: () => void;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
}

function Row({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <dt className="text-sm text-muted">{name}</dt>
      <dd className="mono min-w-0 truncate text-right text-fg">{value}</dd>
    </div>
  );
}

export function Device({ engine, onBack }: Props) {
  const { t } = useTranslation();
  const [data, setData] = useState<DeviceHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    engine
      .health()
      .then(setData)
      .catch((err: unknown) => {
        const code = err instanceof EngineError ? err.code : 'unknown';
        setError(code === 'auth' ? t('device.forbidden') : t(`errors.${code}`));
      });
  }, [engine, t]);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 5000);
    return () => window.clearInterval(id);
  }, [load]);

  const rss = data?.peak_rss_kb != null ? `${Math.round(data.peak_rss_kb / 1024)} MB` : '-';
  const temp = data?.temp_c != null ? `${data.temp_c.toFixed(1)} C` : '-';

  return (
    <Shell title={t('device.title')} onBack={onBack} action={{ label: t('common.retry'), onClick: load }}>
      <ErrorBanner message={error} />
      {data ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="card">
              <p className="text-xs text-muted">{t('device.status')}</p>
              <p className="mono mt-1 text-ok">{data.status}</p>
            </div>
            <div className="card">
              <p className="text-xs text-muted">{t('device.temp')}</p>
              <p className="mono mt-1">{temp}</p>
            </div>
            <div className="card">
              <p className="text-xs text-muted">{t('device.memory')}</p>
              <p className="mono mt-1">{rss}</p>
            </div>
          </div>
          <section className="card" aria-labelledby="sys">
            <h2 id="sys" className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
              {t('device.system')}
            </h2>
            <dl>
              <Row name={t('device.platform')} value={data.platform} />
              <Row name={t('device.uptime')} value={formatUptime(data.uptime_s)} />
              <Row name={t('device.bannedList')} value={data.banned_list_version} />
              <Row name={t('device.ota')} value={String(data.ota_version)} />
            </dl>
          </section>
          <section className="card" aria-labelledby="eng">
            <h2 id="eng" className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
              {t('device.engines')}
            </h2>
            <dl>
              <Row name={t('device.vision')} value={`${data.adapters.vision} / ${data.models.vision}`} />
              <Row name={t('device.llm')} value={`${data.adapters.llm} / ${data.models.llm}`} />
              <Row name={t('device.retriever')} value={data.adapters.retriever} />
              <Row name={t('device.audio')} value={data.adapters.audio} />
            </dl>
          </section>
        </>
      ) : null}
    </Shell>
  );
}
