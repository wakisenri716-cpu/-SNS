// Shrinks a photo on the device before sending it: longest side at most
// `maxSide` px, as JPEG. Keeps uploads small (~100–200KB) and drops the
// original file's metadata (such as GPS location) since only pixels are drawn.
export async function resizeImageToDataUrl(file: File, maxSide: number, quality = 0.82): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
