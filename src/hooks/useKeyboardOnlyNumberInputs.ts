import { useEffect } from 'react';

const STEP_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown']);

export function isNumberInput(target: EventTarget | null): target is HTMLInputElement {
  return typeof HTMLInputElement !== 'undefined'
    && target instanceof HTMLInputElement
    && target.type === 'number';
}

/**
 * เลื่อนล้อเมาส์บนช่องตัวเลขที่ focus อยู่ → blur ก่อน browser จะเปลี่ยนค่า (หน้ายังเลื่อนตามปกติ).
 * React ผูก wheel แบบ passive จึง preventDefault ไม่ได้ — ใช้ blur แทนเป็นวิธีมาตรฐาน.
 */
export function handleNumberWheel(event: Pick<WheelEvent, 'target'>): boolean {
  const target = event.target;
  if (!isNumberInput(target) || target !== target.ownerDocument.activeElement) return false;
  target.blur();
  return true;
}

/** ลูกศร/PageUp/PageDown บนช่องตัวเลข → ไม่ให้เพิ่ม/ลดค่าเอง (พิมพ์ตัวเลขเท่านั้น) */
export function handleNumberStepKey(event: Pick<KeyboardEvent, 'target' | 'key' | 'preventDefault'>): boolean {
  if (!isNumberInput(event.target) || !STEP_KEYS.has(event.key)) return false;
  event.preventDefault();
  return true;
}

/**
 * ทั้งระบบ: ช่องตัวเลขรับเฉพาะการพิมพ์ — กันล้อเมาส์และปุ่มลูกศรเปลี่ยนยอดโดยไม่ตั้งใจ
 * (FIX-206 เริ่มที่หน้า POS · FIX-233 ขยายทุกหน้า รวมเปิด/ปิดเก๊ะ). ลูกศรขึ้น/ลงซ่อนด้วย CSS ใน index.css.
 * เรียกครั้งเดียวที่ App — ผูกที่ document จึงครอบ modal ที่ render ผ่าน portal ด้วย.
 */
export function useKeyboardOnlyNumberInputs(): void {
  useEffect(() => {
    const onWheel = (event: WheelEvent) => { handleNumberWheel(event); };
    const onKeyDown = (event: KeyboardEvent) => { handleNumberStepKey(event); };
    document.addEventListener('wheel', onWheel, { capture: true, passive: true });
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('wheel', onWheel, { capture: true });
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
}
