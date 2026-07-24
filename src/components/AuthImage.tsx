import { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import { filesApi } from '@/api/files';

/** ดึง fileId จาก URL ที่ backend คืนมา ("/api/v1/files/{id}" หรือ absolute เต็ม) */
function fileIdFromUrl(src: string): string | null {
  const m = src.match(/\/files\/([^/?#]+)/);
  return m ? m[1] : null;
}

// cache ระดับ session: fileId → object URL (กัน fetch ซ้ำ/กระพริบเวลามีหลายรูป)
const blobCache = new Map<string, Promise<string>>();
function loadBlob(fileId: string): Promise<string> {
  let p = blobCache.get(fileId);
  if (!p) {
    p = filesApi.fetchBlobUrl(fileId).catch((e) => { blobCache.delete(fileId); throw e; });
    blobCache.set(fileId, p);
  }
  return p;
}

/**
 * แสดงรูปจาก backend ที่ endpoint ต้องแนบ Bearer (`GET /api/v1/files/{id}` = @PreAuthorize).
 * `<img src>` ธรรมดายิงเองไม่ได้ (ไม่มี token + ผิด origin บน Vercel) → 401/404 รูปแตกโชว์ "?" (FIX-099).
 * ตัวนี้ fetch ผ่าน axios (มี baseURL+token) เป็น blob แล้วค่อยโชว์ · URL อื่น (blob:/data:/http ภายนอก) โชว์ตรงๆ.
 */
export function AuthImage({
  src, alt, className,
}: { src: string; alt?: string; className?: string }) {
  const fileId = src ? fileIdFromUrl(src) : null;
  const [resolved, setResolved] = useState<string | null>(fileId ? null : (src || null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!fileId) { setResolved(src || null); setFailed(false); return; }
    let alive = true;
    setResolved(null); setFailed(false);
    loadBlob(fileId)
      .then((u) => { if (alive) setResolved(u); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [fileId, src]);

  if (failed) {
    return (
      <div className={`grid place-items-center bg-slate-100 text-slate-300 ${className ?? ''}`}>
        <ImageIcon className="h-6 w-6" />
      </div>
    );
  }
  if (!resolved) {
    return <div className={`animate-pulse bg-slate-100 ${className ?? ''}`} />;
  }
  return <img src={resolved} alt={alt} className={className} />;
}
