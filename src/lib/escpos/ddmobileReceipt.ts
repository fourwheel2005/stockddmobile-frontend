import { EscPosBuilder } from './EscPosBuilder';

/** ความกว้างกระดาษ 80mm font A */
const W = 48;

export interface ReceiptData {
  shop: {
    name: string;
    address?: string | null;
    phone?: string | null;
    taxId?: string | null;
    website?: string | null;
  };
  billNo: string;
  issuedAt: string;       // ISO timestamp
  cashier: string;
  customerName?: string | null;
  customerPhoneMasked?: string | null;
  orderChannel?: 'WALK_IN' | 'ONLINE' | null;
  items: Array<{
    seq: number;
    sku: string;
    productName: string;
    imei?: string | null;
    serialNumber?: string | null;
    color?: string | null;
    storage?: string | null;
    condition?: string | null;   // "มือ 1" / "มือ 2" ฯลฯ
    quantity: number;
    sellPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  shippingFee: number;
  grandTotal: number;
  paidAmount?: number | null;
  changeAmount?: number | null;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  installmentMonths?: number | null;
  downPaymentAmount?: number | null;
  addOnTotal?: number | null;      // อุปกรณ์เสริมจ่ายสดวันนี้ในบิลผ่อน เช่น หัวชาร์จ (FIX-090)
  downCash?: number | null;        // เงินดาวน์ส่วนที่จ่ายสด
  downTransfer?: number | null;    // เงินดาวน์ส่วนที่โอน
  monthlyAmount?: number | null;
  shippingPartner?: string | null;
  shippingTrackingNo?: string | null;
  shippingAddress?: string | null;
  shippingPaidFrom?: string | null;
  shippingFeeGrandpa?: number | null;
  shippingFeeGrandma?: number | null;
  footerMessage?: string;
  qrCodeData?: string;
}

/** IMEI จริง = มีค่า + ไม่ใช่เลข 0 ล้วน (iPad WiFi กรอก 000... = ไม่มี IMEI → ใช้ SN) — FIX-075 */
export const hasRealImei = (imei?: string | null): boolean =>
  !!imei && imei.trim() !== '' && !/^0+$/.test(imei.trim());

const PAYMENT_TH: Record<string, string> = {
  CASH: 'เงินสด',
  CARD: 'บัตรเครดิต/เดบิต',
  TRANSFER: 'โอนเงิน / QR',
  QR: 'QR / พร้อมเพย์',
  INSTALLMENT: 'ผ่อนชำระรายเดือน',
};

const PARTNER_TH: Record<string, string> = {
  ICE: 'น้ำแข็ง',
  YUEM_MAI: 'ยืมมั้ย',
  PEE_KEAW: 'พี่เขียว',
  GREATER: 'กรีทเตอร์',
  RED_HEAT: 'เรด ฮีท',
  AMP_MOBILE: 'แอมป์ โมบาย',
  PICKUP: 'ลูกค้ารับเอง',
  OTHER: 'อื่นๆ',
};

function fmtTHB(n: number | null | undefined): string {
  if (n == null) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * สร้าง bytes สำหรับใบเสร็จ DDMobile.
 *
 * @param data — receipt data จาก backend
 * @param opts.duplicate — true = พิมพ์ซ้ำ → header "(พิมพ์ซ้ำ)"
 * @param opts.openDrawer — true = ส่งคำสั่งเปิดลิ้นชักท้าย bytes
 */
export function buildDDMobileReceipt(
  data: ReceiptData,
  opts: { duplicate?: boolean; openDrawer?: boolean } = {},
): Uint8Array {
  const b = new EscPosBuilder()
    .init()
    .codepage(26); // PC874 Thai — TM-T82V/X-II ใช้ 26 (รุ่นเก่ากว่าใช้ 21)

  // ─── Header ─────────────────────────────────────
  b.align('C')
    .size(2, 2).bold(true).textln(data.shop.name).bold(false).size(1, 1);

  if (data.shop.address) b.textln(data.shop.address);
  if (data.shop.phone) b.textln(`📞 ${data.shop.phone}`);
  if (data.shop.taxId) b.textln(`Tax ID: ${data.shop.taxId}`);

  b.separator('=', W);

  if (opts.duplicate) {
    b.align('C').bold(true).inverse(true).textln(' พิมพ์ซ้ำ — DUPLICATE ').inverse(false).bold(false);
  }

  b.align('C').bold(true).textln('ใบเสร็จรับเงิน / Receipt').bold(false).newline();

  // ─── Bill info ──────────────────────────────────
  b.align('L');
  b.justify('เลขที่บิล:', data.billNo, W);
  b.justify('วันที่:', fmtDateTime(data.issuedAt), W);
  b.justify('ผู้ขาย:', data.cashier, W);
  if (data.customerName) {
    b.justify('ลูกค้า:', data.customerName, W);
  }
  if (data.customerPhoneMasked) {
    b.justify('เบอร์โทร:', data.customerPhoneMasked, W);
  }
  if (data.orderChannel === 'ONLINE') {
    b.justify('ช่องทาง:', 'ออนไลน์', W);
  }

  b.separator('-', W);

  // ผ่อนชำระ → ไม่โชว์ราคาเต็ม/ยอดรวมบนใบเสร็จ (ลูกค้าเห็นเฉพาะยอดดาวน์ที่จ่าย + ค่างวด) — FIX-070
  const hidePrice = data.paymentMethod === 'INSTALLMENT';

  // ─── Items header ───────────────────────────────
  if (hidePrice) {
    b.text('รายการสินค้า').newline();
  } else {
    b.text('รายการ').text(' '.repeat(28)).text('จำนวน').text('  ราคา').text('     รวม').newline();
  }
  b.separator('-', W);

  // ─── Items ──────────────────────────────────────
  data.items.forEach((it) => {
    // Line 1: product name (truncate ถ้ายาวเกิน 36 chars)
    const namePart = it.productName.length > 36
      ? it.productName.substring(0, 35) + '…'
      : it.productName;
    b.bold(true).textln(`${it.seq}. ${namePart}`).bold(false);

    // Line 2: สี / ความจุ / สภาพ (มือ 1-2)
    const spec = [it.color, it.storage, it.condition].filter(Boolean).join(' · ');
    if (spec) b.textln(`   ${spec}`);

    // Line 3: IMEI · ถ้าไม่มี IMEI จริง (iPad WiFi กรอก 000...) → SN · ไม่มีทั้งคู่ → SKU (FIX-075)
    // บิลค่างวด (FIX-085) ไม่มี IMEI/SN/SKU เลย → ข้ามบรรทัดนี้ (กันพิมพ์ "SKU: null")
    if (hasRealImei(it.imei)) {
      b.textln(`   IMEI: ${it.imei}`);
    } else if (it.serialNumber) {
      b.textln(`   SN: ${it.serialNumber}`);
    } else if (it.sku) {
      b.textln(`   SKU: ${it.sku}`);
    }

    // Line 4: qty x price = total (ผ่อน → ซ่อนราคาเครื่อง แต่ "อุปกรณ์เสริมจ่ายสดวันนี้" โชว์ราคา — FIX-090)
    const isAddOn = !hasRealImei(it.imei) && !it.serialNumber && (it.lineTotal ?? 0) > 0;
    if (!hidePrice) {
      const qty = it.quantity.toString();
      const price = fmtTHB(it.sellPrice);
      const tot = fmtTHB(it.lineTotal);
      const line = `${qty.padStart(8)} ${price.padStart(10)} ${tot.padStart(12)}`;
      b.text(' '.repeat(W - line.length)).textln(line);
    } else if (isAddOn) {
      b.textln(`   จ่ายวันนี้: ${it.quantity} x ${fmtTHB(it.sellPrice)} = ${fmtTHB(it.lineTotal)}`);
    }
  });

  b.separator('-', W);

  // ─── Totals ───────────────────────────────────── (ข้ามทั้งบล็อกถ้าผ่อน — โชว์แค่ดาวน์/ค่างวดด้านล่าง)
  if (!hidePrice) {
    b.justify('ยอดสินค้า:', fmtTHB(data.subtotal), W);

    if (data.discountAmount > 0) {
      b.justify('ส่วนลด:', `-${fmtTHB(data.discountAmount)}`, W);
    }
    if (data.vatAmount > 0) {
      b.justify('VAT:', `+${fmtTHB(data.vatAmount)}`, W);
    }
    if (data.shippingFee > 0) {
      const partner = data.shippingPartner ? ` (${PARTNER_TH[data.shippingPartner] ?? data.shippingPartner})` : '';
      b.justify(`ค่าจัดส่ง${partner}:`, `+${fmtTHB(data.shippingFee)}`, W);

      if ((data.shippingFeeGrandpa ?? 0) > 0) {
        b.justify('  ↳ ตาออก:', fmtTHB(data.shippingFeeGrandpa!), W);
      }
      if ((data.shippingFeeGrandma ?? 0) > 0) {
        b.justify('  ↳ ยายออก:', fmtTHB(data.shippingFeeGrandma!), W);
      }
    }

    b.separator('=', W);
    b.size(2, 1).justify('ยอดสุทธิ:', fmtTHB(data.grandTotal), W / 2).size(1, 1);
    b.separator('=', W);
  } else {
    // ผ่อน → ยอดสุทธิ = เงินรับวันนี้ (ดาวน์ + อุปกรณ์เสริมจ่ายสด) ไม่โชว์ราคาเครื่องเต็ม — FIX-072/FIX-090
    const addOn = data.addOnTotal ?? 0;
    b.separator('=', W);
    if (addOn > 0) {
      b.justify('เงินดาวน์:', fmtTHB(data.downPaymentAmount ?? 0), W);
      b.justify('อุปกรณ์เสริม (จ่ายวันนี้):', fmtTHB(addOn), W);
    }
    b.size(2, 1).justify('ยอดสุทธิ:', fmtTHB((data.downPaymentAmount ?? 0) + addOn), W / 2).size(1, 1);
    b.separator('=', W);
  }

  // ─── Payment ────────────────────────────────────
  if (data.paymentMethod) {
    b.justify('วิธีชำระ:', PAYMENT_TH[data.paymentMethod] ?? data.paymentMethod, W);
  }
  if (data.paymentReference) {
    b.justify('อ้างอิง:', data.paymentReference, W);
  }
  if (data.paymentMethod === 'CASH' && data.paidAmount != null) {
    b.justify('รับเงิน:', fmtTHB(data.paidAmount), W);
    if ((data.changeAmount ?? 0) > 0) {
      b.justify('เงินทอน:', fmtTHB(data.changeAmount!), W);
    }
  }

  // ─── Installment ────────────────────────────────
  if (data.paymentMethod === 'INSTALLMENT' && data.installmentMonths) {
    // ยอดสุทธิด้านบน = เงินดาวน์แล้ว · ที่นี่แตก สด/โอน + ค่างวด (ไม่ซ้ำบรรทัดเงินดาวน์อีก)
    b.textln('(ยอดสุทธิ = เงินดาวน์ที่รับวันนี้)');
    if ((data.downCash ?? 0) > 0) b.justify('  เงินสด:', fmtTHB(data.downCash!), W);
    if ((data.downTransfer ?? 0) > 0) b.justify('  เงินโอน:', fmtTHB(data.downTransfer!), W);
    b.justify(`ผ่อน ${data.installmentMonths} เดือน:`, `${fmtTHB(data.monthlyAmount ?? 0)} / เดือน`, W);
  }

  // ─── Shipping detail ────────────────────────────
  if (data.shippingTrackingNo || data.shippingAddress) {
    b.separator('-', W);
    b.bold(true).textln('📦 ข้อมูลจัดส่ง').bold(false);
    if (data.shippingTrackingNo) b.textln(`เลขพัสดุ: ${data.shippingTrackingNo}`);
    if (data.shippingAddress) {
      // ตัดบรรทัดที่ 42 ตัวอักษร (กัน Thai มี zero-width)
      data.shippingAddress.split(/\r?\n/).forEach((line) => {
        for (let i = 0; i < line.length; i += 42) {
          b.textln(line.substring(i, i + 42));
        }
      });
    }
  }

  // ─── QR Code ────────────────────────────────────
  if (data.qrCodeData) {
    b.newline();
    b.align('C');
    b.qrcode(data.qrCodeData, { size: 6, errorCorrection: 'M' });
    b.newline();
    b.align('L');
  }

  // ─── Footer ─────────────────────────────────────
  b.separator('=', W);
  b.align('C');
  if (data.footerMessage) {
    data.footerMessage.split(/\r?\n/).forEach((line) => b.textln(line));
  }
  if (data.shop.website) b.textln(data.shop.website);
  b.textln('เก็บใบเสร็จเพื่อรับประกัน 7 วัน');

  // ─── Cut + drawer ──────────────────────────────
  b.feedAndCut(4);

  if (opts.openDrawer && data.paymentMethod === 'CASH') {
    b.drawerKick(0);
  }

  return b.build();
}
