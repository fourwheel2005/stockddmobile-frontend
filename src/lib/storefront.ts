/**
 * ลิงก์ไปเว็บหน้าร้านลูกค้า (storefront) — ใช้บน QR ป้ายแปะเครื่อง (FIX-104).
 *
 * เว็บลูกค้าเป็น BFF ครอบ stock API: เครื่องมือสองแต่ละตัว = 1 สินค้า
 * URL `/products/{serialId}` โดย serialId = SerializedItem.id (UUID) ของ stock ตรง ๆ
 * → ยิง QR แล้วเปิดหน้าเครื่องนั้น เห็นรายละเอียดครบ + กดซื้อได้เลย
 *
 * Production ยึด canonical domain ของร้านเสมอ; VITE_STOREFRONT_URL ใช้ override เฉพาะตอน dev.
 */
const CANONICAL_STOREFRONT_URL = 'https://www.ddmobileshop.com';
const STOREFRONT_URL = (import.meta.env.DEV
  ? import.meta.env.VITE_STOREFRONT_URL || CANONICAL_STOREFRONT_URL
  : CANONICAL_STOREFRONT_URL
).replace(/\/+$/, '');

/** URL หน้าสินค้าของเครื่องนี้บนเว็บลูกค้า (serialId = SerializedItem.id). */
export function deviceProductUrl(serialId: string): string {
  return `${STOREFRONT_URL}/products/${encodeURIComponent(serialId)}`;
}

/** ลิงก์สั้นของเครื่องบน canonical storefront; /d/{code} resolve exact variant ฝั่ง server. */
export function deviceShortUrl(stockCode: string): string {
  return `${STOREFRONT_URL}/d/${encodeURIComponent(stockCode)}`;
}
