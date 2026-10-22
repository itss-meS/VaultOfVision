import { type ChangeEvent, type ReactNode, useRef } from "react";

interface PhotoInputs {
  openCamera: () => void;
  openGallery: () => void;
  inputs: ReactNode;
}

export function usePhotoInputs(onPhoto: (file: File) => void): PhotoInputs {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  function handle(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onPhoto(file);
  }

  return {
    openCamera: () => camera.current?.click(),
    openGallery: () => gallery.current?.click(),
    inputs: (
      <>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          data-testid="camera-input"
          onChange={handle}
        />
        <input
          ref={gallery}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          data-testid="gallery-input"
          onChange={handle}
        />
      </>
    ),
  };
}
