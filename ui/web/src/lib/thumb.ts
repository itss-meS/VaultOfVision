export async function makeThumb(file: Blob, side = 96): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";
    const edge = Math.min(bitmap.width, bitmap.height);
    ctx.drawImage(
      bitmap,
      (bitmap.width - edge) / 2,
      (bitmap.height - edge) / 2,
      edge,
      edge,
      0,
      0,
      side,
      side,
    );
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return "";
  }
}
