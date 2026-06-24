/**
 * บีบ/ย่อรูปก่อนอัปโหลด — กัน DB (bytea) บวมจากรูปมือถือไฟล์ใหญ่ (10-25MB).
 * ย่อด้านยาวสุดไม่เกิน maxDim + เข้ารหัส JPEG quality → ปกติเหลือ ~0.3-2MB
 *
 * Best-effort: ถ้าถอดรหัสไม่ได้ (เช่น HEIC บน Chrome) หรือผลใหญ่กว่าเดิม → คืนไฟล์เดิม
 * (ฝั่ง server ยังรับได้ถึง 25MB เป็น safety net)
 */
export interface CompressOptions {
  maxDim?: number;      // ด้านยาวสุด (px) — default 2000
  quality?: number;     // JPEG quality 0-1 — default 0.82
  skipUnderBytes?: number; // ไฟล์เล็กกว่านี้ไม่ต้องบีบ — default 600KB
}

export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const maxDim = opts.maxDim ?? 2000;
  const quality = opts.quality ?? 0.82;
  const skipUnder = opts.skipUnderBytes ?? 600 * 1024;

  if (!file.type.startsWith('image/')) return file;          // ไม่ใช่รูป (เช่น PDF) → ไม่แตะ
  if (file.size <= skipUnder) return file;                   // เล็กอยู่แล้ว → ข้าม

  try {
    const bitmap = await loadBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    if ('close' in bitmap) (bitmap as ImageBitmap).close?.();

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob || blob.size >= file.size) return file;        // บีบแล้วไม่เล็กลง → ใช้ของเดิม

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;  // ถอดรหัสไม่ได้ (HEIC บางเบราว์เซอร์ ฯลฯ) → คืนของเดิม
  }
}

/** โหลดรูปเป็น bitmap — ใช้ createImageBitmap ถ้ามี (เร็ว), ไม่งั้น fallback <img> */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode failed'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
