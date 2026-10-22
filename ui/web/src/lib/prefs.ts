import type { Lang } from "../contracts/types";

const KEY = "agriedge.lang";
const LANGS: readonly Lang[] = ["en", "hi", "mr", "te"];

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

export type ThemeChoice = "light" | "dark";

const THEME_KEY = "agriedge.theme";

export function loadTheme(): ThemeChoice {
  try {
    return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
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
  document.documentElement.setAttribute("data-theme", theme);
}
