import { useEffect } from 'react';

/** class บน <body> ขณะเปิดหน้า POS — CSS ใน index.css ซ่อนลูกศรขึ้น/ลงของช่องตัวเลข */
export const KEYBOARD_ONLY_NUMBER_CLASS = 'pos-keyboard-only-numbers';

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
 * หน้า POS: ช่องตัวเลขรับเฉพาะการพิมพ์ (FIX-206) — ซ่อนลูกศร, กันล้อเมาส์และปุ่มลูกศรเปลี่ยนราคาโดยไม่ตั้งใจ.
 * ผูกที่ document + class บน body เพื่อครอบ modal ที่ render ผ่าน portal ด้วย · ถอดออกเมื่อออกจากหน้า.
 */
export function useKeyboardOnlyNumberInputs(): void {
  useEffect(() => {
    document.body.classList.add(KEYBOARD_ONLY_NUMBER_CLASS);
    const onWheel = (event: WheelEvent) => { handleNumberWheel(event); };
    const onKeyDown = (event: KeyboardEvent) => { handleNumberStepKey(event); };
    document.addEventListener('wheel', onWheel, { capture: true, passive: true });
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.classList.remove(KEYBOARD_ONLY_NUMBER_CLASS);
      document.removeEventListener('wheel', onWheel, { capture: true });
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
}
