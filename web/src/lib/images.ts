/** Redimensiona una foto del móvil a WebP (máx. 1600px) antes de subirla */
export async function resizeImage(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', quality));
  if (blob && blob.type === 'image/webp') return blob;
  // Safari antiguo no exporta WebP
  return new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85));
}
