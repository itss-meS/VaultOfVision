import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftIcon } from "./Icons";

interface Props {
  title: string;
  onBack?: () => void;
  backLabel?: string;
  children: ReactNode;
}

export function Page({ title, onBack, backLabel, children }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4 px-4 pb-32 pt-4">
      <div className="flex items-center gap-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 shrink-0 items-center gap-2 rounded-2xl bg-raised px-4 text-sm font-semibold text-fg transition hover:bg-line"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            {backLabel ?? t("common.back")}
          </button>
        ) : null}
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-fg">
          {title}
        </h1>
      </div>
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-2xl border border-bad/40 bg-bad/10 p-3 text-sm font-medium text-bad"
    >
      {message}
    </p>
  );
}
