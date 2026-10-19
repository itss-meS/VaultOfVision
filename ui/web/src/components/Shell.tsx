import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface Props {
  title: string;
  onBack?: () => void;
  action?: { label: string; onClick: () => void };
  children: ReactNode;
}

export function Shell({ title, onBack, action, children }: Props) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 pb-10 pt-4">
      <header className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex min-w-0 items-center gap-3">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="min-h-[40px] rounded-lg border border-line bg-panel px-3 text-sm font-medium text-muted hover:text-fg"
            >
              {t("common.back")}
            </button>
          ) : null}
          <h1 className="truncate text-lg font-semibold text-fg">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="min-h-[40px] rounded-lg border border-line bg-panel px-3 text-sm font-medium text-fg hover:bg-raised"
            >
              {action.label}
            </button>
          ) : null}
        </div>
      </header>
      {children}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border border-bad/50 bg-bad/10 p-3 text-sm font-medium text-bad"
    >
      {message}
    </p>
  );
}
