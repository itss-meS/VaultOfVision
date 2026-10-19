import type { Lang } from "../contracts/types";

const KEY = "agriedge.lang";
const LANGS: readonly Lang[] = ["en", "hi", "mr"];

export function loadLang(): Lang | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return LANGS.find((l) => l === value) ?? null;
  } catch {
    return null;
  }
}

export function saveLang(lang: Lang): void {
  try {
    window.localStorage.setItem(KEY, lang);
  } catch {
    return;
  }
}

export type ThemeChoice = "system" | "light" | "dark";

const THEME_KEY = "agriedge.theme";
const THEMES: readonly ThemeChoice[] = ["system", "light", "dark"];

export function loadTheme(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return THEMES.find((t) => t === value) ?? "system";
  } catch {
    return "system";
  }
}

export function saveTheme(theme: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    return;
  }
}

export function applyTheme(theme: ThemeChoice): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}
