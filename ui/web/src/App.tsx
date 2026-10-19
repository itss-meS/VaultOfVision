import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type AdvisoryResponse,
  type EngineClient,
  EngineError,
  type Lang,
  type Role,
  type SessionInfo,
  type VisionResult,
} from './contracts/types';
import { createEngine } from './engine';
import { loadLang } from './lib/prefs';
import { AdvisoryScreen } from './screens/AdvisoryScreen';
import { Device } from './screens/Device';
import { Capture } from './screens/Capture';
import { Login } from './screens/Login';
import { Result } from './screens/Result';
import { type Profile, Setup } from './screens/Setup';
import i18n from './i18n';

type Step = 'boot' | 'login' | 'setup' | 'capture' | 'result' | 'advisory' | 'device';

interface Props {
  engine?: EngineClient;
}

export function App({ engine: injected }: Props) {
  const { t } = useTranslation();
  const engine = useMemo(() => injected ?? createEngine(), [injected]);
  const [step, setStep] = useState<Step>('boot');
  const [profile, setProfile] = useState<Profile>({ lang: loadLang() ?? 'en', region: '', areaHa: undefined });
  const [question, setQuestion] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [vision, setVision] = useState<VisionResult | null>(null);
  const [response, setResponse] = useState<AdvisoryResponse | null>(null);
  const [role, setRole] = useState<Role>('farmer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const failRef = useRef<(err: unknown) => void>(() => undefined);

  const fail = useCallback(
    (err: unknown) => {
      const code = err instanceof EngineError ? err.code : 'unknown';
      if (code === 'auth') setStep('login');
      setError(t(`errors.${code}`));
    },
    [t],
  );

  useEffect(() => {
    failRef.current = fail;
  }, [fail]);

  useEffect(() => {
    void i18n.changeLanguage(profile.lang);
  }, [profile.lang]);

  useEffect(() => {
    let live = true;
    engine
      .restoreSession()
      .then((s: SessionInfo | null) => {
        if (!live) return;
        if (s) setRole(s.role);
        setStep(s ? 'setup' : 'login');
      })
      .catch((err: unknown) => {
        if (!live) return;
        setStep('login');
        failRef.current(err);
      });
    return () => {
      live = false;
    };
  }, [engine]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  async function analyze(photo: File, q: string) {
    setBusy(true);
    setError(null);
    setQuestion(q);
    try {
      const result = await engine.analyzeImage(photo);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(photo);
      urlRef.current = url;
      setPhotoUrl(url);
      setVision(result);
      setStep('result');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function advise() {
    if (!vision) return;
    setBusy(true);
    setError(null);
    try {
      const res = await engine.ask(question || vision.label, vision, { lang: profile.lang, area_ha: profile.areaHa });
      setResponse(res);
      setStep('advisory');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function speak(text: string) {
    setError(null);
    try {
      await engine.speak(text, profile.lang as Lang);
    } catch (err) {
      fail(err);
    }
  }

  function restart() {
    setVision(null);
    setResponse(null);
    setQuestion('');
    setError(null);
    setStep('capture');
  }

  if (step === 'boot') return <p className="p-6 text-base text-muted">{t('common.loading')}</p>;
  if (step === 'login') {
    return (
      <Login
        engine={engine}
        onSession={(s) => {
          setRole(s.role);
          setProfile((p) => ({ ...p, lang: s.lang }));
          setStep('setup');
        }}
      />
    );
  }
  if (step === 'setup') {
    return (
      <Setup
        initial={profile}
        onDevice={role === 'officer' || role === 'admin' ? () => setStep('device') : undefined}
        onDone={(p) => {
          setProfile(p);
          setStep('capture');
        }}
      />
    );
  }
  if (step === 'device') return <Device engine={engine} onBack={() => setStep('setup')} />;
  if (step === 'capture') {
    return (
      <Capture
        lang={profile.lang}
        busy={busy}
        error={error}
        initialQuestion={question}
        onBack={() => setStep('setup')}
        onAnalyze={(p, q) => void analyze(p, q)}
      />
    );
  }
  if (step === 'result' && vision && photoUrl) {
    return (
      <Result
        vision={vision}
        photoUrl={photoUrl}
        busy={busy}
        error={error}
        onBack={restart}
        onAdvice={() => void advise()}
      />
    );
  }
  if (step === 'advisory' && response) {
    return (
      <AdvisoryScreen
        response={response}
        speakError={error}
        onSpeak={speak}
        onBack={() => setStep('result')}
        onRestart={restart}
      />
    );
  }
  return null;
}
