import type { Lang } from '../contracts/types';

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

type RecognitionCtor = new () => Recognition;

const BCP47: Record<Lang, string> = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' };

function ctor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function voiceInputAvailable(): boolean {
  return ctor() !== null;
}

export function listen(lang: Lang, onText: (text: string) => void, onEnd: () => void): () => void {
  const Ctor = ctor();
  if (!Ctor) {
    onEnd();
    return () => undefined;
  }
  const rec = new Ctor();
  rec.lang = BCP47[lang];
  rec.interimResults = false;
  rec.onresult = (e) => {
    const first = e.results[0]?.[0];
    if (first) onText(first.transcript.slice(0, 600));
  };
  rec.onend = onEnd;
  rec.onerror = onEnd;
  rec.start();
  return () => rec.stop();
}
