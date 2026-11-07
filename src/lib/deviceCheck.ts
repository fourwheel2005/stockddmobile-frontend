import type { DeviceCheck, DeviceCheckStatus, DeviceGrade, DeviceInspection } from '@/types/api';

/**
 * ผลตรวจสภาพเครื่องมือสอง (FIX-220) — โชว์ลูกค้าบนเว็บในกล่อง "ข้อมูลสภาพเครื่อง"
 * ทุกช่องไม่บังคับ · ใช้ร่วมกันตอนรับเข้า / เครื่องมัดจำถึง / แก้ไขเครื่อง
 */

export const CHECK_STATUS: { value: DeviceCheckStatus; label: string; cls: string }[] = [
  { value: 'OK', label: 'ปกติ', cls: 'border-emerald-500 bg-emerald-50 text-emerald-700' },
  { value: 'MINOR', label: 'มีรอยเล็กน้อย', cls: 'border-amber-500 bg-amber-50 text-amber-700' },
  { value: 'ISSUE', label: 'มีปัญหา', cls: 'border-red-500 bg-red-50 text-red-700' },
];

/** ข้อตรวจ 4 ข้อ — ชื่อตรงกับแถวบนเว็บ */
export const CHECK_ITEMS = [
  { key: 'screen', noteKey: 'screenNote', label: 'หน้าจอ' },
  { key: 'body', noteKey: 'bodyNote', label: 'ตัวเครื่อง/บอดี้' },
  { key: 'camera', noteKey: 'cameraNote', label: 'กล้อง' },
  { key: 'faceId', noteKey: 'faceIdNote', label: 'Face ID / สแกนนิ้ว' },
] as const;

/** เกณฑ์เกรด — ข้อความเดียวกับที่เว็บอธิบายลูกค้า (lib/gradeInfo ฝั่งเว็บ) */
export const GRADE_OPTIONS: { value: DeviceGrade; label: string }[] = [
  { value: 'A', label: 'A — สภาพดีมาก ตำหนิน้อยมากหรือแทบมองไม่เห็น' },
  { value: 'B', label: 'B — สภาพดี มีร่องรอยการใช้งานทั่วไปเล็กน้อย' },
  { value: 'C', label: 'C — มีตำหนิเห็นได้ชัด แต่ใช้งานได้ปกติ' },
  { value: 'D', label: 'D — สภาพมีตำหนิมาก เน้นใช้งานเป็นหลัก' },
];

/** ฟอร์ม: ทุกช่องเป็น string ('' = ไม่ระบุ) */
export interface DeviceCheckForm {
  grade: DeviceGrade | '';
  screen: DeviceCheckStatus | ''; screenNote: string;
  body: DeviceCheckStatus | ''; bodyNote: string;
  camera: DeviceCheckStatus | ''; cameraNote: string;
  faceId: DeviceCheckStatus | ''; faceIdNote: string;
  conditionNote: string;
}

export const EMPTY_CHECK: DeviceCheckForm = {
  grade: '', screen: '', screenNote: '', body: '', bodyNote: '', camera: '', cameraNote: '',
  faceId: '', faceIdNote: '', conditionNote: '',
};

export function checkFormFrom(i: DeviceCheck | DeviceInspection | null | undefined): DeviceCheckForm {
  if (!i) return { ...EMPTY_CHECK };
  return {
    grade: i.grade ?? '',
    screen: i.screen ?? '', screenNote: i.screenNote ?? '',
    body: i.body ?? '', bodyNote: i.bodyNote ?? '',
    camera: i.camera ?? '', cameraNote: i.cameraNote ?? '',
    faceId: i.faceId ?? '', faceIdNote: i.faceIdNote ?? '',
    conditionNote: i.conditionNote ?? '',
  };
}

export function isCheckEmpty(f: DeviceCheckForm): boolean {
  return Object.values(f).every((v) => String(v).trim() === '');
}

/**
 * ฟอร์ม → คำขอ API
 * รับเข้า (keepEmpty=false): ไม่กรอกอะไรเลย → undefined (ไม่ส่ง) ·
 * แก้ไข (keepEmpty=true): ส่งชุดเต็มเสมอ เพื่อให้ "ล้าง" ได้ (backend แทนที่ทั้งชุด)
 */
export function checkRequest(f: DeviceCheckForm, keepEmpty = false): DeviceCheck | undefined {
  if (!keepEmpty && isCheckEmpty(f)) return undefined;
  const t = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    grade: f.grade || null,
    screen: f.screen || null, screenNote: t(f.screenNote),
    body: f.body || null, bodyNote: t(f.bodyNote),
    camera: f.camera || null, cameraNote: t(f.cameraNote),
    faceId: f.faceId || null, faceIdNote: t(f.faceIdNote),
    conditionNote: t(f.conditionNote),
  };
}

/** สรุปสั้น ๆ สำหรับบรรทัดในตาราง เช่น "เกรด B · กล้องมีปัญหา" */
export function checkSummary(i: DeviceInspection | null | undefined): string | null {
  if (!i) return null;
  const parts: string[] = [];
  if (i.grade) parts.push(`เกรด ${i.grade}`);
  for (const it of CHECK_ITEMS) {
    const v = i[it.key];
    if (v === 'ISSUE') parts.push(`${it.label}มีปัญหา`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
