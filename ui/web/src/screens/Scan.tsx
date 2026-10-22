import { useTranslation } from "react-i18next";
import {
  CameraIcon,
  CloseIcon,
  LeafIcon,
  UploadIcon,
} from "../components/Icons";
import { ErrorBanner, Page } from "../components/Page";
import { usePhotoInputs } from "../components/PhotoInputs";

interface Props {
  error: string | null;
  onPhoto: (file: File) => void;
  onClose: () => void;
  onClear: () => void;
}

export function Scan({ error, onPhoto, onClose, onClear }: Props) {
  const { t } = useTranslation();
  const { openCamera, openGallery, inputs } = usePhotoInputs(onPhoto);
  return (
    <Page
      title={t("scan.title")}
      onBack={onClose}
      backLabel={t("common.close")}
    >
      {inputs}
      <div className="mx-auto flex w-full flex-col items-center gap-4 pt-2">
        <div className="relative flex aspect-square w-full max-w-[340px] items-center justify-center rounded-[32px] border-2 border-brand bg-raised">
          <span className="absolute left-5 top-5 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-mint" />
          <span className="absolute right-5 top-5 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-mint" />
          <span className="absolute bottom-5 left-5 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-mint" />
          <span className="absolute bottom-5 right-5 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-mint" />
          <LeafIcon className="h-24 w-24 text-brand/40 dark:text-mint/40" />
        </div>
        <p className="text-center text-base text-muted">{t("scan.hint")}</p>
        <p className="max-w-[320px] text-center text-sm text-muted">
          {t("scan.tip")}
        </p>
      </div>
      <ErrorBanner message={error} />
      <div className="mt-2 flex items-center justify-between px-4">
        <button
          type="button"
          aria-label={t("scan.gallery")}
          onClick={openGallery}
          className="icon-btn h-14 w-14 text-mint"
        >
          <UploadIcon className="h-6 w-6" />
        </button>
        <button
          type="button"
          aria-label={t("scan.camera")}
          onClick={openCamera}
          className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-bg bg-brand text-white shadow-lift ring-2 ring-brand transition hover:bg-brand-hover active:scale-95"
        >
          <CameraIcon className="h-9 w-9" />
        </button>
        <button
          type="button"
          aria-label={t("scan.clear")}
          onClick={onClear}
          className="icon-btn h-14 w-14 text-muted"
        >
          <CloseIcon className="h-6 w-6" />
        </button>
      </div>
    </Page>
  );
}
