import type { AccountingReceiptReport, PaymentMethod, ReceiptMethodFilter } from '@/types/api';

/** ตัวเลือกกรองช่องทางบนการ์ดส่งบัญชี — null = ทุกช่องทาง (ตรงกับ "ทั้งหมด" ในไฟล์ของบัญชี) */
export const RECEIPT_METHOD_FILTERS: Array<{ value: ReceiptMethodFilter | null; label: string }> = [
  { value: null, label: 'ทั้งหมด' },
  { value: 'CASH', label: 'เงินสด' },
  { value: 'TRANSFER', label: 'เงินโอน' },
  { value: 'CARD', label: 'บัตร' },
  { value: 'QR', label: 'QR' },
];

/** ยอดรวมของช่องทางที่ระบุ (0 เมื่อไม่มีใบเสร็จช่องทางนั้น) */
export function methodTotal(report: AccountingReceiptReport | undefined, method: PaymentMethod): number {
  return report?.totals.byMethod.find((row) => row.method === method)?.total ?? 0;
}

function sum(values: number[]): number {
  return Math.round(values.reduce((acc, value) => acc + value, 0) * 100) / 100;
}

/**
 * ตรวจสอบว่ายอดสามทางตรงกัน: Σ ตามช่องทาง = Σ ตามประเภท = รายรับรวม
 * ใช้โชว์เครื่องหมายยืนยันบนการ์ด ให้เจ้าของเห็นทันทีก่อนส่งบัญชี
 */
export function totalsTieOut(report: AccountingReceiptReport): boolean {
  const byMethod = sum(report.totals.byMethod.map((row) => row.total));
  const byType = sum(report.totals.byType.map((row) => row.total));
  const received = Math.round(report.totals.receivedTotal * 100) / 100;
  const vatSplit = sum([report.totals.preVatTotal, report.totals.vatTotal]);
  return byMethod === received && byType === received && vatSplit === received;
}

/** ยอดสุทธิที่ควรได้ = รายรับรวม − รายจ่ายและเงินคืน (คำนวณซ้ำฝั่ง client เพื่อ cross-check กับ backend) */
export function expectedNetTotal(report: AccountingReceiptReport): number {
  return sum([report.totals.receivedTotal, -report.expenses.total]);
}

/** ชื่อไฟล์ Excel ให้ตรงกับที่ backend ตั้ง (Content-Disposition) */
export function receiptsExcelFilename(from: string, to: string): string {
  return `DDMobile_receipts_${from}_${to}.xlsx`;
}
