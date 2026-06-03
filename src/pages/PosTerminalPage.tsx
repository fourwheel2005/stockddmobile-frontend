import { useState, useRef, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ScanLine, Trash2, ShoppingCart, Receipt, Search, ListChecks, UserCircle2, Printer, Upload, X, Wrench, Truck, Globe, Store } from 'lucide-react';
import { posApi } from '@/api/pos';
import { filesApi } from '@/api/files';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';
import { CustomerPickerModal } from '@/components/CustomerPickerModal';
import { ImeiPickerModal } from '@/components/ImeiPickerModal';
import { RepairIntakeModal } from '@/components/RepairIntakeModal';
import { ReceiptPrintView } from '@/components/ReceiptPrintView';
import { RepairBillPrintView } from '@/components/RepairBillPrintView';
import type {
  CartScanResponse, Customer, InStockItem, OrderChannel,
  PaymentMethod, RepairTicket, SalesOrderResponse, ShippingPartner,
} from '@/types/api';
import { cashRegisterApi } from '@/api/cashRegister';
import { OpenSessionModal } from '@/components/OpenSessionModal';
import { Link } from 'react-router-dom';

const SHIPPING_PARTNER_OPTIONS: { value: ShippingPartner; label: string; icon: string }[] = [
  { value: 'ICE',        label: 'น้ำแข็ง',       icon: '🧊' },
  { value: 'YUEM_MAI',   label: 'ยืมมั้ย',       icon: '🤝' },
  { value: 'PEE_KEAW',   label: 'พี่เขียว',      icon: '🟢' },
  { value: 'GREATER',    label: 'กรีทเตอร์',     icon: '⭐' },
  { value: 'RED_HEAT',   label: 'เรด ฮีท',       icon: '🔥' },
  { value: 'AMP_MOBILE', label: 'แอมป์ โมบาย',   icon: '📱' },
  { value: 'PICKUP',     label: 'ลูกค้ารับเอง',  icon: '🏪' },
  { value: 'OTHER',      label: 'อื่นๆ',          icon: '📌' },
];

interface CartLine {
  key: string;
  variantId: string;
  serialItemId?: string;
  sku: string;
  productName: string;
  imei?: string | null;
  detail: string;                  // color/storage display
  labelPrice: number;
  sellPrice: number;
  quantity: number;
  serialized: boolean;
}

interface PaymentOption {
  value: PaymentMethod;
  label: string;
  icon: string;
  requiresRef: boolean;
  refLabel?: string;
}

const PAYMENT_OPTIONS: PaymentOption[] = [
  { value: 'CASH',        label: 'ชำระด้วยเงินสด',           icon: '💵', requiresRef: false },
  { value: 'TRANSFER',    label: 'โอนเงินผ่านระบบ / สแกน QR', icon: '📲', requiresRef: true,  refLabel: 'เลขสลิป / 4 หลักท้าย' },
  { value: 'INSTALLMENT', label: 'ผ่อนชำระรายเดือน',         icon: '💳', requiresRef: true,  refLabel: 'เลขสัญญาผ่อน' },
];

export function PosTerminalPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [scanQuery, setScanQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [paymentRef, setPaymentRef] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [vatRate, setVatRate] = useState<number>(0); // % (0 = ไม่คิด VAT)
  const [note, setNote] = useState('');
  const [lastBill, setLastBill] = useState<SalesOrderResponse | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showImeiPicker, setShowImeiPicker] = useState(false);
  const [showRepair, setShowRepair] = useState(false);
  const [repairToPrint, setRepairToPrint] = useState<RepairTicket | null>(null);

  // ─── Installment-only state ─────────────────────────────────────────
  const [installmentMonths, setInstallmentMonths] = useState<number>(6);
  const [downAmount, setDownAmount] = useState<number>(0);
  const [splitDown, setSplitDown] = useState<boolean>(false);
  const [downCash, setDownCash] = useState<number>(0);
  const [downTransfer, setDownTransfer] = useState<number>(0);

  // ─── Transfer slip state ────────────────────────────────────────────
  const [slipFileId, setSlipFileId] = useState<string | null>(null);
  const [slipPreview, setSlipPreview] = useState<string | null>(null);
  const [slipUploading, setSlipUploading] = useState(false);

  // ─── Walk-in customer (พิมพ์สด ไม่ต้องมีในระบบ) ─────────────────────
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');

  // ─── Shipping / channel ─────────────────────────────────────────────
  const [orderChannel, setOrderChannel] = useState<OrderChannel>('WALK_IN');
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [shippingPartner, setShippingPartner] = useState<ShippingPartner | ''>('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingFeeGrandpa, setShippingFeeGrandpa] = useState<number>(0);
  const [shippingFeeGrandma, setShippingFeeGrandma] = useState<number>(0);
  const [showOpenSession, setShowOpenSession] = useState(false);

  // ─── Cash session check (block checkout if no session) ──────────────
  const sessionQuery = useQuery({
    queryKey: ['cash-session', 'current'],
    queryFn: cashRegisterApi.current,
    refetchInterval: 60_000,
  });
  const hasOpenSession = !!sessionQuery.data;

  // Auto-focus on mount so scanner gun input works immediately
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Cleanup blob URL เมื่อ component unmount — กัน memory leak
  useEffect(() => () => {
    if (slipPreview) URL.revokeObjectURL(slipPreview);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-focus the scan input whenever modals close, so the scanner gun keeps working.
  useEffect(() => {
    if (!showCustomerPicker && !showImeiPicker && !showRepair) {
      // small delay to ensure modal unmount complete
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [showCustomerPicker, showImeiPicker, showRepair]);

  // เมื่อสร้างใบรับซ่อมเสร็จ → เคลียร์ใบเสร็จขายเดิมออกจาก DOM แล้วสั่งพิมพ์ใบรับซ่อม
  useEffect(() => {
    if (!repairToPrint) return;
    const t = setTimeout(() => window.print(), 200);
    return () => clearTimeout(t);
  }, [repairToPrint]);

  // Track whether the scan input is focused (for the "ready" visual cue)
  const [scanReady, setScanReady] = useState(false);

  const scan = useMutation({
    mutationFn: (q: string) => posApi.scan(q),
    onSuccess: addToCart,
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  function addToCart(item: CartScanResponse) {
    setCart((prev) => {
      // Serialized: 1 entry per serialItemId — reject if already in cart
      if (item.serialized) {
        if (prev.some((l) => l.serialItemId === item.serialItemId)) {
          toast.error(`IMEI ${item.imei} อยู่ในตะกร้าแล้ว`);
          return prev;
        }
        return [...prev, {
          key: item.serialItemId!,
          variantId: item.variantId,
          serialItemId: item.serialItemId!,
          sku: item.sku,
          productName: item.productName,
          imei: item.imei,
          detail: [item.color, item.storage].filter(Boolean).join(' / '),
          labelPrice: item.labelPrice,
          sellPrice: item.sellPrice,
          quantity: 1,
          serialized: true,
        }];
      }
      // Bulk: merge if same variantId
      const existing = prev.find((l) => !l.serialized && l.variantId === item.variantId);
      if (existing) {
        if (existing.quantity + 1 > item.availableQty) {
          toast.error(`สต็อกคงเหลือไม่พอ (มี ${item.availableQty} ชิ้น)`);
          return prev;
        }
        return prev.map((l) => l === existing ? { ...l, quantity: l.quantity + 1 } : l);
      }
      if (item.availableQty < 1) {
        toast.error(`สินค้านี้สต็อกหมด`);
        return prev;
      }
      return [...prev, {
        key: item.variantId,
        variantId: item.variantId,
        sku: item.sku,
        productName: item.productName,
        detail: [item.color, item.storage].filter(Boolean).join(' / '),
        labelPrice: item.labelPrice,
        sellPrice: item.sellPrice,
        quantity: 1,
        serialized: false,
      }];
    });
    toast.success(`เพิ่มแล้ว: ${item.sku}`, { duration: 1500 });
  }

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanQuery.trim()) return;
    scan.mutate(scanQuery.trim());
    setScanQuery('');
    inputRef.current?.focus();
  };

  const updateLine = (key: string, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((l) => l.key === key ? { ...l, ...patch } : l));
  };
  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key));

  // Totals — VAT คิดจาก (subtotal − discount) แล้วบวกค่าจัดส่ง
  const subtotal = cart.reduce((s, l) => s + l.sellPrice * l.quantity, 0);
  const taxBase = Math.max(0, subtotal - discount);
  const vatAmount = Math.round(taxBase * (Number(vatRate) || 0)) / 100;
  const grandTotal = Math.max(0, taxBase + vatAmount + (Number(shippingFee) || 0));
  const discountExceedsSubtotal = discount > subtotal;

  // Add an IMEI from the picker modal to the cart
  function addImeiToCart(item: InStockItem) {
    if (cart.some((l) => l.serialItemId === item.id)) {
      toast.error(`IMEI ${item.imei} อยู่ในตะกร้าแล้ว`);
      return;
    }
    setCart((prev) => [...prev, {
      key: item.id,
      variantId: item.variantId,
      serialItemId: item.id,
      sku: item.sku,
      productName: item.productName,
      imei: item.imei,
      detail: [item.color, item.storage].filter(Boolean).join(' / '),
      labelPrice: item.sellingPrice,
      sellPrice: item.sellingPrice,
      quantity: 1,
      serialized: true,
    }]);
    toast.success(`เพิ่มแล้ว: ${item.sku}`, { duration: 1500 });
  }

  // Upload transfer slip
  async function handleSlipUpload(file: File) {
    setSlipUploading(true);
    try {
      const uploaded = await filesApi.upload(file);
      setSlipFileId(uploaded.id);
      setSlipPreview(URL.createObjectURL(file));
      toast.success('แนบสลิปแล้ว');
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSlipUploading(false);
    }
  }

  function clearSlip() {
    if (slipPreview) URL.revokeObjectURL(slipPreview);
    setSlipFileId(null);
    setSlipPreview(null);
  }

  const checkout = useMutation({
    mutationFn: () => {
      const isInstallment = paymentMethod === 'INSTALLMENT';
      return posApi.checkout({
        customerId: customer?.id,
        items: cart.map((l) => ({
          variantId: l.variantId,
          serialItemId: l.serialItemId,
          quantity: l.quantity,
          labelPrice: l.labelPrice,
          sellPrice: l.sellPrice,
        })),
        paymentMethod,
        paymentReference: paymentRef || undefined,
        paymentSlipFileId: paymentMethod === 'TRANSFER' ? (slipFileId ?? undefined) : undefined,
        discountAmount: discount || undefined,
        vatAmount: vatAmount > 0 ? vatAmount : undefined,
        note: note || undefined,
        // Walk-in (ส่งเฉพาะเมื่อยังไม่ได้เลือกลูกค้าจากระบบ)
        walkInCustomerName: !customer && walkInName.trim() ? walkInName.trim() : undefined,
        walkInCustomerPhone: !customer && walkInPhone.trim() ? walkInPhone.trim() : undefined,
        // Shipping
        orderChannel,
        shippingFee: shippingFee > 0 ? shippingFee : undefined,
        shippingPartner: shippingPartner || undefined,
        // shippingTrackingNo ไม่ใช้ใน POS แล้ว — กรอกทีหลังในหน้าจัดการบิล
        shippingAddress: shippingAddress.trim() || undefined,
        shippingFeeGrandpa: shippingFeeGrandpa > 0 ? shippingFeeGrandpa : undefined,
        shippingFeeGrandma: shippingFeeGrandma > 0 ? shippingFeeGrandma : undefined,
        ...(isInstallment ? {
          installmentMonths,
          downPaymentAmount: downAmount,
          downPaymentCashAmount: splitDown ? downCash : undefined,
          downPaymentTransferAmount: splitDown ? downTransfer : undefined,
        } : {}),
      });
    },
    onSuccess: (order) => {
      toast.success(`ปิดบิลสำเร็จ — ${order.billNo}`);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      setLastBill(order);
      setCart([]);
      setCustomer(null);
      setDiscount(0);
      setPaymentRef('');
      setNote('');
      setDownAmount(0);
      setSplitDown(false);
      setDownCash(0);
      setDownTransfer(0);
      setVatRate(0);
      setWalkInName('');
      setWalkInPhone('');
      setOrderChannel('WALK_IN');
      setShippingFee(0);
      setShippingPartner('');
      setShippingAddress('');
      setShippingFeeGrandpa(0);
      setShippingFeeGrandma(0);
      clearSlip();
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      inputRef.current?.focus();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  // โอนเงินต้องแนบสลิปก่อนปิดบิล
  const needSlip = paymentMethod === 'TRANSFER';
  const slipMissing = needSlip && !slipFileId;

  // ─── Channel + Shipping gating (ตรงกับ PosService validation) ────────
  const isOnline = orderChannel === 'ONLINE';
  const hasCustomerIdentity = !!customer || walkInName.trim().length > 0;
  const onlineNeedsAddress = isOnline && shippingAddress.trim().length === 0;
  const onlineNeedsPartner = isOnline && !shippingPartner;
  const onlineNeedsIdentity = isOnline && !hasCustomerIdentity;
  const installmentNeedsIdentity = paymentMethod === 'INSTALLMENT' && !hasCustomerIdentity;
  const shippingSplitOver = (shippingFeeGrandpa + shippingFeeGrandma) > shippingFee;
  const checkoutBlockedReason =
    !hasOpenSession ? 'กรุณาเปิดเก๊ะก่อน' :
    cart.length === 0 ? 'ยังไม่มีสินค้าในตะกร้า' :
    slipMissing ? 'ต้องแนบสลิปโอนเงินก่อน' :
    discountExceedsSubtotal ? 'ส่วนลดเกินยอดรวมสินค้า' :
    shippingSplitOver ? 'ค่าส่งของตา+ยาย เกินค่าส่งรวม' :
    onlineNeedsIdentity ? 'ออนไลน์: ต้องระบุชื่อลูกค้า' :
    onlineNeedsPartner ? 'ออนไลน์: ต้องเลือกพาร์ทเนอร์จัดส่ง' :
    onlineNeedsAddress ? 'ออนไลน์: ต้องกรอกที่อยู่จัดส่ง' :
    installmentNeedsIdentity ? 'ผ่อนชำระ: ต้องระบุชื่อลูกค้า' :
    null;

  return (
    <div className="space-y-4">
      {/* Session banner */}
      {!hasOpenSession && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900">ยังไม่ได้เปิดเก๊ะ</h3>
              <p className="text-sm text-amber-800">
                ต้องเปิดเก๊ะก่อนปิดบิล — ระบบจะปฏิเสธการขายจนกว่าจะเปิด session
              </p>
            </div>
            <button
              onClick={() => setShowOpenSession(true)}
              className="btn-primary bg-emerald-600 hover:bg-emerald-700 shrink-0">
              เปิดเก๊ะ
            </button>
            <Link to="/cash-register" className="btn-secondary shrink-0">
              จัดการเก๊ะ
            </Link>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <ScanLine className="h-6 w-6 text-brand-600" /> ระบบขายหน้าร้าน (POS Terminal)
          </h1>
          <p className="text-sm text-slate-500">สแกนบาร์โค้ดสินค้า หรือ IMEI 15 หลัก</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={() => setShowImeiPicker(true)}>
            <ListChecks className="h-4 w-4" /> เลือก IMEI จากรายการ
          </button>
          <button className="btn-secondary text-amber-700" onClick={() => setShowRepair(true)}>
            <Wrench className="h-4 w-4" /> ส่งซ่อม / เคลม
          </button>
          <button className="btn-secondary" onClick={() => setShowCustomerPicker(true)}>
            <UserCircle2 className="h-4 w-4" />
            {customer ? customer.name : 'เลือกลูกค้า'}
          </button>
          {lastBill && (
            <button className="btn-secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> พิมพ์ใบเสร็จล่าสุด
            </button>
          )}
        </div>
      </div>

      {/* Scanner + Payment selector */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <form onSubmit={handleScan} className="lg:col-span-2">
          <div className={`space-y-2 rounded-lg bg-slate-800 p-5 shadow-sm transition-all
                          ${scanReady ? 'ring-2 ring-emerald-400 ring-offset-2' : ''}`}>
            <label className="flex items-center justify-between text-xs font-semibold uppercase text-amber-400">
              <span>📦 สแกนบาร์โค้ดสินค้า หรือ พิมพ์เลข IMEI 15 หลัก</span>
              {scanReady
                ? <span className="text-emerald-400">🟢 พร้อมรับสแกน</span>
                : <span className="text-slate-400">⚪ คลิกในช่องเพื่อเริ่มสแกน</span>}
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
                className="flex-1 rounded-md border border-slate-600 px-3 py-2 text-sm shadow-sm
                           placeholder:text-slate-500 focus:border-amber-500 focus:outline-none
                           focus:ring-2 focus:ring-amber-500/40"
                placeholder="ยิงสแกนเนอร์บาร์โค้ด หรือพิมพ์รหัสที่นี่..."
                value={scanQuery}
                onChange={(e) => setScanQuery(e.target.value)}
                onFocus={() => setScanReady(true)}
                onBlur={() => setScanReady(false)}
              />
              <button type="submit" className="btn-primary" disabled={scan.isPending}>
                <Search className="h-4 w-4" /> ค้นหา
              </button>
            </div>
          </div>
        </form>

        <div className="card">
          <div className="card-body space-y-2">
            <label className="text-xs font-semibold uppercase text-slate-500">วิธีชำระเงิน</label>
            <div className="grid grid-cols-1 gap-2">
              {PAYMENT_OPTIONS.map((opt) => {
                const active = paymentMethod === opt.value;
                return (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setPaymentMethod(opt.value)}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                      active
                        ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-lg">{opt.icon}</span>
                    <span>{opt.label}</span>
                    {active && <span className="ml-auto text-brand-600">✓</span>}
                  </button>
                );
              })}
            </div>
            {(() => {
              const opt = PAYMENT_OPTIONS.find((o) => o.value === paymentMethod);
              if (!opt?.requiresRef) return null;
              return (
                <input className="input" placeholder={opt.refLabel}
                       value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
              );
            })()}

            {/* Slip upload — required when paying by TRANSFER */}
            {needSlip && (
              <div className={`rounded-md border p-2 ${slipMissing ? 'border-red-300 bg-red-50' : 'border-emerald-300 bg-emerald-50'}`}>
                <div className="mb-1 text-xs font-semibold">
                  📎 แนบสลิปโอนเงิน {slipMissing && <span className="text-red-600">* จำเป็น</span>}
                </div>
                {slipPreview ? (
                  <div className="flex items-center gap-2">
                    <img src={slipPreview} alt="slip" className="h-16 w-16 rounded object-cover" />
                    <span className="text-xs text-emerald-700">✓ แนบแล้ว</span>
                    <button type="button" className="ml-auto rounded p-1 text-red-600 hover:bg-red-100"
                            onClick={clearSlip}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded border border-dashed border-slate-300 bg-white px-3 py-3 text-sm text-slate-600 hover:bg-slate-50">
                    <Upload className="h-4 w-4" />
                    {slipUploading ? 'กำลังอัปโหลด...' : 'เลือกรูปสลิป (JPG/PNG/PDF)'}
                    <input type="file" accept="image/*,application/pdf" className="hidden"
                           disabled={slipUploading}
                           onChange={(e) => {
                             const f = e.target.files?.[0];
                             if (f) handleSlipUpload(f);
                             e.target.value = '';
                           }} />
                  </label>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Customer info (walk-in หรือ ระบบ) + ช่องทาง ──────────── */}
      <div className="card border-2 border-sky-300">
        <div className="card-header flex items-center gap-2 bg-sky-50">
          <UserCircle2 className="h-5 w-5 text-sky-700" />
          <span>ข้อมูลลูกค้า + ช่องทาง</span>
          {(paymentMethod === 'INSTALLMENT' || isOnline) && (
            <span className="ml-auto rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              * จำเป็น
            </span>
          )}
        </div>
        <div className="card-body grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">ช่องทางการขาย</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setOrderChannel('WALK_IN');
                  // หน้าร้านมัก = ลูกค้ารับเอง — ถ้ายังไม่เลือกอะไรให้ default PICKUP
                  if (!shippingPartner) setShippingPartner('PICKUP');
                }}
                className={`flex items-center gap-1 rounded-md border px-3 py-2 text-sm transition ${
                  orderChannel === 'WALK_IN'
                    ? 'border-sky-500 bg-sky-100 font-semibold text-sky-800'
                    : 'border-slate-200 hover:border-slate-300'
                }`}>
                <Store className="h-4 w-4" /> หน้าร้าน
              </button>
              <button
                type="button"
                onClick={() => {
                  setOrderChannel('ONLINE');
                  // ออนไลน์: เลิก PICKUP เพราะ backend block — ให้ผู้ใช้เลือกใหม่
                  if (shippingPartner === 'PICKUP') setShippingPartner('');
                }}
                className={`flex items-center gap-1 rounded-md border px-3 py-2 text-sm transition ${
                  orderChannel === 'ONLINE'
                    ? 'border-sky-500 bg-sky-100 font-semibold text-sky-800'
                    : 'border-slate-200 hover:border-slate-300'
                }`}>
                <Globe className="h-4 w-4" /> ออนไลน์
              </button>
            </div>
          </div>

          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              ชื่อลูกค้า {customer ? '(จากระบบ)' : '(พิมพ์สดได้)'}
            </label>
            {customer ? (
              <div className="flex items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
                <span className="font-semibold">{customer.name}</span>
                {customer.phone && <span className="text-xs text-slate-500">({customer.phone})</span>}
                <button
                  type="button"
                  className="ml-auto text-xs text-red-600 hover:underline"
                  onClick={() => setCustomer(null)}>
                  ✕ ล้าง
                </button>
              </div>
            ) : (
              <input
                className="input"
                placeholder="ชื่อลูกค้า (ใช้พิมพ์ใบเสร็จ + แจ้ง LINE)"
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
                maxLength={120}
              />
            )}
          </div>

          <div className="sm:col-span-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">เบอร์โทร (optional)</label>
            {customer ? (
              <input
                className="input bg-slate-50"
                value={customer.phone ?? '-'}
                disabled
              />
            ) : (
              <input
                className="input"
                placeholder="08x-xxx-xxxx"
                value={walkInPhone}
                onChange={(e) => setWalkInPhone(e.target.value)}
                maxLength={30}
              />
            )}
          </div>

          {(installmentNeedsIdentity || onlineNeedsIdentity) && (
            <div className="sm:col-span-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
              ⚠️ {paymentMethod === 'INSTALLMENT' ? 'ผ่อนชำระ' : 'ออนไลน์'}: ต้องเลือกลูกค้าจากระบบ
              หรือกรอกชื่อลูกค้าก่อน
            </div>
          )}
        </div>
      </div>

      {/* ─── ค่าจัดส่งพัสดุ + พาร์ทเนอร์ (collapsible สำหรับหน้าร้าน) ── */}
      <div className="card border-2 border-orange-300">
        <div className="card-header flex items-center gap-2 bg-orange-50">
          <Truck className="h-5 w-5 text-orange-700" />
          <span>ค่าจัดส่งพัสดุ + พาร์ทเนอร์</span>
          {isOnline && (
            <span className="ml-auto rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              * จำเป็น (ออนไลน์)
            </span>
          )}
        </div>
        <div className="card-body space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                ค่าจัดส่งรวม (บาท)
              </label>
              <input
                type="number" min={0} step="1"
                className="input text-right font-semibold"
                value={shippingFee}
                onChange={(e) => setShippingFee(Math.max(0, Number(e.target.value) || 0))}
              />
              <p className="mt-1 text-[11px] text-slate-500">รวมเข้ายอดสุทธิของบิล</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                👴 ค่าส่งของตา (บาท)
              </label>
              <input
                type="number" min={0} max={shippingFee} step={1}
                className="input text-right"
                value={shippingFeeGrandpa}
                onChange={(e) => setShippingFeeGrandpa(Math.max(0, Number(e.target.value) || 0))}
                disabled={shippingFee === 0}
              />
              <p className="mt-1 text-[11px] text-slate-500">เงินที่ตาออกแทนเก๊ะ</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                👵 ค่าส่งของยาย (บาท)
              </label>
              <input
                type="number" min={0} max={shippingFee} step={1}
                className="input text-right"
                value={shippingFeeGrandma}
                onChange={(e) => setShippingFeeGrandma(Math.max(0, Number(e.target.value) || 0))}
                disabled={shippingFee === 0}
              />
              <p className="mt-1 text-[11px] text-slate-500">เงินที่ยายออกแทนเก๊ะ</p>
            </div>
          </div>

          {/* Live calc: ส่วนที่เหลือออกจากเก๊ะ + warning ถ้าเกิน */}
          {shippingFee > 0 && (() => {
            const splitSum = shippingFeeGrandpa + shippingFeeGrandma;
            const fromRegister = Math.max(0, shippingFee - splitSum);
            const splitOver = splitSum > shippingFee;
            return (
              <div className={`rounded-md px-3 py-2 text-xs ${
                splitOver
                  ? 'bg-red-100 text-red-800 border border-red-200'
                  : 'bg-slate-50 text-slate-700 border border-slate-200'
              }`}>
                {splitOver
                  ? <>⚠️ ตา + ยาย รวม {formatTHB(splitSum)} เกินค่าส่งทั้งหมด {formatTHB(shippingFee)}</>
                  : <>🏪 ส่วนที่เหลือออกจากเก๊ะ: <strong>{formatTHB(fromRegister)}</strong></>
                }
              </div>
            );
          })()}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              พาร์ทเนอร์จัดส่ง {onlineNeedsPartner && <span className="text-red-600">*</span>}
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {SHIPPING_PARTNER_OPTIONS.map((p) => {
                const active = shippingPartner === p.value;
                return (
                  <button
                    type="button"
                    key={p.value}
                    onClick={() => setShippingPartner(active ? '' : p.value)}
                    className={`flex items-center gap-1 rounded-md border px-3 py-2 text-sm transition ${
                      active
                        ? 'border-orange-500 bg-orange-100 font-semibold text-orange-800'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}>
                    <span className="text-base">{p.icon}</span>
                    <span className="text-xs">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {isOnline && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                ที่อยู่จัดส่ง <span className="text-red-600">*</span>
              </label>
              <textarea
                rows={3}
                className="input"
                placeholder="ชื่อ-นามสกุล / ที่อยู่ / รหัสไปรษณีย์ / เบอร์โทร"
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                maxLength={1000}
              />
            </div>
          )}

        </div>
      </div>

      {/* ─── Installment details panel (only for INSTALLMENT) ───────── */}
      {paymentMethod === 'INSTALLMENT' && (
        <InstallmentPanel
          grandTotalTarget={Math.max(0, cart.reduce((s, l) => s + l.sellPrice * l.quantity, 0) - discount)}
          months={installmentMonths} setMonths={setInstallmentMonths}
          downAmount={downAmount} setDownAmount={setDownAmount}
          splitDown={splitDown} setSplitDown={setSplitDown}
          downCash={downCash} setDownCash={setDownCash}
          downTransfer={downTransfer} setDownTransfer={setDownTransfer}
        />
      )}

      {/* Cart */}
      <div className="card">
        <div className="card-header flex items-center gap-2">
          <ShoppingCart className="h-5 w-5" />
          <span>สรุปรายการสินค้าในบิล ({cart.length} รายการ)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">รายละเอียดสินค้า</th>
                <th className="px-4 py-3 text-right">ราคาป้าย</th>
                <th className="px-4 py-3 text-right">ราคาขายจริง *</th>
                <th className="px-4 py-3 text-right">จำนวน</th>
                <th className="px-4 py-3 text-right">ยอดรวม</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cart.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    ❌ ยังไม่มีสินค้าในตะกร้า — กรุณาสแกน IMEI หรือป้อนรหัสสินค้า
                  </td>
                </tr>
              )}
              {cart.map((l, idx) => (
                <tr key={l.key} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{l.productName}</div>
                    <div className="text-xs text-slate-500 font-mono">{l.sku}</div>
                    {l.imei && <div className="text-xs text-brand-700">IMEI: {l.imei}</div>}
                    {l.detail && <div className="text-xs text-slate-500">{l.detail}</div>}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">{formatTHB(l.labelPrice)}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      className="input w-32 text-right"
                      value={l.sellPrice}
                      onChange={(e) => updateLine(l.key, { sellPrice: Number(e.target.value) || 0 })}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {l.serialized
                      ? <span className="text-slate-700">1</span>
                      : <input
                          type="number"
                          min={1}
                          className="input w-20 text-right"
                          value={l.quantity}
                          onChange={(e) => updateLine(l.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                        />}
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{formatTHB(l.sellPrice * l.quantity)}</td>
                  <td className="px-4 py-3 text-right">
                    <button className="rounded p-2 text-red-600 hover:bg-red-50"
                            onClick={() => removeLine(l.key)}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Total + Checkout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="card-body space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">ยอดรวม</span>
              <span className="font-semibold">{formatTHB(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">ส่วนลด (บาท)</span>
              <input type="number" step="0.01" min={0} max={subtotal}
                     className={`input w-32 text-right ${discountExceedsSubtotal ? 'border-red-400 ring-red-300' : ''}`}
                     value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} />
            </div>
            {discountExceedsSubtotal && (
              <div className="text-xs text-red-600">⚠️ ส่วนลดเกินยอดรวม</div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">VAT (%)</span>
              <div className="flex items-center gap-1">
                {[0, 7].map((r) => (
                  <button key={r} type="button"
                          onClick={() => setVatRate(r)}
                          className={`rounded border px-2 py-1 text-xs ${vatRate === r ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-slate-200 hover:border-slate-300'}`}>
                    {r}%
                  </button>
                ))}
                <input type="number" step="0.01" min={0} max={100}
                       className="input w-20 text-right"
                       value={vatRate} onChange={(e) => setVatRate(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} />
              </div>
            </div>
            {vatAmount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">VAT ที่คำนวณ</span>
                <span className="font-semibold text-slate-700">+ {formatTHB(vatAmount)}</span>
              </div>
            )}
            {shippingFee > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  ค่าจัดส่ง {shippingPartner ? `(${SHIPPING_PARTNER_OPTIONS.find(p => p.value === shippingPartner)?.label})` : ''}
                </span>
                <span className="font-semibold text-orange-700">+ {formatTHB(shippingFee)}</span>
              </div>
            )}
            <input className="input" placeholder="หมายเหตุ (optional)"
                   value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="card border-amber-400 border-2">
          <div className="card-body space-y-3">
            <div className="text-xs uppercase text-amber-700 font-semibold">
              ยอดสุทธิที่ต้องชำระ (Net Total)
            </div>
            <div className="rounded-md bg-slate-900 px-4 py-6 text-right text-4xl font-bold text-amber-300">
              {formatTHB(grandTotal)}
            </div>
            <button
              className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700 text-base"
              disabled={checkout.isPending || !!checkoutBlockedReason}
              title={checkoutBlockedReason ?? undefined}
              onClick={() => checkout.mutate()}>
              <Receipt className="h-5 w-5" />
              {checkout.isPending ? 'กำลังปิดบิล...'
                : checkoutBlockedReason
                  ? checkoutBlockedReason
                  : 'ปิดบิล'}
            </button>
            {lastBill && (
              <button className="btn-secondary w-full" onClick={() => window.print()}>
                <Printer className="h-4 w-4" /> พิมพ์ใบเสร็จ {lastBill.billNo}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showCustomerPicker && (
        <CustomerPickerModal
          onSelect={(c) => setCustomer(c)}
          onClose={() => setShowCustomerPicker(false)}
        />
      )}
      {showImeiPicker && (
        <ImeiPickerModal
          selectedIds={cart.map((l) => l.serialItemId).filter(Boolean) as string[]}
          onSelect={(item) => addImeiToCart(item)}
          onClose={() => setShowImeiPicker(false)}
        />
      )}
      {showRepair && (
        <RepairIntakeModal
          onClose={() => setShowRepair(false)}
          onCreated={(ticket) => { setLastBill(null); setRepairToPrint(ticket); }}
        />
      )}
      {showOpenSession && (
        <OpenSessionModal onClose={() => setShowOpenSession(false)} />
      )}

      {/* Hidden printouts — only visible when window.print() fires.
          แสดงครั้งละหนึ่งใบเท่านั้น (ใบเสร็จขาย หรือ ใบรับซ่อม) เพื่อกันพิมพ์ซ้อน */}
      {repairToPrint
        ? <RepairBillPrintView ticket={repairToPrint} />
        : lastBill && <ReceiptPrintView order={lastBill} />}
    </div>
  );
}

// ─── Installment Panel ────────────────────────────────────────────────────

const MONTH_OPTIONS = [3, 6, 10, 12, 18, 24, 36];

interface InstallmentPanelProps {
  grandTotalTarget: number;
  months: number; setMonths: (m: number) => void;
  downAmount: number; setDownAmount: (n: number) => void;
  splitDown: boolean; setSplitDown: (b: boolean) => void;
  downCash: number; setDownCash: (n: number) => void;
  downTransfer: number; setDownTransfer: (n: number) => void;
}

function InstallmentPanel({
  grandTotalTarget, months, setMonths,
  downAmount, setDownAmount, splitDown, setSplitDown,
  downCash, setDownCash, downTransfer, setDownTransfer,
}: InstallmentPanelProps) {
  const remaining = Math.max(0, grandTotalTarget - downAmount);
  const perMonth = months > 0 ? remaining / months : 0;
  const splitSum = downCash + downTransfer;
  const splitMatches = !splitDown || Math.abs(splitSum - downAmount) < 0.01;

  return (
    <div className="card border-2 border-purple-300">
      <div className="card-header flex items-center gap-2 bg-purple-50">
        💳 รายละเอียดการผ่อนชำระ
      </div>
      <div className="card-body space-y-4">
        {/* Months */}
        <div>
          <label className="mb-2 block text-sm font-medium">ระยะเวลาผ่อน (เดือน)</label>
          <div className="flex flex-wrap gap-2">
            {MONTH_OPTIONS.map((m) => (
              <button
                type="button"
                key={m}
                onClick={() => setMonths(m)}
                className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                  months === m
                    ? 'border-purple-500 bg-purple-100 text-purple-800'
                    : 'border-slate-200 hover:border-slate-300'
                }`}>
                {m} เดือน
              </button>
            ))}
          </div>
        </div>

        {/* Down payment */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">เงินดาวน์ทั้งหมด (บาท)</label>
            <input
              type="number" min={0} max={grandTotalTarget} step="100"
              className="input text-lg font-semibold"
              value={downAmount}
              onChange={(e) => setDownAmount(Math.max(0, Number(e.target.value) || 0))}
            />
            <p className="mt-1 text-xs text-slate-500">
              สูงสุด {formatTHB(grandTotalTarget)} (ยอดสุทธิทั้งหมด)
            </p>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <div className="text-xs text-slate-500">ส่วนที่เหลือผ่อน</div>
            <div className="text-lg font-semibold">{formatTHB(remaining)}</div>
            <div className="mt-1 text-xs text-slate-600">
              ÷ {months} เดือน = <strong className="text-purple-700">{formatTHB(perMonth)} / เดือน</strong>
            </div>
          </div>
        </div>

        {/* Mixed down payment toggle */}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={splitDown}
                 onChange={(e) => setSplitDown(e.target.checked)} />
          <span>แบ่งจ่ายเงินดาวน์ (เงินสด + โอน)</span>
        </label>

        {splitDown && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">💵 ดาวน์เป็นเงินสด</label>
                <input
                  type="number" min={0} step="100"
                  className="input"
                  value={downCash}
                  onChange={(e) => setDownCash(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">📲 ดาวน์ผ่านการโอน</label>
                <input
                  type="number" min={0} step="100"
                  className="input"
                  value={downTransfer}
                  onChange={(e) => setDownTransfer(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
            </div>
            <div className={`mt-2 rounded px-3 py-2 text-sm ${
              splitMatches
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-red-100 text-red-800'
            }`}>
              รวมแบ่ง: {formatTHB(splitSum)} / ต้องการ: {formatTHB(downAmount)}
              {splitMatches ? ' ✓' : ' — ⚠️ ตัวเลขไม่ตรง'}
            </div>
          </div>
        )}

        <div className="rounded-md bg-purple-50 px-3 py-2 text-xs text-purple-800">
          💡 ระบบจะบันทึก: <strong>เงินดาวน์ {formatTHB(downAmount)}</strong> เป็นยอดที่จ่ายแล้ว
          • <strong>{formatTHB(remaining)}</strong> ที่เหลือจะผ่านบริษัทผ่อน (ไม่บันทึกในระบบสต็อก)
        </div>
      </div>
    </div>
  );
}
