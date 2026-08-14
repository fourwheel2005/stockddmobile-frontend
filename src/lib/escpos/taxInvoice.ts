import { EscPosBuilder } from './EscPosBuilder';
import type { TaxInvoiceData } from '@/api/taxInvoice';

const W = 48; // 80mm = 48 chars (Font A)

const PAYMENT_TH: Record<string, string> = {
  CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตรเครดิต', QR: 'QR Code',
  MIXED: 'ชำระผสม', INSTALLMENT: 'ผ่อนชำระ',
};

const fmtMoney = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

/**
 * ใบกำกับภาษีเต็มรูปแบบ 80mm (FIX-150) — 6 ส่วนตามโครงมาตรฐาน (อ้างอิงตัวอย่าง Advice):
 * 1 บริษัท · 2 ชื่อเอกสาร+ลูกค้า · 3 รายการ · 4 สรุปยอด (VAT ถอดใน + ตัวอักษร) · 5 ชำระเงิน · 6 ท้ายบิล
 */
export function buildTaxInvoice(
  data: TaxInvoiceData,
  opts: { copy?: boolean; openDrawer?: boolean } = {},
): Uint8Array {
  const b = new EscPosBuilder().init().codepage(26);

  // ─── ส่วนที่ 1: บริษัทผู้ขาย ───
  b.align('C')
    .size(2, 2).bold(true).textln(data.company.legalName).bold(false).size(1, 1)
    .textln(data.company.branchLabel)
    .textln(data.company.address)
    .textln(`TAX ID : ${data.company.taxId}`)
    .textln(`โทร : ${data.company.phone}`);

  b.separator('=', W);

  // ─── ส่วนที่ 2: ชื่อเอกสาร + ลูกค้า ───
  b.align('C').bold(true)
    .textln(opts.copy ? 'ใบเสร็จรับเงิน / ใบกำกับภาษี (สำเนา)' : 'ใบเสร็จรับเงิน / ใบกำกับภาษี (ต้นฉบับ)')
    .textln(opts.copy ? 'RECEIPT / TAX INVOICE (COPY)' : 'RECEIPT / TAX INVOICE (ORIGINAL)')
    .bold(false).newline();

  b.align('L');
  b.justify('เลขที่:', data.taxInvoiceNo, W);
  b.justify('วันที่:', fmtDate(data.issuedAt), W);
  b.justify('อ้างอิงบิลขาย:', data.billNo, W);
  b.separator('-', W);
  b.textln(`นามลูกค้า : ${data.customerName}`);
  if (data.customerTaxId) b.textln(`TAX ID : ${data.customerTaxId}`);
  if (data.customerType === 'VAT_REGISTERED' && data.customerBranchCode) {
    b.textln(data.customerBranchCode === '00000'
      ? 'สถานประกอบการ : สำนักงานใหญ่'
      : `สถานประกอบการ : สาขาที่ ${data.customerBranchCode}`);
  }
  b.textln(`ที่อยู่ : ${data.customerAddress}`);

  b.separator('=', W);

  // ─── ส่วนที่ 3: รายการสินค้า (80mm — 2 บรรทัด/รายการ) ───
  b.bold(true).justify('รายการสินค้า', 'จำนวนเงิน', W).bold(false);
  b.separator('-', W);
  for (const it of data.items) {
    b.textln(`${it.seq}. ${it.productName}${it.sku ? ` [${it.sku}]` : ''}`);
    if (it.imei || it.serialNumber) {
      b.textln(`   IMEI/Serial : ${it.imei ?? it.serialNumber}`);
    }
    b.justify(`   ${it.quantity} x ${fmtMoney(it.unitPrice)}`, fmtMoney(it.lineTotal), W);
  }

  b.separator('=', W);

  // ─── ส่วนที่ 4: สรุปยอด (VAT ถอดใน — ราคาขายรวม VAT แล้ว) ───
  b.justify('รวม/TOTAL', fmtMoney(data.total), W);
  b.justify('ส่วนลด/DISCOUNT', fmtMoney(data.discount), W);
  // QA FIX-151 (M3): ต้องแสดงค่าส่ง ไม่งั้น NET ≠ TOTAL−DISCOUNT เลขเอกสารภาษีไม่ tie
  if (data.shipping > 0) b.justify('ค่าจัดส่ง/SHIPPING', fmtMoney(data.shipping), W);
  b.bold(true).justify('รวมเงินทั้งสิ้น/NET TOTAL', fmtMoney(data.netTotal), W).bold(false);
  b.justify('ภาษีมูลค่าเพิ่ม/VAT 7%', fmtMoney(data.vat), W);
  b.justify('มูลค่าสินค้า/SUB TOTAL', fmtMoney(data.subTotal), W);
  b.align('C').textln(`(${data.bahtText})`).align('L');

  b.separator('-', W);

  // ─── ส่วนที่ 5: การชำระเงิน ───
  const payLabel = data.paymentMethod ? (PAYMENT_TH[data.paymentMethod] ?? data.paymentMethod) : '-';
  b.justify(payLabel, fmtMoney(data.netTotal), W);
  b.justify('ผู้รับเงิน :', data.cashier, W);

  b.separator('=', W);

  // ─── ส่วนที่ 6: ท้ายบิล (เงื่อนไข) ───
  b.align('L')
    .textln('1.ใบเสร็จรับเงิน/ใบกำกับภาษีฉบับนี้จะสมบูรณ์')
    .textln('  ต่อเมื่อบริษัทได้รับชำระเงินครบถ้วนแล้ว')
    .textln('2.กรุณาตรวจสอบสินค้าและจำนวนเงินทุกครั้ง')
    .textln('3.หากเอกสารไม่ถูกต้อง กรุณาแจ้งภายใน 7 วัน');
  b.newline().align('C').textln(`** โทร ${data.company.phone} **`);

  b.feedAndCut(4);
  if (opts.openDrawer && data.paymentMethod === 'CASH') b.drawerKick(0);
  return b.build();
}
