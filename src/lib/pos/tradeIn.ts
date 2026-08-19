import type { PaymentMethod } from '@/types/api';

interface TradeInGuardInput {
  enabled: boolean;
  variantId?: string | null;
  value: string | number;
  imei: string;
  serialNumber: string;
  batteryHealth: string;
  paymentMethod: PaymentMethod;
  downPayment: number;
}

export function isTradeInActive(
  enabled: boolean, variantId: string | null | undefined, value: string | number,
): boolean {
  const amount = Number(value);
  return enabled && !!variantId && Number.isFinite(amount) && amount > 0;
}

export function getTradeInBlockedReason(input: TradeInGuardInput): string | null {
  if (!input.enabled) return null;
  if (input.paymentMethod === 'MIXED') {
    return 'เทิร์น: ยังไม่รองรับจ่ายแบบผสม (ใช้เงินสด/โอน/ผ่อน)';
  }
  if (!input.variantId) return 'เทิร์น: เลือก SKU ของเครื่องที่รับเทิร์น';
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
