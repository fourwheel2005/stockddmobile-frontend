import type { CreditNoteData } from '@/api/creditNote';
import { formatShopDateTimeCompact } from '@/lib/datetime';
import { EscPosBuilder } from './EscPosBuilder';
import { thaiDisplayWidth } from './cp874';

const W = 48;

function money(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function date(iso: string): string {
  return formatShopDateTimeCompact(iso).split(' ')[0] ?? '-';
}

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/[\r\n\t]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '?').replace(/\s+/g, ' ').trim();
}

function wrap(value: string, width = W): string[] {
  const input = clean(value);
  const lines: string[] = [];
  let current = '';
  let currentWidth = 0;
  for (const char of input) {
    const charWidth = thaiDisplayWidth(char);
    if (current && currentWidth + charWidth > width) {
      lines.push(current.trimEnd());
      current = char === ' ' ? '' : char;
      currentWidth = char === ' ' ? 0 : charWidth;
    } else {
      current += char;
      currentWidth += charWidth;
    }
  }
  if (current) lines.push(current.trimEnd());
  return lines;
}

function wrapped(builder: EscPosBuilder, value: string, prefix = ''): void {
  const width = Math.max(1, W - thaiDisplayWidth(prefix));
  wrap(value, width).forEach((line, index) =>
    builder.textln(`${index === 0 ? prefix : ' '.repeat(thaiDisplayWidth(prefix))}${line}`));
}

function buyerBranch(data: CreditNoteData): string {
  if (data.customerType !== 'VAT_REGISTERED') return 'บุคคลทั่วไป';
  return data.customerBranchCode === '00000'
    ? 'สำนักงานใหญ่'
    : `สาขาที่ ${clean(data.customerBranchCode)}`;
}

/** ใบลดหนี้คืนทั้งบิล บนกระดาษความร้อน 80 มม. */
export function buildCreditNote(data: CreditNoteData, copy = false): Uint8Array {
  const b = new EscPosBuilder().init().codepage(26);
  b.align('C').size(2, 2).bold(true).textln('DD MOBILE').bold(false).size(1, 1);
  b.bold(true); wrap(data.company.legalName).forEach((line) => b.textln(line)); b.bold(false);
  wrap(data.company.branchLabel).forEach((line) => b.textln(line));
  wrap(data.company.address).forEach((line) => b.textln(line));
  b.textln(`เลขประจำตัวผู้เสียภาษี ${clean(data.company.taxId)}`);
  if (clean(data.company.phone)) b.textln(`โทร. ${clean(data.company.phone)}`);
  b.separator('=', W);

  b.bold(true).textln(copy ? 'ใบลดหนี้ (สำเนา)' : 'ใบลดหนี้ (ต้นฉบับ)')
    .textln(copy ? 'CREDIT NOTE (COPY)' : 'CREDIT NOTE (ORIGINAL)').bold(false).newline();
  b.align('L').justify('เลขที่ใบลดหนี้:', clean(data.creditNoteNo), W);
  b.justify('วันที่:', date(data.issuedAt), W);
  b.justify('ใบกำกับภาษีเดิม:', clean(data.originalTaxInvoiceNo), W);
  b.justify('วันที่ใบกำกับเดิม:', date(data.originalTaxInvoiceIssuedAt), W);
  b.justify('อ้างอิงบิลขาย:', clean(data.billNo), W);
  b.separator('-', W);

  b.bold(true).textln('ข้อมูลผู้ซื้อสินค้า / ผู้รับบริการ').bold(false);
  wrapped(b, data.customerName, 'ชื่อ: ');
  if (data.customerTaxId) wrapped(b, data.customerTaxId, 'TAX ID ผู้ซื้อ: ');
  wrapped(b, buyerBranch(data), 'สถานประกอบการ: ');
  wrapped(b, data.customerAddress, 'ที่อยู่: ');
  b.separator('=', W);

  b.bold(true).textln('เหตุผลการออกใบลดหนี้').bold(false);
  wrapped(b, data.reason);
  b.separator('-', W);
  b.bold(true).justify('รายการที่รับคืน', 'จำนวนเงิน', W).bold(false);
  data.items.forEach((item) => {
    wrapped(b, `${item.seq}. ${item.productName}`);
    if (item.sku) wrapped(b, item.sku, '   รหัสสินค้า: ');
    if (item.imei) wrapped(b, item.imei, '   IMEI: ');
    if (item.serialNumber) wrapped(b, item.serialNumber, '   Serial: ');
    b.justify(`   ${item.quantity} x ${money(item.unitPrice)}`, money(item.lineTotal), W);
  });
  b.separator('=', W);
  b.justify('มูลค่าตามใบกำกับเดิม', money(data.originalValue), W);
  b.justify('มูลค่าที่ถูกต้อง', money(data.correctValue), W);
  b.bold(true).justify('ผลต่างที่ลดลง', money(data.difference), W).bold(false);
  b.justify('VAT ที่คืนให้ลูกค้า', money(data.vatAmount), W);
  b.justify('มูลค่าก่อน VAT ที่ลดลง', money(data.subtotalDifference), W);
  b.align('C'); wrap(`(${data.bahtText})`).forEach((line) => b.textln(line));
  b.align('L').separator('-', W);
  b.justify('ออกโดย:', clean(data.issuedBy) || '-', W);
  b.textln('ผู้รับเงินคืน ______________________________');
  b.textln('วันที่ ____ / ____ / ______');
  b.align('C').newline().bold(true).size(2, 1).textln('ขอบคุณครับ').size(1, 1).bold(false);
  b.feedAndCut(4);
  return b.build();
}
