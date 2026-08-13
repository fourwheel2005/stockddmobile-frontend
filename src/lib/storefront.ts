/**
 * ลิงก์ไปเว็บหน้าร้านลูกค้า (storefront) — ใช้บน QR ป้ายแปะเครื่อง (FIX-104).
 *
 * เว็บลูกค้าเป็น BFF ครอบ stock API: เครื่องมือสองแต่ละตัว = 1 สินค้า
 * URL `/products/{serialId}` โดย serialId = SerializedItem.id (UUID) ของ stock ตรง ๆ
 * → ยิง QR แล้วเปิดหน้าเครื่องนั้น เห็นรายละเอียดครบ + กดซื้อได้เลย
 *
 * โดเมนตั้งที่ VITE_STOREFRONT_URL (เปลี่ยนที่เดียวเมื่อย้ายโดเมน).
 */
const STOREFRONT_URL = (
  import.meta.env.VITE_STOREFRONT_URL || 'https://ddmobile-website-frontend-main.vercel.app'
).replace(/\/+$/, '');

/** URL หน้าสินค้าของเครื่องนี้บนเว็บลูกค้า (serialId = SerializedItem.id). */
export function deviceProductUrl(serialId: string): string {
  return `${STOREFRONT_URL}/products/${encodeURIComponent(serialId)}`;
}

/** FIX-155: โดเมน BE เว็บลูกค้า (สั้นกว่าโดเมน FE) — ใช้ทำลิงก์สั้นบนป้าย QR. */
const SHORT_LINK_BASE = (
  import.meta.env.VITE_SHORT_LINK_BASE || 'https://ddmobilewebsite.fourwheel.in.th'
).replace(/\/+$/, '');

/** ลิงก์สั้นของเครื่อง (จาก stockCode เช่น DD00004) — ~49 ตัวอักษร = QR v3 สแกนติดบนดวงเล็ก.
 *  ปลายทาง 302 ไปหน้าสินค้าเว็บลูกค้า (website BE /d/{code} — FIX-155). */
export function deviceShortUrl(stockCode: string): string {
  return `${SHORT_LINK_BASE}/d/${encodeURIComponent(stockCode)}`;
}
