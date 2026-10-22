import { type FormEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AdviceView } from "../components/AdviceView";
import { ArrowLeftIcon, ChatIcon, SendIcon } from "../components/Icons";
import { ErrorBanner } from "../components/Page";
import type { AdvisoryResponse, ChatTurn } from "../contracts/types";

export interface AdviceProps {
  response: AdvisoryResponse;
  speakError: string | null;
  onSpeak: (text: string) => Promise<void>;
  onBack: () => void;
  onRestart: () => void;
}

interface Props {
  advice?: AdviceProps;
  messages: ChatTurn[];
  busy: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onClear: () => void;
}

const MAX = 600;

export function Chat({
  advice,
  messages,
  busy,
  error,
  onSend,
  onClear,
}: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, busy]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    onSend(text);
  }

  const suggestions = [t("chat.s1"), t("chat.s2"), t("chat.s3")];

  return (
    <div className="flex min-h-[calc(100dvh-72px)] flex-col px-4 pb-28 pt-4">
      <div className="flex items-center gap-3">
        {advice ? (
          <button
            type="button"
            onClick={advice.onBack}
            className="flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-raised px-4 text-sm font-semibold text-fg transition hover:bg-line"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            {t("common.back")}
          </button>
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white">
            <ChatIcon className="h-6 w-6" />
          </span>
        )}
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-fg">
          {advice ? t("advisory.title") : t("chat.title")}
        </h1>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="rounded-2xl bg-raised px-4 py-2 text-sm font-semibold text-fg transition hover:bg-line disabled:opacity-50"
          >
            {t("chat.clear")}
          </button>
        ) : null}
      </div>

      <div
        role="log"
        aria-live="polite"
        className="flex flex-1 flex-col gap-3 py-4"
      >
        {advice ? (
          <div className="flex flex-col items-start gap-1">
            <span className="px-1 text-xs font-semibold text-muted">
              {t("chat.assistant")}
            </span>
            <div className="flex w-full flex-col gap-4">
              <AdviceView
                response={advice.response}
                onSpeak={advice.onSpeak}
                speakError={advice.speakError}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={advice.onRestart}
              >
                {t("advisory.newCheck")}
              </button>
              {messages.length === 0 ? (
                <p className="text-sm text-muted">{t("chat.followUpHint")}</p>
              ) : null}
            </div>
          </div>
        ) : null}
        {messages.length === 0 && !advice ? (
          <>
            <p className="card text-sm text-muted">{t("chat.intro")}</p>
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={busy}
                  onClick={() => onSend(s)}
                  className="rounded-2xl border border-line bg-panel p-3 text-left text-sm font-medium text-fg transition hover:bg-raised disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </>
        ) : (
          messages.map((m, i) => (
            <div
              key={`${i}-${m.role}`}
              className={`flex flex-col gap-1 ${
                m.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <span className="px-1 text-xs font-semibold text-muted">
                {m.role === "user" ? t("chat.you") : t("chat.assistant")}
              </span>
              <p
                className={`max-w-[88%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-base ${
                  m.role === "user"
                    ? "rounded-br-lg bg-brand text-white"
                    : "rounded-bl-lg border border-line bg-panel text-fg"
                }`}
              >
                {m.content}
              </p>
            </div>
          ))
        )}
        {busy ? (
          <div className="flex flex-col items-start gap-1">
            <span className="px-1 text-xs font-semibold text-muted">
              {t("chat.assistant")}
            </span>
            <p className="rounded-3xl rounded-bl-lg border border-line bg-panel px-4 py-3 text-base text-muted">
              {t("chat.thinking")}
            </p>
          </div>
        ) : null}
        <ErrorBanner message={error} />
        <div ref={endRef} className="h-40 shrink-0" />
      </div>

      <form
        onSubmit={submit}
        className="sticky bottom-24 flex items-end gap-2 rounded-3xl border border-line bg-panel p-2 shadow-lift"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(e);
            }
          }}
          rows={1}
          aria-label={advice ? t("chat.followUp") : t("chat.placeholder")}
          placeholder={advice ? t("chat.followUp") : t("chat.placeholder")}
          className="max-h-28 min-h-[44px] flex-1 resize-none bg-transparent px-3 py-2.5 text-base text-fg outline-none placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={busy || draft.trim().length === 0}
          aria-label={t("chat.send")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand text-white transition hover:bg-brand-hover disabled:opacity-40"
        >
          <SendIcon className="h-5 w-5" />
        </button>
      </form>
    </div>
  );
}
