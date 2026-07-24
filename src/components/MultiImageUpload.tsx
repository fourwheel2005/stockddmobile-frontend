import { useState } from 'react';
import { ImageIcon, Loader2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { AuthImage } from '@/components/AuthImage';
import { filesApi } from '@/api/files';
import { extractErrorMessage } from '@/api/client';
import { compressImage } from '@/lib/imageCompress';

interface Props {
  images: string[];
  uploading: boolean;
  dragOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onSelect: (files: File[]) => void;
  onRemove: (idx: number) => void;
  onMakeCover: (idx: number) => void;
}

/** แกลเลอรีอัปโหลดรูปหลายรูป (รูปแรก = ปก) — controlled ผ่าน props. */
export function MultiImageUpload({
  images, uploading, dragOver,
  onDragOver, onDragLeave, onDrop, onSelect, onRemove, onMakeCover,
}: Props) {
  return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
         className={`rounded-xl border-2 border-dashed p-3 transition-all
                     ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300'}`}>
      <div className="flex flex-wrap gap-2">
        {images.map((url, idx) => (
          <div key={url + idx} className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 group">
            <AuthImage src={url} alt={`img-${idx}`} className="h-full w-full object-cover" />
            {idx === 0 && (
              <span className="absolute bottom-0 left-0 right-0 bg-brand-600/90 py-0.5 text-center text-[10px] font-semibold text-white">
                ปก
              </span>
            )}
            <button type="button" onClick={() => onRemove(idx)}
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black"
                    title="ลบรูป">
              <X className="h-3 w-3" />
            </button>
            {idx !== 0 && (
              <button type="button" onClick={() => onMakeCover(idx)}
                      className="absolute bottom-0 left-0 right-0 bg-black/55 py-0.5 text-center text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
                      title="ตั้งเป็นรูปปก">
                ตั้งเป็นปก
              </button>
            )}
          </div>
        ))}
        <label className="grid h-20 w-20 shrink-0 cursor-pointer place-items-center rounded-lg bg-slate-100 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600">
          <input type="file" accept="image/*" multiple className="hidden"
                 onChange={(e) => { onSelect(Array.from(e.target.files || [])); e.target.value = ''; }} />
          {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImageIcon className="h-6 w-6" />}
        </label>
      </div>
      <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
        <Upload className="h-3.5 w-3.5" /> ลาก-วาง/เลือกหลายไฟล์ · JPG/PNG/WebP/HEIC · ไม่เกิน 25MB/รูป (ระบบย่อให้อัตโนมัติ)
        {images.length > 0 && <span className="ml-auto font-medium text-slate-600">{images.length} รูป</span>}
      </div>
    </div>
  );
}

/**
 * ตัวแก้รูปแบบครบจบในตัว — รับ value/onChange เป็น string[] (URL)
 * จัดการ upload + remove + ตั้งปก ภายในเอง · ใช้ในจุดที่อยากได้ง่ายๆ (เช่น EditSerialModal).
 */
export function ImageEditor({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const upload = async (files: File[]) => {
    const ok = files.filter((f) => {
      if (!f.type.startsWith('image/')) { toast.error(`"${f.name}" ไม่ใช่ไฟล์รูป`); return false; }
      if (f.size > 25 * 1024 * 1024) { toast.error(`"${f.name}" เกิน 25MB`); return false; }
      return true;
    });
    if (!ok.length) return;
    setUploading(true);
    try {
      const compressed = await Promise.all(ok.map((f) => compressImage(f)));
      const up = await Promise.all(compressed.map((f) => filesApi.upload(f, { normalize: true })));
      onChange([...value, ...up.map((u) => u.url)]);
      toast.success(`อัปโหลด ${up.length} รูป`, { duration: 1000 });
    } catch (e) { toast.error(extractErrorMessage(e)); }
    finally { setUploading(false); }
  };

  return (
    <MultiImageUpload
      images={value} uploading={uploading} dragOver={dragOver}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); upload(Array.from(e.dataTransfer.files || [])); }}
      onSelect={(files) => upload(files)}
      onRemove={(i) => onChange(value.filter((_, k) => k !== i))}
      onMakeCover={(i) => { if (i <= 0) return; const n = [...value]; const [p] = n.splice(i, 1); n.unshift(p); onChange(n); }}
    />
  );
}
