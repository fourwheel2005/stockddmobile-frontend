import type { TaxInvoiceData } from '@/api/taxInvoice';
import { formatShopDateTimeCompact } from '@/lib/datetime';
import { EscPosBuilder } from './EscPosBuilder';
import { thaiDisplayWidth } from './cp874';

/** Epson/TM compatible 80 mm, Font A. */
const W = 48;
const SHOP_WEBSITE = 'https://www.ddmobileshop.com';

const PAYMENT_TH: Record<string, string> = {
  CASH: 'เงินสด',
  TRANSFER: 'โอนเงิน',
  CARD: 'บัตรเครดิต/เดบิต',
  QR: 'QR Code / พร้อมเพย์',
  MIXED: 'ชำระแบบผสม',
  INSTALLMENT: 'ผ่อนชำระ',
};

function fmtMoney(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string): string {
  return formatShopDateTimeCompact(iso).split(' ')[0] ?? '-';
}

/** Prevent buyer/product text from injecting rows or ESC/POS control commands. */
function cleanText(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapText(value: string, width = W): string[] {
  const input = cleanText(value);
  if (!input) return [];
  const lines: string[] = [];
  let line = '';
  let lineWidth = 0;

  for (const char of input) {
    const charWidth = thaiDisplayWidth(char);
    if (line && lineWidth + charWidth > width) {
      lines.push(line.trimEnd());
      line = char === ' ' ? '' : char;
      lineWidth = char === ' ' ? 0 : charWidth;
    } else {
      line += char;
      lineWidth += charWidth;
    }
  }
  if (line) lines.push(line.trimEnd());
  return lines;
}

function textWrapped(b: EscPosBuilder, value: string, width = W, prefix = ''): void {
  const contentWidth = Math.max(1, width - thaiDisplayWidth(prefix));
  const lines = wrapText(value, contentWidth);
  lines.forEach((line, index) => b.textln(`${index === 0 ? prefix : ' '.repeat(thaiDisplayWidth(prefix))}${line}`));
}

function buyerBranchLabel(data: TaxInvoiceData): string {
  if (data.customerType !== 'VAT_REGISTERED') return 'บุคคลทั่วไป';
  if (data.customerBranchCode === '00000') return 'สำนักงานใหญ่';
  return `สาขาที่ ${cleanText(data.customerBranchCode)}`;
}

/**
 * Combined receipt / full tax invoice for 80 mm thermal paper.
 *
 * The payload remains the immutable tax-invoice snapshot from the backend; this
 * function only lays it out as ESC/POS. Original/copy is derived from the
 * backend print audit before this builder is called.
 */
export function buildTaxInvoice(
  data: TaxInvoiceData,
  opts: { copy?: boolean; openDrawer?: boolean } = {},
): Uint8Array {
  const b = new EscPosBuilder().init().codepage(26);

  // Seller identity
  b.align('C').size(2, 2).bold(true).textln('DD MOBILE').bold(false).size(1, 1);
  b.bold(true);
  wrapText(data.company.legalName).forEach((line) => b.textln(line));
  b.bold(false);
  wrapText(data.company.branchLabel).forEach((line) => b.textln(line));
  wrapText(data.company.address).forEach((line) => b.textln(line));
  b.textln(`เลขประจำตัวผู้เสียภาษี ${cleanText(data.company.taxId)}`);
  if (cleanText(data.company.phone)) b.textln(`โทร. ${cleanText(data.company.phone)}`);
  b.separator('=', W);

  // Document identity
  b.bold(true)
    .textln(opts.copy
      ? 'ใบเสร็จรับเงิน / ใบกำกับภาษี (สำเนา)'
      : 'ใบเสร็จรับเงิน / ใบกำกับภาษี (ต้นฉบับ)')
    .textln(opts.copy
      ? 'RECEIPT / TAX INVOICE (COPY)'
      : 'RECEIPT / TAX INVOICE (ORIGINAL)')
    .bold(false)
    .newline();

  b.align('L');
  b.justify('เลขที่ใบกำกับ:', cleanText(data.taxInvoiceNo), W);
  b.justify('วันที่:', fmtDate(data.issuedAt), W);
  b.justify('อ้างอิงบิลขาย:', cleanText(data.billNo), W);
  b.separator('-', W);

  // Buyer identity
  b.bold(true).textln('ข้อมูลผู้ซื้อสินค้า / ผู้รับบริการ').bold(false);
  textWrapped(b, data.customerName, W, 'ชื่อ: ');
  if (data.customerTaxId) {
    textWrapped(b, data.customerTaxId, W, 'TAX ID ผู้ซื้อ: ');
  }
  textWrapped(b, buyerBranchLabel(data), W, 'สถานประกอบการ: ');
  textWrapped(b, data.customerAddress, W, 'ที่อยู่: ');
  b.separator('=', W);

  // Product/service identity and value
  b.bold(true).justify('รายละเอียดสินค้า / บริการ', 'จำนวนเงิน', W).bold(false);
  b.textln('จำนวน x ราคาต่อหน่วย (ราคานี้รวม VAT)');
  b.separator('-', W);
  data.items.forEach((item) => {
    textWrapped(b, `${item.seq}. ${item.productName}`);
    if (item.sku) textWrapped(b, item.sku, W, '   รหัสสินค้า: ');
    if (item.imei) textWrapped(b, item.imei, W, '   IMEI: ');
    if (item.serialNumber) textWrapped(b, item.serialNumber, W, '   Serial: ');
    b.justify(`   ${item.quantity} x ${fmtMoney(item.unitPrice)}`, fmtMoney(item.lineTotal), W);
  });
  b.separator('=', W);

  // VAT-inclusive totals: all figures originate from the backend snapshot.
  b.justify('รวม/TOTAL', fmtMoney(data.total), W);
  b.justify('ส่วนลด/DISCOUNT', fmtMoney(data.discount), W);
  if (data.shipping > 0) b.justify('ค่าจัดส่ง/SHIPPING', fmtMoney(data.shipping), W);
  b.bold(true).justify('รวมเงินทั้งสิ้น/NET TOTAL', fmtMoney(data.netTotal), W).bold(false);
  b.justify('ภาษีมูลค่าเพิ่ม/VAT 7%', fmtMoney(data.vat), W);
  b.justify('มูลค่าก่อน VAT/SUB TOTAL', fmtMoney(data.subTotal), W);
  b.align('C');
  wrapText(`(${data.bahtText})`).forEach((line) => b.textln(line));
  b.align('L').separator('-', W);

  // Settlement and acknowledgement
  const payment = data.paymentMethod ? PAYMENT_TH[data.paymentMethod] ?? cleanText(data.paymentMethod) : '-';
  b.justify('ชำระโดย:', payment, W);
  b.justify('จำนวนเงินที่ชำระ:', fmtMoney(data.netTotal), W);
  b.justify('ผู้รับเงิน:', cleanText(data.cashier) || '-', W);
  b.newline().textln('ผู้รับสินค้า/บริการ __________________________');
  b.textln('วันที่ ____ / ____ / ______');
  b.separator('=', W);

  // Company-specific footer; do not copy another company's warranty wording.
  b.textln('1. เอกสารนี้สมบูรณ์เมื่อได้รับชำระครบถ้วน');
  b.textln('2. กรุณาตรวจสอบสินค้าและจำนวนเงินทุกครั้ง');
  b.textln('3. โปรดเก็บเอกสารนี้ไว้เป็นหลักฐาน');
  b.align('C').newline().textln(SHOP_WEBSITE);
  b.qrcode(SHOP_WEBSITE, { size: 4, errorCorrection: 'M' }).newline();
  if (cleanText(data.company.phone)) b.textln(`ติดต่อ ${cleanText(data.company.phone)}`);
  b.newline().bold(true).size(2, 1).textln('ขอบคุณครับ').size(1, 1).bold(false);

  b.feedAndCut(4);
  if (opts.openDrawer && data.paymentMethod === 'CASH') b.drawerKick(0);
  return b.build();
}
