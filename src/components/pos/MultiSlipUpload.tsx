import { useState } from 'react';
import { Upload, X, Image as ImageIcon, Plus, Info, Paperclip } from 'lucide-react';
import toast from 'react-hot-toast';
import { filesApi } from '@/api/files';
import { extractErrorMessage } from '@/api/client';
import { compressImage } from '@/lib/imageCompress';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;   // ตรงกับเพดาน backend (/files)

export interface SlipEntry {
  fileId: string;
  /** blob URL สำหรับแสดงพรีวิว (revoke เมื่อลบ/unmount) */
  previewUrl: string;
  /** ชื่อ + ขนาดไฟล์ (สำหรับ a11y / tooltip) */
  fileName?: string;
}

interface Props {
  slips: SlipEntry[];
  onChange: (next: SlipEntry[]) => void;
  /** highlight แดงถ้าจำเป็นแต่ยังไม่มีสลิป */
  required?: boolean;
  /** จำกัดจำนวนใบสลิป (default 5) */
  maxFiles?: number;
}

const DEFAULT_MAX_FILES = 5;

/**
 * V31 Q1 — รองรับ "สลิปโอน หลายใบ" ใน 1 บิล
 *
 *  - แสดง grid thumbnails ของสลิปที่อัปโหลดแล้ว
 *  - ปุ่ม "+ เพิ่มสลิป" เลือก 1 หรือหลายไฟล์พร้อมกัน
 *  - ลบทีละใบได้ + revoke blob URL ทันทีกัน memory leak
 *  - ห้ามเกิน {@code maxFiles}
 */
export function MultiSlipUpload({ slips, onChange, required, maxFiles = DEFAULT_MAX_FILES }: Props) {
  const [uploading, setUploading] = useState(false);
  const showEmptyError = required && slips.length === 0;

  async function handleFiles(files: File[]) {
    const slots = maxFiles - slips.length;
    if (slots <= 0) {
      toast.error(`อัปโหลดได้สูงสุด ${maxFiles} ใบเท่านั้น`);
      return;
    }
    // รับเฉพาะรูป/PDF (กันไฟล์แปลก) — ไฟล์ที่ไม่ผ่านแจ้งชื่อชัด แทนจะเงียบ/Network Error
    const valid = files.filter((f) => {
      if (!f.type.startsWith('image/') && f.type !== 'application/pdf') {
        toast.error(`"${f.name}" ไม่ใช่รูปหรือ PDF`);
        return false;
      }
      return true;
    });
    const toUpload = valid.slice(0, slots);
    if (toUpload.length < valid.length) {
      toast(`อัปโหลดเเค่ ${toUpload.length}/${valid.length} ใบ (เต็มแล้ว)`);
    }
    if (toUpload.length === 0) return;

    setUploading(true);
    try {
      const newEntries: SlipEntry[] = [];
      for (const f of toUpload) {
        // บีบรูปก่อนอัป (เหมือนรูปสินค้า) — iPad ถ่าย HEIC/ไฟล์ใหญ่หลาย MB อัปดิบผ่านเน็ตช้า
        // แล้ว connection reset → "Network Error"; บีบเหลือ ~0.3-2MB + แปลงเป็น JPEG · PDF ผ่านไม่แตะ
        const prepared = await compressImage(f);
        if (prepared.size > MAX_UPLOAD_BYTES) {
          toast.error(`"${f.name}" ใหญ่เกิน 25MB — ถ่าย/ย่อใหม่แล้วลองอีกครั้ง`);
          continue;
        }
        const uploaded = await filesApi.uploadSlip(prepared);
        newEntries.push({
          fileId: uploaded.id,
          previewUrl: URL.createObjectURL(prepared),
          fileName: f.name,
        });
      }
      if (newEntries.length === 0) return;
      onChange([...slips, ...newEntries]);
      toast.success(`แนบสลิป ${newEntries.length} ใบสำเร็จ`);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) handleFiles(files);
    e.target.value = '';
  }

  function removeSlip(idx: number) {
    const target = slips[idx];
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
    onChange(slips.filter((_, i) => i !== idx));
  }

  return (
    <div className={`rounded-md border p-2 ${
      showEmptyError ? 'border-red-300 bg-red-50' :
      slips.length > 0 ? 'border-emerald-300 bg-emerald-50' :
                          'border-slate-300 bg-slate-50'
    }`}>
      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
        <span>
          <Paperclip className="inline h-4 w-4 align-[-2px]" /> สลิปโอนเงิน ({slips.length}/{maxFiles})
          {showEmptyError && <span className="ml-1 text-red-600">* จำเป็น</span>}
        </span>
      </div>

      {/* Thumbnails grid */}
      {slips.length > 0 && (
        <div className="mb-2 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {slips.map((s, idx) => (
            <div key={s.fileId} className="group relative aspect-square overflow-hidden rounded border border-slate-200 bg-white">
              {s.previewUrl ? (
                <img src={s.previewUrl} alt={s.fileName ?? `สลิป ${idx + 1}`}
                     className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-slate-400">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5 text-[10px] font-semibold text-white">
                #{idx + 1}
              </div>
              <button
                type="button"
                onClick={() => removeSlip(idx)}
                className="absolute right-0.5 top-0.5 rounded-full bg-red-600 p-0.5 text-white opacity-0 transition group-hover:opacity-100"
                title="ลบสลิปใบนี้">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add button — disabled if at max */}
      {slips.length < maxFiles && (
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-slate-300 bg-white px-3 py-2 text-xs text-slate-600 hover:bg-slate-50">
          {uploading ? (
            <>กำลังอัปโหลด...</>
          ) : slips.length === 0 ? (
            <>
              <Upload className="h-4 w-4" />
              เลือกสลิป (เลือกได้หลายไฟล์)
            </>
          ) : (
            <>
              <Plus className="h-4 w-4" />
              เพิ่มสลิปอีกใบ
            </>
          )}
          <input type="file" multiple accept="image/*,application/pdf" className="hidden"
                 disabled={uploading}
                 onChange={handleInput} />
        </label>
      )}

      <p className="mt-1 text-[10px] text-slate-500">
        <Info className="inline h-3.5 w-3.5 align-[-2px]" /> รองรับ JPG / PNG / PDF — อัปโหลดได้สูงสุด {maxFiles} ใบ
      </p>
    </div>
  );
}
