import type { Role } from '@/types/api';

/**
 * หน้าแรกของแต่ละ role — ใช้ทั้งหลัง login, HomeRedirect และตอนเข้าหน้าที่ไม่มีสิทธิ์
 * (ต้องเป็นหน้าที่ role นั้นเข้าได้จริง ไม่งั้นเด้งวน)
 * STAFF ไม่มี Dashboard (FIX-102) · ช่าง (FIX-234) เริ่มที่งานซ่อม
 */
export function homePathFor(role?: Role | null): string {
  if (role === 'STAFF') return '/pos';
  if (role === 'TECHNICIAN') return '/repairs';
  return '/';
}

/** หน้าขาย/เงิน (POS เก๊ะ บิล มัดจำ ใบจัดส่ง) — ช่างไม่เข้า (FIX-234) */
export const FRONT_COUNTER_ROLES: Role[] = ['ADMIN', 'MANAGER', 'STAFF'];
/** งานซ่อม — ทุก role ที่ทำงานหน้าร้าน + ช่าง */
export const REPAIR_ROLES: Role[] = ['ADMIN', 'MANAGER', 'STAFF', 'TECHNICIAN'];
