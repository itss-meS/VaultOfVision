import { useTranslation } from "react-i18next";
import type { ScanKind } from "../contracts/types";
import { diseaseKey } from "./severity";
import { splitLabel } from "./label";

export interface ShownLabel {
  chip: string | null;
  name: string;
}

export function useLabel(): (label: string, kind: ScanKind) => ShownLabel {
  const { t, i18n } = useTranslation();
  return (label, kind) => {
    const parts = splitLabel(label, kind);
    const cropKey = `crops.${parts.crop ?? ""}`;
    const nameKey = `diseases.${diseaseKey(parts.name)}`;
    return {
      chip:
        parts.crop === null
          ? null
          : i18n.exists(cropKey)
            ? t(cropKey)
            : parts.crop,
      name: kind !== "pest" && i18n.exists(nameKey) ? t(nameKey) : parts.name,
    };
  };
}
