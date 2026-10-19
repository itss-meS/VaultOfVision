import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBanner, Shell } from '../components/Shell';
import type { Lang } from '../contracts/types';
import { listen, voiceInputAvailable } from '../lib/speech';

interface Props {
  lang: Lang;
  busy: boolean;
  error: string | null;
  initialQuestion: string;
  onBack: () => void;
  onAnalyze: (photo: File, question: string) => void;
}

export function Capture({ lang, busy, error, initialQuestion, onBack, onAnalyze }: Props) {
  const { t } = useTranslation();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [question, setQuestion] = useState(initialQuestion);
  const [listening, setListening] = useState(false);
  const voice = voiceInputAvailable();

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => () => stop.current?.(), []);

  function toggleMic() {
    if (listening) {
      stop.current?.();
      return;
    }
    setListening(true);
    stop.current = listen(lang, setQuestion, () => setListening(false));
  }

  return (
    <Shell title={t('capture.title')} onBack={onBack}>
      <p className="text-sm text-muted">{t('capture.hint')}</p>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
      />
      <input
        ref={gallery}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
      />
      {preview ? <img src={preview} alt="" className="max-h-72 w-full rounded-xl border border-line bg-panel object-contain" /> : null}
      <div className="grid grid-cols-2 gap-3">
        <button type="button" className="btn-secondary" onClick={() => camera.current?.click()}>
          {t('capture.camera')}
        </button>
        <button type="button" className="btn-secondary" onClick={() => gallery.current?.click()}>
          {t('capture.gallery')}
        </button>
      </div>
      <label className="label">
        {t('capture.question')}
        <textarea
          className="field min-h-[96px] py-3"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={600}
        />
      </label>
      <button
        type="button"
        className="btn-secondary"
        onClick={toggleMic}
        disabled={!voice}
        title={voice ? undefined : t('capture.micUnavailable')}
        aria-pressed={listening}
      >
        {t('capture.mic')}
        {listening ? ' ...' : ''}
      </button>
      <ErrorBanner message={error} />
      <button
        type="button"
        className="btn-primary"
        disabled={!photo || busy}
        onClick={() => photo && onAnalyze(photo, question.trim())}
      >
        {busy ? t('common.loading') : t('capture.analyze')}
      </button>
    </Shell>
  );
}
