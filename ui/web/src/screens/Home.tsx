import { useTranslation } from "react-i18next";
import {
  CameraIcon,
  LeafIcon,
  ShieldIcon,
  SproutIcon,
  TranslateIcon,
  UploadIcon,
  WifiOffIcon,
} from "../components/Icons";
import { usePhotoInputs } from "../components/PhotoInputs";
import { ScanRow } from "../components/ScanRow";
import type { ScanRecord } from "../contracts/types";

interface Props {
  scans: ScanRecord[];
  onPhoto: (file: File) => void;
  onOpenScan: (id: string) => void;
  onViewAll: () => void;
}

export function Home({ scans, onPhoto, onOpenScan, onViewAll }: Props) {
  const { t } = useTranslation();
  const { openCamera, openGallery, inputs } = usePhotoInputs(onPhoto);
  const tiles = [
    { key: "private", icon: <ShieldIcon className="h-6 w-6" /> },
    { key: "offline", icon: <WifiOffIcon className="h-6 w-6" /> },
    { key: "languages", icon: <TranslateIcon className="h-6 w-6" /> },
  ];
  return (
    <div className="pb-32">
      {inputs}
      <section className="relative h-56 overflow-hidden bg-gradient-to-br from-brand to-brand-hover">
        <SproutIcon className="absolute -right-8 -top-6 h-64 w-64 text-white/10" />
        <LeafIcon className="absolute -left-10 top-16 h-40 w-40 text-white/10" />
        <p className="absolute inset-x-4 bottom-14 max-w-[300px] text-xl font-bold leading-snug text-white">
          {t("app.tagline")}
        </p>
      </section>

      <div className="relative z-10 -mt-9 flex flex-col gap-3 px-4">
        <div className="card flex flex-col gap-3 rounded-[28px] p-5 shadow-lift">
          <button type="button" className="btn-primary" onClick={openCamera}>
            <CameraIcon className="h-6 w-6" />
            {t("home.openCamera")}
          </button>
          <button type="button" className="btn-secondary" onClick={openGallery}>
            <UploadIcon className="h-5 w-5 text-mint" />
            {t("home.upload")}
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-fg">{t("home.recent")}</h2>
          {scans.length > 0 ? (
            <button
              type="button"
              onClick={onViewAll}
              className="text-sm font-semibold text-mint"
            >
              {t("common.viewAll")}
            </button>
          ) : null}
        </div>
        {scans.length === 0 ? (
          <p className="card text-base text-muted">{t("home.noScans")}</p>
        ) : (
          scans
            .slice(0, 3)
            .map((s) => (
              <ScanRow key={s.id} scan={s} onOpen={() => onOpenScan(s.id)} />
            ))
        )}

        <div className="mt-2 grid grid-cols-3 gap-3">
          {tiles.map((tile) => (
            <div
              key={tile.key}
              className="flex flex-col items-center gap-2 rounded-3xl border border-line bg-panel p-3 text-center"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white">
                {tile.icon}
              </span>
              <span className="text-sm font-bold text-fg">
                {t(`home.tiles.${tile.key}.title`)}
              </span>
              <span className="text-xs text-muted">
                {t(`home.tiles.${tile.key}.text`)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
