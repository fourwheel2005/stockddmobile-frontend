import { useEffect } from 'react';

/**
 * Standard modal chrome behavior:
 *  - lock body scroll (กันเลื่อนหน้าหลังเวลา modal เปิด)
 *  - ESC → onClose
 *  - mount/unmount cleanup
 *
 * ใช้ใน modal ทุกตัวเพื่อ UX ที่สม่ำเสมอ.
 */
export function useModalChrome(onClose: () => void) {
  useEffect(() => {
    // 1) lock body scroll
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;

    // 2) ESC to close
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Get backdrop click handler — ปิด modal เมื่อกดนอก dialog box.
 * ใช้คู่กับ <div onClick={onBackdropClick}> เป็น overlay
 * และ <div onClick={(e) => e.stopPropagation()}> เป็น dialog box ด้านใน.
 */
export function backdropCloseHandler(onClose: () => void) {
  return (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
}
