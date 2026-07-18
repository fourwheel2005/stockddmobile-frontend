import { useEffect } from 'react';
import toast from 'react-hot-toast';

/**
 * ตรวจจับว่ามีเวอร์ชัน frontend ใหม่ deploy แล้วหรือยัง (FIX-095).
 *
 * ปัญหา: แท็บ POS เปิดค้างทั้งวัน + refresh token ยังไม่หมด → axios refresh เงียบๆ
 * → หน้าเว็บไม่เคย full-reload → รันโค้ด JS เก่าค้างเป็นวันๆ (เห็นของเก่าแม้ deploy แล้ว)
 *
 * วิธี: ตอน build ฝัง `__BUILD_ID__` + เขียน `/version.json` ด้วย id เดียวกัน
 * poll version.json (ทุก 5 นาที + ตอนสลับกลับมาที่แท็บ) ถ้า id ต่างจากที่โหลดไว้
 * = มี deploy ใหม่ → เด้ง toast ค้างไว้ให้ "แตะเพื่อโหลดเวอร์ชันใหม่"
 *
 * ใช้ toast (ไม่ auto-reload) กันข้อมูลในตะกร้า/ฟอร์มหายกลางคัน — ให้ผู้ใช้กดเองตอนสะดวก.
 */
export function useVersionCheck() {
  useEffect(() => {
    const current = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : '';
    if (!current) return;   // dev mode (ไม่ได้ build) → ข้าม
    let notified = false;

    const check = async () => {
      if (notified) return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { v?: string };
        if (data.v && data.v !== current) {
          notified = true;
          toast(
            (t) => (
              <span className="flex items-center gap-3">
                <span>🔄 มีเวอร์ชันใหม่ของระบบแล้ว</span>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-md bg-brand-600 px-3 py-1 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  โหลดใหม่
                </button>
                <button
                  onClick={() => toast.dismiss(t.id)}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  ภายหลัง
                </button>
              </span>
            ),
            { id: 'app-update', duration: Infinity, icon: null },
          );
        }
      } catch {
        /* เน็ตสะดุด/ไฟล์ไม่มี → เงียบ ลองใหม่รอบหน้า */
      }
    };

    const id = setInterval(check, 5 * 60_000);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    check();   // เช็คทันทีตอนโหลดหน้า

    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);
}
