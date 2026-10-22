import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import type { Lang } from "../contracts/types";
import en from "./en.json";
import hi from "./hi.json";
import mr from "./mr.json";
import te from "./te.json";

export const LANGUAGES: ReadonlyArray<{
  code: Lang;
  native: string;
  english: string;
  locale: string;
}> = [
  { code: "en", native: "English", english: "English", locale: "en-IN" },
  { code: "hi", native: "हिन्दी", english: "Hindi", locale: "hi-IN" },
  { code: "mr", native: "मराठी", english: "Marathi", locale: "mr-IN" },
  { code: "te", native: "తెలుగు", english: "Telugu", locale: "te-IN" },
];

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    hi: { translation: hi },
    mr: { translation: mr },
    te: { translation: te },
  },
  lng: "en",
  fallbackLng: "en",
  supportedLngs: ["en", "hi", "mr", "te"],
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
