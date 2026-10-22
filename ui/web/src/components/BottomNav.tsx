import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CameraIcon, ChatIcon, HistoryIcon, HomeIcon, UserIcon } from "./Icons";

export type Tab = "home" | "scan" | "chat" | "history" | "account";

interface Props {
  tab: Tab;
  historyCount: number;
  onTab: (tab: Tab) => void;
}

export function BottomNav({ tab, historyCount, onTab }: Props) {
  const { t } = useTranslation();
  const items: Array<{
    id: Tab;
    label: string;
    icon: ReactNode;
    badge?: number;
  }> = [
    {
      id: "home",
      label: t("nav.home"),
      icon: <HomeIcon className="h-6 w-6" />,
    },
    {
      id: "scan",
      label: t("nav.scan"),
      icon: <CameraIcon className="h-6 w-6" />,
    },
    {
      id: "chat",
      label: t("nav.chat"),
      icon: <ChatIcon className="h-6 w-6" />,
    },
    {
      id: "history",
      label: t("nav.history"),
      icon: <HistoryIcon className="h-6 w-6" />,
      badge: historyCount,
    },
    {
      id: "account",
      label: t("nav.account"),
      icon: <UserIcon className="h-6 w-6" />,
    },
  ];
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-[480px] grid-cols-5 gap-1 border-t border-line bg-panel/95 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
    >
      {items.map((item) => {
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? "page" : undefined}
            aria-label={
              item.badge ? `${item.label} (${item.badge})` : item.label
            }
            onClick={() => onTab(item.id)}
            className={`flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold transition ${
              active
                ? "bg-tint text-brand dark:text-mint"
                : "text-muted hover:text-fg"
            }`}
          >
            <span className="relative">
              {item.icon}
              {item.badge ? (
                <span className="absolute -right-2.5 -top-1.5 min-w-[18px] rounded-full bg-brand px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </span>
            <span className="max-w-full truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
