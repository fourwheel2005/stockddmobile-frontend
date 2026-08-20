import type { PaymentMethod } from '@/types/api';

export const TRADE_IN_INTAKE_POLICY = {
  newIdentifierOnly: 'รับเฉพาะเครื่องที่ IMEI/Serial ไม่เคยอยู่ในระบบ',
  modelSource: 'เลือกรุ่นของเครื่องลูกค้าจากแคตตาล็อก ไม่ได้เลือกหรือตัดเครื่องใน Stock',
  destination: 'หลังปิดบิล เครื่องจะไปหมวดรอลงสต็อกและยังขายไม่ได้จนกว่าจะตรวจรับ',
} as const;

interface TradeInGuardInput {
  enabled: boolean;
  productId?: string | null;
  color: string;
  storage: string;
  value: string | number;
  imei: string;
  serialNumber: string;
  batteryHealth: string;
  paymentMethod: PaymentMethod;
  downPayment: number;
}

export function isTradeInActive(
  enabled: boolean, productId: string | null | undefined, value: string | number,
): boolean {
  const amount = Number(value);
  return enabled && !!productId && Number.isFinite(amount) && amount > 0;
}

export function getTradeInBlockedReason(input: TradeInGuardInput): string | null {
  if (!input.enabled) return null;
  if (input.paymentMethod === 'MIXED') {
    return 'เทิร์น: ยังไม่รองรับจ่ายแบบผสม (ใช้เงินสด/โอน/ผ่อน)';
  }
  if (!input.productId) return 'เทิร์น: เลือกรุ่นของเครื่องที่ลูกค้านำมา';
  if (!input.color.trim()) return 'เทิร์น: กรอกสีของเครื่องที่ลูกค้านำมา';
  if (!input.storage.trim()) return 'เทิร์น: กรอกความจุของเครื่องที่ลูกค้านำมา';
  const value = Number(input.value);
  if (!Number.isFinite(value) || value < 0.01) return 'เทิร์น: กรอกมูลค่าตีเทิร์นอย่างน้อย 0.01 บาท';
  if (value > 9_999_999.99) return 'เทิร์น: มูลค่าตีเทิร์นเกินวงเงินสูงสุด';
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-8) {
    return 'เทิร์น: มูลค่าตีเทิร์นใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง';
  }
  const imei = input.imei.trim();
  const hasRealImei = imei.length > 0 && !/^0+$/.test(imei);
  if (!hasRealImei && !input.serialNumber.trim()) {
    return 'เทิร์น: กรอก IMEI หรือ Serial ของเครื่องเก่า';
  }
  if (input.batteryHealth.trim()) {
    const battery = Number(input.batteryHealth);
    if (!Number.isInteger(battery) || battery < 0 || battery > 100) {
      return 'เทิร์น: สุขภาพแบตต้องเป็นเลขจำนวนเต็ม 0–100';
    }
  }
  if (input.paymentMethod === 'INSTALLMENT' && value > input.downPayment) {
    return 'เทิร์นดาวน์: มูลค่าเทิร์นเกินเงินดาวน์ — ใช้เทิร์นสด หรือเพิ่มดาวน์';
  }
  return null;
}
