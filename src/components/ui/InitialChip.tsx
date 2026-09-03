interface Props {
  /** ตัวอักษรย่อ 1–2 ตัว เช่น "ตา", "ยาย", "นข" */
  initials: string;
  /** สีประจำตัว (tailwind bg/text) — ค่าเริ่มต้นสีเทา */
  colorClass?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * ป้ายวงกลมตัวอักษรย่อ แทน emoji บุคคล/แบรนด์ (ตา/ยาย, พาร์ทเนอร์ส่ง) ที่ render ต่างกันแต่ละเครื่อง
 * ความหมายอยู่ที่ข้อความข้าง ๆ เสมอ ป้ายเป็นแค่ตัวช่วยกวาดสายตา.
 */
export function InitialChip({ initials, colorClass = 'bg-slate-200 text-slate-700', size = 'sm', className = '' }: Props) {
  const dimension = size === 'sm' ? 'h-5 min-w-5 px-1 text-[10px]' : 'h-7 min-w-7 px-1.5 text-xs';
  return (
    <span aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none ${dimension} ${colorClass} ${className}`}>
      {initials}
    </span>
  );
}

/** สีประจำเจ้าของร้าน — ใช้ที่เดียวทั้งระบบ */
export const OWNER_CHIP = {
  GRANDPA: { initials: 'ตา', colorClass: 'bg-sky-100 text-sky-800' },
  GRANDMA: { initials: 'ยาย', colorClass: 'bg-pink-100 text-pink-800' },
} as const;

/** ป้ายย่อพาร์ทเนอร์จัดส่ง — ใช้ร่วมกันหน้า POS และ Dashboard */
export const SHIPPING_PARTNER_CHIP: Record<string, { initials: string; colorClass: string }> = {
  ICE:        { initials: 'นข', colorClass: 'bg-sky-100 text-sky-800' },
  YUEM_MAI:   { initials: 'ยม', colorClass: 'bg-amber-100 text-amber-800' },
  PEE_KEAW:   { initials: 'ขว', colorClass: 'bg-emerald-100 text-emerald-800' },
  GREATER:    { initials: 'GT', colorClass: 'bg-violet-100 text-violet-800' },
  RED_HEAT:   { initials: 'RH', colorClass: 'bg-rose-100 text-rose-800' },
  AMP_MOBILE: { initials: 'AM', colorClass: 'bg-indigo-100 text-indigo-800' },
  PICKUP:     { initials: 'รับ', colorClass: 'bg-slate-200 text-slate-700' },
  OTHER:      { initials: 'อื่น', colorClass: 'bg-slate-200 text-slate-700' },
};
