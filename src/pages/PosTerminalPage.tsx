import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ScanLine, Trash2, ShoppingCart, Receipt, Search, ListChecks, UserCircle2, Printer, Upload, X, Wrench, Truck, Globe, Store, Plus, ChevronDown, ChevronUp, ArrowLeftRight, FileText } from 'lucide-react';
import { posApi } from '@/api/pos';
import { filesApi } from '@/api/files';
import { extractErrorMessage } from '@/api/client';
import { formatTHB } from '@/lib/format';
import { hasRealImei } from '@/lib/escpos/ddmobileReceipt';
import { validateShippingRecipient } from '@/lib/tspl/shippingLabel';
import { CustomerPickerModal } from '@/components/CustomerPickerModal';
import { ImeiPickerModal } from '@/components/ImeiPickerModal';
import { DeviceLookupModal } from '@/components/DeviceLookupModal';
import { DeviceScanDetailPanel, type ScannedDeviceRef } from '@/components/DeviceScanDetailPanel';
import { inventoryApi } from '@/api/inventory';
import { RepairIntakeModal } from '@/components/RepairIntakeModal';
import { ReceiptPrintView } from '@/components/ReceiptPrintView';
import { TaxInvoiceModal } from '@/components/TaxInvoiceModal';
import { TaxInvoiceCheckoutModal } from '@/components/TaxInvoiceCheckoutModal';
import { isValidTaxInvoiceBuyer, type IssueTaxInvoiceRequest } from '@/api/taxInvoice';
import { RepairBillPrintView } from '@/components/RepairBillPrintView';
import type {
  CartScanResponse, Customer, InStockItem, OrderChannel,
  PaymentMethod, PaymentSplit, RepairTicket, SalesOrderResponse, ShippingAddressInput,
  ShippingPartner, TradeInVariantResponse,
} from '@/types/api';
import { getTradeInBlockedReason, isTradeInActive, TRADE_IN_INTAKE_POLICY } from '@/lib/pos/tradeIn';
import { PaymentSplitEditor, validateSplit } from '@/components/pos/PaymentSplitEditor';
import { SaleDocumentSelector, type SaleDocumentMode } from '@/components/pos/SaleDocumentSelector';
import { CashierPicker } from '@/components/pos/CashierPicker';
import { LatestBillActions } from '@/components/pos/LatestBillActions';
import { ShippingLabelModal } from '@/components/ShippingLabelModal';
import { SavedShippingAddressPicker } from '@/components/pos/SavedShippingAddressPicker';
import { CustomItemForm, type CustomItemDraft } from '@/components/pos/CustomItemForm';
import { type SlipEntry } from '@/components/pos/MultiSlipUpload';
import { cashRegisterApi } from '@/api/cashRegister';
import { OpenSessionModal } from '@/components/OpenSessionModal';
import { PrinterStatusBadge } from '@/components/PrinterStatusBadge';
import { PrinterSettingsModal } from '@/components/PrinterSettingsModal';
import { useBranchStore } from '@/stores/branchStore';
import { useAuthStore } from '@/stores/authStore';
import { QuickReprintModal } from '@/components/QuickReprintModal';
import { OwnerShippingModal } from '@/components/OwnerShippingModal';
import { usePrinter } from '@/hooks/usePrinter';
import { printAndConfirmReceipt } from '@/lib/printer/browserPrintConfirmation';
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
  /** ว่าง = รายการพิมพ์เอง (ไม่ผูกสต็อก) — FIX-099 */
  variantId?: string;
  /** true = พิมพ์เอง · ทุนเก็บเป็นรหัสตัวอักษรใน unitCostCode */
  custom?: boolean;
  unitCostCode?: string;
  serialItemId?: string;
  sku: string;
  productName: string;
  imei?: string | null;
  detail: string;                  // color/storage display
  labelPrice: number;
  sellPrice: number;
  quantity: number;
  serialized: boolean;
  /** บิลผ่อน: บรรทัดนี้ "จ่ายสดวันนี้" (อุปกรณ์เสริม) แทนที่จะรวมยอดผ่อน — FIX-090/094
   *  default: อุปกรณ์เสริม (bulk) = true · เครื่อง (serialized) = false · ติ๊กสลับได้ต่อบรรทัด */
  payToday: boolean;
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
  { value: 'MIXED',       label: 'จ่ายแบบผสม (สด+โอน/บัตร/QR)', icon: '🧮', requiresRef: false },
  { value: 'INSTALLMENT', label: 'ผ่อนชำระรายเดือน',         icon: '💳', requiresRef: true,  refLabel: 'เลขสัญญาผ่อน' },
];

/** UUID v4 — ใช้ crypto.randomUUID ถ้ามี (secure context) · fallback สำหรับ http บน LAN ที่ไม่มี. */
function newRequestId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'));
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`;
}

/** ปัด 2 ตำแหน่ง — เงินที่ "คำนวณต่อ" ฝั่ง FE เป็น float ต้องปัดก่อนส่ง ไม่งั้นชน @Digits(fraction=2) ฝั่ง BE
 *  เช่น 2099.99−1500 = 599.9899999999998 → 400 ปิดบิลไม่ได้ (QA FIX-151) */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function PosTerminalPage() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  // F-03 (FIX-132): idempotency key ต่อ "ตะกร้าปัจจุบัน" — สร้าง lazy ตอน checkout ครั้งแรก,
  // คงเดิมตอน retry (ปิดบิลซ้ำ backend คืนบิลเดิม), เคลียร์เป็น null หลังปิดสำเร็จ → บิลถัดไปได้ key ใหม่.
  const clientRequestIdRef = useRef<string | null>(null);
  const tradeInSearchRequestRef = useRef(0);
  const [scanQuery, setScanQuery] = useState('');
  // เครื่องที่เพิ่งสแกน → โชว์การ์ดรายละเอียด (battery + ประวัติซ่อม/อะไหล่ + ใบรับซ่อม) FIX-103
  const [scannedDevice, setScannedDevice] = useState<ScannedDeviceRef | null>(null);

  // ─── เทิร์นเครื่องเก่า (FIX-105) ───
  const [tradeInEnabled, setTradeInEnabled] = useState(false);
  const [tradeInOpen, setTradeInOpen] = useState(false);
  const [tradeInVariant, setTradeInVariant] = useState<TradeInVariantResponse | null>(null);
  const [tradeInSkuQuery, setTradeInSkuQuery] = useState('');
  const [tradeInResults, setTradeInResults] = useState<TradeInVariantResponse[]>([]);
  const [tradeInSearchState, setTradeInSearchState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [tradeInSearchError, setTradeInSearchError] = useState('');
  const [tradeInSearchRetry, setTradeInSearchRetry] = useState(0);
  const [tradeInImei, setTradeInImei] = useState('');
  const [tradeInSerial, setTradeInSerial] = useState('');
  const [tradeInBattery, setTradeInBattery] = useState('');
  const [tradeInValueStr, setTradeInValueStr] = useState('');
  const [tradeInPayoutMethod, setTradeInPayoutMethod] = useState<PaymentMethod>('CASH');
  // สภาพเครื่องเทิร์น (FIX-106)
  const [tiHasBox, setTiHasBox] = useState(false);
  const [tiHasCharger, setTiHasCharger] = useState(false);
  const [tiHasWarranty, setTiHasWarranty] = useState(false);
  const [tiNeedsBattery, setTiNeedsBattery] = useState(false);
  const [tiNeedsScreen, setTiNeedsScreen] = useState(false);
  const [tiNote, setTiNote] = useState('');

  const resetTradeIn = () => {
    tradeInSearchRequestRef.current += 1;
    setTradeInEnabled(false);
    setTradeInOpen(false);
    setTradeInVariant(null);
    setTradeInSkuQuery('');
    setTradeInResults([]);
    setTradeInSearchState('idle');
    setTradeInSearchError('');
    setTradeInImei('');
    setTradeInSerial('');
    setTradeInBattery('');
    setTradeInValueStr('');
    setTradeInPayoutMethod('CASH');
    setTiHasBox(false); setTiHasCharger(false); setTiHasWarranty(false);
    setTiNeedsBattery(false); setTiNeedsScreen(false); setTiNote('');
  };

  const toggleTradeInDetails = () => {
    if (!tradeInEnabled) {
      setTradeInEnabled(true);
      setTradeInOpen(true);
      return;
    }
    setTradeInOpen((open) => !open);
  };
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [paymentRef, setPaymentRef] = useState('');
  const [cashierProfileId, setCashierProfileId] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [vatRate, setVatRate] = useState<number>(0); // % (0 = ไม่คิด VAT)
  const [note, setNote] = useState('');
  const [lastBill, setLastBill] = useState<SalesOrderResponse | null>(null);
  const [receiptToPrint, setReceiptToPrint] = useState<{
    order: SalesOrderResponse;
    duplicate: boolean;
  } | null>(null);
  // FIX-150: ออกใบกำกับภาษีเต็มรูปแบบจากบิลที่เพิ่งปิด
  const [taxInvoiceFor, setTaxInvoiceFor] = useState<SalesOrderResponse | null>(null);
  const [shippingLabelFor, setShippingLabelFor] = useState<SalesOrderResponse | null>(null);
  const [documentMode, setDocumentMode] = useState<SaleDocumentMode>('RECEIPT');
  const [taxDetailsOpen, setTaxDetailsOpen] = useState(false);
  const [taxInvoiceDraft, setTaxInvoiceDraft] = useState<IssueTaxInvoiceRequest>({
    buyerType: 'INDIVIDUAL', customerName: '', customerAddress: '',
  });
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [showImeiPicker, setShowImeiPicker] = useState(false);
  const [showLookup, setShowLookup] = useState(false);
  const [showRepair, setShowRepair] = useState(false);
  const [repairToPrint, setRepairToPrint] = useState<RepairTicket | null>(null);

  // ─── Installment-only state ─────────────────────────────────────────
  const [installmentMonths, setInstallmentMonths] = useState<number>(6);
  const [installmentMonthly, setInstallmentMonthly] = useState<number>(0);  // ค่างวด/เดือน ที่พนักงานกำหนด
  const [installmentMonthlyTouched, setInstallmentMonthlyTouched] = useState(false);  // พนักงานแก้ค่างวดเองแล้ว (กัน auto ทับ)
  const [downAmount, setDownAmount] = useState<number>(0);
  // ยอดรับวันนี้ (ดาวน์ + อุปกรณ์เสริม) ลูกค้าจ่ายเป็นเงินโอนเท่าไหร่ · ที่เหลือ = เงินสด (FIX-097)
  const [payTransfer, setPayTransfer] = useState<number>(0);

  // ─── รับชำระค่างวด (เงินสด) — ออกบิลไม่ตัดสต็อก (FIX-085) ────────────
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectAmount, setCollectAmount] = useState<number>(0);
  const [collectName, setCollectName] = useState('');
  const [collectPhone, setCollectPhone] = useState('');
  const [collectNote, setCollectNote] = useState('');
  // Finance partner state — ซ่อนชั่วคราว (ร้านผ่อนเอง). เก็บใน git history เผื่ออนาคต.
  // const [financePartner, setFinancePartner] = useState<FinancePartner | ''>('');

  // ─── MIXED split state (V31) ────────────────────────────────────────
  const [mixedSplit, setMixedSplit] = useState<PaymentSplit>({
    cash: 0, transfer: 0, card: 0, qr: 0,
  });

  // ─── Transfer slip state (V31 — รองรับหลายใบ Q1) ────────────────
  const [slips, setSlips] = useState<SlipEntry[]>([]);

  // ─── Walk-in customer (พิมพ์สด ไม่ต้องมีในระบบ) ─────────────────────
  const [walkInName, setWalkInName] = useState('');
  const [walkInPhone, setWalkInPhone] = useState('');

  // ─── Shipping / channel ─────────────────────────────────────────────
  const [orderChannel, setOrderChannel] = useState<OrderChannel>('WALK_IN');
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [shippingPartner, setShippingPartner] = useState<ShippingPartner | ''>('');
  const [shippingRecipientName, setShippingRecipientName] = useState('');
  const [shippingRecipientPhone, setShippingRecipientPhone] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [printShippingLabelAfterCheckout, setPrintShippingLabelAfterCheckout] = useState(false);
  const [shippingFeeGrandpa, setShippingFeeGrandpa] = useState<number>(0);
  const [shippingFeeGrandma, setShippingFeeGrandma] = useState<number>(0);
  // การ์ดลูกค้า/จัดส่ง — ยุบไว้ default (หน้าร้านเงินสดไม่ต้องใช้) · กดเปิดเองได้
  const [custCardOpen, setCustCardOpen] = useState(false);
  const [shipCardOpen, setShipCardOpen] = useState(false);
  const [showOwnerShip, setShowOwnerShip] = useState(false);
  const [showOpenSession, setShowOpenSession] = useState(false);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const [showQuickReprint, setShowQuickReprint] = useState(false);
  const printer = usePrinter();
  /** STAFF = ขายอย่างเดียว → ซ่อนปุ่มที่แตะข้อมูล/เงินหลังร้าน (FIX-102) */
  const canSeeBackOffice = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));

  // ─── Cash session check (block checkout if no session) — ของสาขาที่ขาย ──
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const sessionQuery = useQuery({
    queryKey: ['cash-session', 'current', activeBranchId],
    queryFn: () => cashRegisterApi.current(activeBranchId ?? undefined),
    refetchInterval: 60_000,
  });
  const hasOpenSession = !!sessionQuery.data;

  // Auto-focus on mount so scanner gun input works immediately
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Cleanup blob URL เมื่อ component unmount — กัน memory leak
  useEffect(() => () => {
    slips.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
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
    onSuccess: (item) => {
      addToCart(item);
      // เครื่อง serialized → เด้งการ์ดรายละเอียด/ประวัติทันที (ยังเพิ่มลงตะกร้าตามปกติ)
      if (item.serialized && item.serialItemId) {
        setScannedDevice({ serialItemId: item.serialItemId, imei: item.imei, serialNumber: item.serialNumber });
      }
    },
    onError: async (e, q) => {
      // เครื่องขายแล้ว/ยิงเข้าตะกร้าไม่ได้ (409 Conflict เท่านั้น) → โชว์รายละเอียดแบบดูอย่างเดียว
      // error อื่น (500/network/สิทธิ์) ต้อง toast จริง — เดิม fallback กลืน error ทุกชนิด
      // ทำให้สแกนพลาดแล้วการ์ดเด้งเหมือนสำเร็จ แต่ของไม่เข้าตะกร้า (FIX-110)
      const status = axios.isAxiosError(e) ? e.response?.status : undefined;
      if (status === 409) {
        try {
          const found = await inventoryApi.lookupSerial(q);
          setScannedDevice({
            serialItemId: found.id, imei: found.imei, serialNumber: found.serialNumber, lookupOnly: true,
          });
          // บอกเหตุผลที่ไม่เข้าตะกร้าด้วย (เช่น เครื่องขายแล้ว/ติดจอง) — การ์ดโชว์ประวัติได้ตามเดิม
          toast(extractErrorMessage(e), { icon: 'ℹ️', duration: 3000 });
          return;
        } catch { /* lookup พลาด → ตกไป toast ด้านล่าง */ }
      }
      toast.error(extractErrorMessage(e));
    },
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
          // default ฉลาด (FIX-096): มี IMEI จริง = เครื่อง→ผ่อน · ไม่มี IMEI = อุปกรณ์เสริม Serial→จ่ายวันนี้
          payToday: !hasRealImei(item.imei),
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
        payToday: true,   // อุปกรณ์เสริม (นับจำนวน) = จ่ายวันนี้ (FIX-094)
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

  /** เพิ่มรายการที่พิมพ์เอง (ไม่ตัดสต็อก) — FIX-099 */
  function addCustomItemToCart(draft: CustomItemDraft) {
    setCart((prev) => [...prev, {
      key: `custom-${Date.now()}-${prev.length}`,
      custom: true,
      unitCostCode: draft.unitCostCode || undefined,
      sku: '—',
      productName: draft.name,
      detail: 'ไม่ตัดสต็อก',
      labelPrice: draft.sellPrice,
      sellPrice: draft.sellPrice,
      quantity: draft.quantity,
      serialized: false,
      payToday: true,   // ของชิ้นเล็กจ่ายสดวันนี้เสมอ ไม่รวมยอดผ่อน
    }]);
    toast.success(`เพิ่มแล้ว: ${draft.name}`, { duration: 1500 });
  }

  const updateLine = (key: string, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((l) => l.key === key ? { ...l, ...patch } : l));
  };
  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key));

  // Totals — VAT คิดจาก (subtotal − discount) แล้วบวกค่าจัดส่ง
  const subtotal = cart.reduce((s, l) => s + l.sellPrice * l.quantity, 0);
  const taxBase = Math.max(0, subtotal - discount);
  const vatAmount = Math.round(taxBase * (Number(vatRate) || 0)) / 100;
  const grandTotal = Math.max(0, taxBase + vatAmount + (Number(shippingFee) || 0));
  // เทิร์น (FIX-105): ยอดขายเต็ม − มูลค่าเทิร์น = net (≥0 รับจากลูกค้า · <0 จ่ายคืน)
  const tradeInActive = isTradeInActive(tradeInEnabled, tradeInVariant?.id, tradeInValueStr);
  const tradeInValueNum = tradeInActive ? r2(Number(tradeInValueStr)) : 0;
  const netCollect = grandTotal - tradeInValueNum;
  // เทิร์นดาวน์ (FIX-106): ผ่อน + เทิร์น → หักเทิร์นจากเงินดาวน์ที่ลูกค้าจ่ายจริงวันนี้
  const isInstallmentSel = paymentMethod === 'INSTALLMENT';

  // ค้น SKU เครื่องเทิร์น (debounce) — เลือกแล้วหยุดค้น
  useEffect(() => {
    const q = tradeInSkuQuery.trim();
    const requestId = ++tradeInSearchRequestRef.current;
    if (!tradeInEnabled || !q || tradeInVariant) {
      setTradeInResults([]);
      setTradeInSearchState('idle');
      setTradeInSearchError('');
      return;
    }
    setTradeInSearchState('loading');
    setTradeInSearchError('');
    const t = setTimeout(() => {
      posApi.searchTradeInVariants(q, 0, 8)
        .then((page) => {
          if (tradeInSearchRequestRef.current !== requestId) return;
          setTradeInResults(page.content);
          setTradeInSearchState('success');
        })
        .catch((error) => {
          if (tradeInSearchRequestRef.current !== requestId) return;
          setTradeInResults([]);
          setTradeInSearchError(extractErrorMessage(error));
          setTradeInSearchState('error');
        });
    }, 300);
    return () => {
      clearTimeout(t);
      if (tradeInSearchRequestRef.current === requestId) tradeInSearchRequestRef.current += 1;
    };
  }, [tradeInEnabled, tradeInSkuQuery, tradeInVariant, tradeInSearchRetry]);
  // บิลผ่อน: บรรทัดที่ "จ่ายสดวันนี้" (อุปกรณ์เสริม) = ไม่รวมยอดผ่อน · ติ๊กต่อบรรทัดได้ (FIX-090/094)
  const addOnToday = r2(cart.filter((l) => l.payToday).reduce((s, l) => s + l.sellPrice * l.quantity, 0));
  const payToday = downAmount + addOnToday;
  // แยกยอดรับวันนี้: โอนเท่าที่กรอก (ไม่เกินยอดรวม) · ที่เหลือ = เงินสด (FIX-097)
  const payTransferClamped = Math.min(Math.max(0, payTransfer), payToday);
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
      // default ฉลาด (FIX-096): มี IMEI จริง = เครื่อง→ผ่อน · ไม่มี IMEI = อุปกรณ์เสริม Serial→จ่ายวันนี้
      payToday: !hasRealImei(item.imei),
    }]);
    toast.success(`เพิ่มแล้ว: ${item.sku}`, { duration: 1500 });
  }

  // V31 — clear all slips (revoke blob URLs to avoid memory leak)
  function clearSlips() {
    slips.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
    setSlips([]);
  }

  /** Render บิลเป้าหมายก่อนเปิด dialog; callback นี้อยู่ใน PrintJob เดียวกับ thermal strategies */
  const printReceiptInBrowser = async ({
    order,
    duplicate,
  }: { order: SalesOrderResponse; duplicate: boolean }) => {
    setRepairToPrint(null);
    setReceiptToPrint({ order, duplicate });
    await new Promise((resolve) => setTimeout(resolve, 300));
    printAndConfirmReceipt();
  };

  const openTaxInvoiceDetails = () => {
    setTaxInvoiceDraft((current) => ({
      ...current,
      customerName: current.customerName || customer?.name || walkInName.trim(),
      customerAddress: current.customerAddress || customer?.address || shippingAddress.trim(),
    }));
    setTaxDetailsOpen(true);
  };

  const checkout = useMutation({
    mutationFn: () => {
      const isInstallment = paymentMethod === 'INSTALLMENT';
      // เทิร์นดาวน์ (FIX-106): ยอดจ่ายจริงวันนี้ = payToday − มูลค่าเทิร์น (เทิร์นแทนเงินดาวน์)
      const payNetToday = r2(Math.max(0, payToday - (isInstallment && tradeInActive ? tradeInValueNum : 0)));
      const effTransfer = r2(Math.min(payTransferClamped, payNetToday));
      const effCash = r2(payNetToday - effTransfer);   // QA FIX-151: กัน float noise ชน @Digits → 400
      // idempotency: gen ครั้งแรกของตะกร้านี้ · retry ใช้ key เดิม (ยังไม่ success จึงยังไม่ถูกเคลียร์)
      if (!clientRequestIdRef.current) clientRequestIdRef.current = newRequestId();
      return posApi.checkout({
        clientRequestId: clientRequestIdRef.current,
        customerId: customer?.id,
        branchId: useBranchStore.getState().activeBranchId ?? undefined,  // ขายที่สาขาที่เลือก (Phase 2C)
        cashierProfileId,
        items: cart.map((l) => ({
          variantId: l.custom ? undefined : l.variantId,
          // รายการพิมพ์เอง: ส่งชื่อ + รหัสทุน แทน variant (backend ถอดรหัสทุนเอง) — FIX-099
          customName: l.custom ? l.productName : undefined,
          unitCostCode: l.custom ? (l.unitCostCode || undefined) : undefined,
          serialItemId: l.serialItemId,
          quantity: l.quantity,
          labelPrice: l.labelPrice,
          sellPrice: l.sellPrice,
          // บิลผ่อน: บรรทัดที่ติ๊ก "จ่ายวันนี้" (อุปกรณ์เสริม) — backend หักจากยอดผ่อน (FIX-094)
          payToday: isInstallment ? l.payToday : undefined,
        })),
        paymentMethod,
        paymentReference: paymentRef || undefined,
        // V31 — multi-slip array (Q1) — backend persists all into sales_order_slips
        slipFileIds: slips.length > 0 ? slips.map((s) => s.fileId) : undefined,
        // Legacy single-slip — kept for backward compat
        paymentSlipFileId: slips.length > 0 ? slips[0].fileId : undefined,
        // V31 — MIXED split
        paymentSplit: paymentMethod === 'MIXED' ? mixedSplit : undefined,
        taxInvoice: documentMode === 'TAX_INVOICE' ? taxInvoiceDraft : undefined,
        // V31 — Finance partner (INSTALLMENT only)
        // financePartner: ซ่อนชั่วคราว (ร้านผ่อนเอง)
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
        shippingRecipientName: shippingRecipientName.trim() || undefined,
        shippingRecipientPhone: shippingRecipientPhone.trim() || undefined,
        shippingAddress: shippingAddress.trim() || undefined,
        shippingFeeGrandpa: shippingFeeGrandpa > 0 ? shippingFeeGrandpa : undefined,
        shippingFeeGrandma: shippingFeeGrandma > 0 ? shippingFeeGrandma : undefined,
        // เทิร์นเครื่องเก่า (FIX-105) — net<0 ส่ง diffPayoutMethod (วิธีจ่ายคืน)
        tradeIn: tradeInActive ? {
          variantId: tradeInVariant!.id,
          value: tradeInValueNum,
          imei: tradeInImei.trim() || undefined,
          serialNumber: tradeInSerial.trim() || undefined,
          condition: 'SECOND_HAND',
          batteryHealth: tradeInBattery ? Number(tradeInBattery) : undefined,
          hasBox: tiHasBox, hasCharger: tiHasCharger, hasWarranty: tiHasWarranty,
          needsBattery: tiNeedsBattery, needsScreen: tiNeedsScreen,
          note: tiNote.trim() || undefined,
          // net<0 เทิร์นสด → วิธีจ่ายคืน · ผ่อน (เทิร์นดาวน์) ไม่ใช้ diffPayoutMethod
          diffPayoutMethod: (!isInstallment && netCollect < 0) ? tradeInPayoutMethod : undefined,
        } : undefined,
        ...(isInstallment ? {
          installmentMonths,
          installmentMonthlyAmount: installmentMonthly > 0 ? installmentMonthly : undefined,
          downPaymentAmount: downAmount,
          // ยอดรับวันนี้แยก เงินสด/เงินโอน (หักเทิร์นดาวน์แล้ว — FIX-097/106)
          downPaymentCashAmount: isInstallment ? effCash : undefined,
          downPaymentTransferAmount: isInstallment ? effTransfer : undefined,
        } : {}),
      });
    },
    onSuccess: (order) => {
      toast.success(`ปิดบิลสำเร็จ — ${order.billNo}`);
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['transactions'] });
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      setReceiptToPrint(null);
      setLastBill(order);

      // เอกสารขาย 1 ชุด; ป้ายที่อยู่เป็นงานถัดไปหลัง dialog เอกสารจบ เพื่อไม่เปิดหน้าพิมพ์ชนกัน
      const documentPrint = order.taxInvoiceNo
        ? printer.printTaxInvoice(order.id, { openDrawer: true })
        : printer.printReceipt(order.id, {
          openDrawer: true,
          browserPrint: ({ duplicate }) => printReceiptInBrowser({ order, duplicate }),
        });
      documentPrint.catch((error) => console.error('Auto-print sale document failed:', error));
      if (printShippingLabelAfterCheckout) {
        documentPrint.finally(() => setShippingLabelFor(order)).catch(() => undefined);
      }
      clientRequestIdRef.current = null;   // F-03: บิลถัดไปได้ idempotency key ใหม่
      setScannedDevice(null);              // FIX-146: การ์ดเครื่องที่สแกนไม่ค้างหลังปิดบิล (เคยต้องกด X เอง)
      setCart([]);
      setCustomer(null);
      setDiscount(0);
      setPaymentRef('');
      setNote('');
      setDownAmount(0);
      setPayTransfer(0);
      // ผ่อน — reset ให้บิลถัดไปเริ่มใหม่ (กันค่างวด/เดือนของลูกค้าคนก่อนค้างมา)
      setInstallmentMonths(6);
      setInstallmentMonthly(0);
      setInstallmentMonthlyTouched(false);
      // setFinancePartner(''); — ซ่อนชั่วคราว
      setMixedSplit({ cash: 0, transfer: 0, card: 0, qr: 0 });
      setVatRate(0);
      setDocumentMode('RECEIPT');
      setTaxInvoiceDraft({ buyerType: 'INDIVIDUAL', customerName: '', customerAddress: '' });
      setWalkInName('');
      setWalkInPhone('');
      setOrderChannel('WALK_IN');
      setShippingFee(0);
      setShippingPartner('');
      setShippingRecipientName('');
      setShippingRecipientPhone('');
      setShippingAddress('');
      setPrintShippingLabelAfterCheckout(false);
      setShippingFeeGrandpa(0);
      setShippingFeeGrandma(0);
      resetTradeIn();
      clearSlips();
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      inputRef.current?.focus();
    },
    onError: (e) => {
      const msg = extractErrorMessage(e);
      // FIX-147 (QA D3): key ถูกใช้กับบิลอื่นไปแล้ว → ต้องได้ key ใหม่ ไม่งั้นปิดบิลไม่ได้ถาวรจน refresh
      if (msg.includes('IDEMPOTENCY_KEY_REUSED')) clientRequestIdRef.current = null;
      toast.error(msg);
    },
  });

  // รับชำระค่างวด (เงินสด) — ออกบิลไม่ตัดสต็อก + auto-print (FIX-085)
  const collectInstallment = useMutation({
    mutationFn: () => posApi.collectInstallment({
      amount: collectAmount,
      customerId: customer?.id,
      customerName: !customer && collectName.trim() ? collectName.trim() : undefined,
      customerPhone: !customer && collectPhone.trim() ? collectPhone.trim() : undefined,
      note: collectNote.trim() || undefined,
      branchId: useBranchStore.getState().activeBranchId ?? undefined,
      cashierProfileId,
    }),
    onSuccess: (order) => {
      toast.success(`ออกบิลค่างวด ${order.billNo} · ${formatTHB(order.grandTotal)}`);
      qc.invalidateQueries({ queryKey: ['sales-orders'] });
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      setReceiptToPrint(null);
      setLastBill(order);
      printer.printReceipt(order.id, {
        openDrawer: true,
        browserPrint: ({ duplicate }) => printReceiptInBrowser({ order, duplicate }),
      }).catch((e) => {
        console.error('Auto-print (ค่างวด) failed:', e);
      });
      setCollectAmount(0);
      setCollectName('');
      setCollectPhone('');
      setCollectNote('');
      setCollectOpen(false);
      inputRef.current?.focus();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  // สลิปโอน: ยกเลิกการบังคับแนบสลิป + เอาช่องอัปโหลดออกทุกวิธีจ่าย — ร้านไม่เช็กสลิปแล้ว (FIX-141)

  // MIXED — split must equal grandTotal (computed below in JSX scope)
  const mixedError = paymentMethod === 'MIXED'
    ? validateSplit(mixedSplit, grandTotal)
    : null;

  // ─── Channel + Shipping gating (ตรงกับ PosService validation) ────────
  const isOnline = orderChannel === 'ONLINE';
  const fillShippingRecipient = (recipient: ShippingAddressInput) => {
    setShippingRecipientName(recipient.recipientName);
    setShippingRecipientPhone(recipient.recipientPhone);
    setShippingAddress(recipient.address);
  };
  const copyCustomerToRecipient = () => fillShippingRecipient({
    recipientName: customer?.name || walkInName.trim(),
    recipientPhone: customer?.phone || walkInPhone.trim(),
    address: customer?.address || '',
  });
  const selectCustomer = (selected: Customer | null) => {
    setCustomer(selected);
    if (!selected) return;
    setShippingRecipientName((current) => current || selected.name);
    setShippingRecipientPhone((current) => current || selected.phone || '');
    setShippingAddress((current) => current || selected.address || '');
  };
  const hasCustomerIdentity = !!customer || walkInName.trim().length > 0;
  const shippingRecipientError = validateShippingRecipient({
    name: shippingRecipientName, phone: shippingRecipientPhone, address: shippingAddress,
  });
  const onlineRecipientError = isOnline ? shippingRecipientError : null;
  const labelRecipientError = printShippingLabelAfterCheckout ? shippingRecipientError : null;
  const onlineNeedsPartner = isOnline && !shippingPartner;
  const onlineNeedsIdentity = isOnline && !hasCustomerIdentity;
  const installmentNeedsIdentity = paymentMethod === 'INSTALLMENT' && !hasCustomerIdentity;
  const shippingSplitOver = (shippingFeeGrandpa + shippingFeeGrandma) > shippingFee;

  // การ์ดลูกค้า/จัดส่ง กางเองเมื่อ "จำเป็น" หรือ "มีข้อมูลแล้ว" — กันไม่ให้ซ่อนของที่กรอกไว้
  const custCardMustOpen = !!customer || walkInName.trim().length > 0 || walkInPhone.trim().length > 0
    || paymentMethod === 'INSTALLMENT' || isOnline;
  const custCardExpanded = custCardOpen || custCardMustOpen;
  const custSummaryName = customer?.name || walkInName || 'ยังไม่ระบุลูกค้า';
  const shipCardMustOpen = isOnline || printShippingLabelAfterCheckout
    || shippingFee > 0 || shippingFeeGrandpa > 0 || shippingFeeGrandma > 0
    || (!!shippingPartner && shippingPartner !== 'PICKUP') || shippingAddress.trim().length > 0
    || shippingRecipientName.trim().length > 0 || shippingRecipientPhone.trim().length > 0;
  const shipCardExpanded = shipCardOpen || shipCardMustOpen;
  const tradeInBlockedReason = getTradeInBlockedReason({
    enabled: tradeInEnabled,
    variantId: tradeInVariant?.id,
    value: tradeInValueStr,
    imei: tradeInImei,
    serialNumber: tradeInSerial,
    batteryHealth: tradeInBattery,
    paymentMethod,
    downPayment: downAmount,
  });
  const checkoutBlockedReason =
    !hasOpenSession ? 'กรุณาเปิดเก๊ะก่อน' :
    !cashierProfileId ? 'กรุณาเลือกผู้รับเงิน' :
    cart.length === 0 ? 'ยังไม่มีสินค้าในตะกร้า' :
    discountExceedsSubtotal ? 'ส่วนลดเกินยอดรวมสินค้า' :
    shippingSplitOver ? 'ค่าส่งของตา+ยาย เกินค่าส่งรวม' :
    onlineNeedsIdentity ? 'ออนไลน์: ต้องระบุชื่อลูกค้า' :
    onlineNeedsPartner ? 'ออนไลน์: ต้องเลือกพาร์ทเนอร์จัดส่ง' :
    onlineRecipientError ? `ออนไลน์: ${onlineRecipientError}` :
    labelRecipientError ? `ป้ายที่อยู่: ${labelRecipientError}` :
    installmentNeedsIdentity ? 'ผ่อนชำระ: ต้องระบุชื่อลูกค้า' :
    (documentMode === 'TAX_INVOICE' && !isValidTaxInvoiceBuyer(taxInvoiceDraft))
      ? 'ใบกำกับภาษี: กรอกข้อมูลผู้ซื้อให้ครบ' :
    mixedError ? `จ่ายแบบผสม: ${mixedError}` :
    tradeInBlockedReason ? tradeInBlockedReason :
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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 page-title">
            <ScanLine className="h-6 w-6 shrink-0 text-brand-600" /> ระบบขายหน้าร้าน (POS Terminal)
          </h1>
          <p className="text-sm text-slate-500">สแกนบาร์โค้ด / IMEI / Serial (iPad · Watch ไม่มี IMEI → ใช้ Serial)</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-secondary" onClick={() => setShowImeiPicker(true)}>
            <ListChecks className="h-4 w-4" /> เลือก IMEI จากรายการ
          </button>
          {/* ข้อมูลเครื่องเชิงลึก — STAFF ไม่เห็น (FIX-102) */}
          {canSeeBackOffice && (
            <button className="btn-secondary" onClick={() => setShowLookup(true)}>
              <Search className="h-4 w-4" /> เช็ครายละเอียด
            </button>
          )}
          <button className="btn-secondary text-amber-700" onClick={() => setShowRepair(true)}>
            <Wrench className="h-4 w-4" /> ส่งซ่อม / เคลม
          </button>
          <button className="btn-secondary" onClick={() => setShowCustomerPicker(true)}>
            <UserCircle2 className="h-4 w-4" />
            {customer ? customer.name : 'เลือกลูกค้า'}
          </button>
          {/* ⭐ Quick Reprint — always visible (สำหรับบิลเก่า / ลูกค้าใบหาย) */}
          <button
            className="btn-secondary"
            onClick={() => setShowQuickReprint(true)}
            title="พิมพ์บิลเก่าซ้ำ (ยิงสแกน QR หรือพิมพ์เลขบิล)">
            <Printer className="h-4 w-4" /> พิมพ์บิลเก่า
          </button>
          <PrinterStatusBadge status={printer.status} onClick={() => setShowPrinterSettings(true)} />
        </div>
      </div>

      {/* Scanner + Payment selector */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* UX redesign (FIX-152): เลิกกล่องดำ+3 สีตีกัน (navy/amber/emerald) → การ์ดขาวภาษาเดียวกับทั้งหน้า
            เด่นด้วย "ขนาด input + accent เดียว (brand)" · สถานะพร้อมสแกนใช้ chip เดียวมุมขวา — flow/logic เดิมทุกตัว */}
        <form onSubmit={handleScan} className="lg:col-span-2">
          <div className={`card space-y-2.5 p-5 transition-all
                          ${scanReady ? 'border-brand-400 shadow-md shadow-brand-100' : ''}`}>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="pos-scan" className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
                <ScanLine className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="truncate">สแกนบาร์โค้ด / IMEI / Serial</span>
                <span className="hidden text-xs font-normal text-slate-400 sm:inline">· iPad/Watch ใช้ Serial</span>
              </label>
              {scanReady ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> พร้อมรับสแกน
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                  <span className="h-2 w-2 rounded-full bg-slate-300" /> คลิกในช่องเพื่อเริ่ม
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                id="pos-scan"
                ref={inputRef}
                type="text"
                inputMode="search"
                autoComplete="off"
                className="h-12 flex-1 rounded-lg border border-slate-300 bg-white px-4 font-mono text-base
                           text-slate-800 shadow-sm placeholder:font-sans placeholder:text-sm placeholder:text-slate-400
                           focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
                placeholder="ยิงบาร์โค้ด / IMEI / Serial หรือพิมพ์ที่นี่..."
                value={scanQuery}
                onChange={(e) => setScanQuery(e.target.value)}
                onFocus={() => setScanReady(true)}
                onBlur={() => setScanReady(false)}
              />
              <button type="submit" className="btn-primary h-12 shrink-0 px-5" disabled={scan.isPending}>
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

            {/* รับชำระค่างวด (เงินสด) — ออกบิลไม่ตัดสต็อก · ไม่ผูกงวดผ่อน (FIX-085) */}
            {paymentMethod === 'CASH' && (
              <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/50">
                {!collectOpen ? (
                  <button type="button" onClick={() => setCollectOpen(true)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-emerald-800 hover:bg-emerald-100/60">
                    <span className="text-lg">🧾</span> รับชำระค่างวด (ลูกค้าจ่ายค่างวดเงินสด)
                    <ChevronDown className="ml-auto h-4 w-4" />
                  </button>
                ) : (
                  <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-emerald-800">🧾 รับชำระค่างวด (เงินสด)</span>
                      <button type="button" onClick={() => setCollectOpen(false)}
                              className="text-slate-400 hover:text-slate-600"><ChevronUp className="h-4 w-4" /></button>
                    </div>
                    <p className="text-[11px] leading-tight text-slate-500">
                      ออกบิล/ใบเสร็จรับค่างวด <strong>ไม่ตัดสต็อก</strong> · ไม่ต้องมีสินค้าในตะกร้า · ไม่ผูกกับตารางงวดผ่อน
                    </p>
                    <div>
                      <label className="text-[11px] text-slate-500">ยอดค่างวดที่รับ (บาท)</label>
                      <input type="number" inputMode="numeric" min={0} className="input text-right text-lg font-bold"
                             placeholder="0"
                             value={collectAmount || ''} onChange={(e) => setCollectAmount(Number(e.target.value) || 0)} />
                    </div>
                    {customer ? (
                      <div className="rounded bg-white/70 px-2 py-1 text-xs text-slate-600">
                        ลูกค้า: <strong>{customer.name}</strong>{customer.phone ? ` · ${customer.phone}` : ''}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <input className="input" placeholder="ชื่อลูกค้า (ถ้ามี)"
                               value={collectName} onChange={(e) => setCollectName(e.target.value)} />
                        <input className="input" placeholder="เบอร์โทร (ถ้ามี)"
                               value={collectPhone} onChange={(e) => setCollectPhone(e.target.value)} />
                      </div>
                    )}
                    <input className="input" placeholder="หมายเหตุ เช่น งวดที่ 3 / iPhone 13"
                           value={collectNote} onChange={(e) => setCollectNote(e.target.value)} />
                    <CashierPicker selectedId={cashierProfileId} onSelect={setCashierProfileId} compact />
                    {!hasOpenSession && (
                      <div className="rounded bg-amber-100 px-2 py-1 text-[11px] text-amber-800">
                        ⚠️ ต้องเปิดเก๊ะเงินสดก่อนถึงจะออกบิลได้
                      </div>
                    )}
                    <button type="button"
                            disabled={collectAmount <= 0 || !hasOpenSession || !cashierProfileId || collectInstallment.isPending}
                            onClick={() => collectInstallment.mutate()}
                            className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
                      {collectInstallment.isPending
                        ? 'กำลังออกบิล...'
                        : `ออกบิลค่างวด + พิมพ์ ${collectAmount > 0 ? `(${formatTHB(collectAmount)})` : ''}`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* V31 — MIXED split editor */}
            {paymentMethod === 'MIXED' && (
              <div className="mt-2 rounded-md border-2 border-brand-200 bg-brand-50/40 p-3">
                <div className="mb-2 text-xs font-semibold text-brand-800">
                  🧮 จ่ายแบบผสม — กรอกยอดแต่ละ method ให้รวม = {formatTHB(grandTotal)}
                </div>
                <PaymentSplitEditor
                  value={mixedSplit}
                  onChange={setMixedSplit}
                  grandTotal={grandTotal}
                />
              </div>
            )}

            {/* Finance Partner dropdown — ซ่อนชั่วคราว (ร้านผ่อนเองโดยตรง ไม่ผ่านไฟแนนซ์)
                เก็บโค้ดไว้ใน git history + backend + types ครบ — ถ้าวันหน้าต้องการ uncomment block นี้ */}

            {/* สลิปโอน: เอาช่องอัปโหลดออกทั้งหมด (ร้านไม่เช็กสลิปแล้ว — FIX-141) */}
          </div>
        </div>
      </div>

      {/* FIX-150: ใบกำกับภาษีเต็มรูปแบบ */}
      {taxInvoiceFor && (
        <TaxInvoiceModal
          order={taxInvoiceFor}
          onClose={() => setTaxInvoiceFor(null)}
          onPrint={(orderId) => printer.printTaxInvoice(orderId, { openDrawer: false })}
        />
      )}
      {shippingLabelFor && (
        <ShippingLabelModal order={shippingLabelFor} onClose={() => setShippingLabelFor(null)} />
      )}
      {taxDetailsOpen && (
        <TaxInvoiceCheckoutModal
          value={taxInvoiceDraft}
          onChange={setTaxInvoiceDraft}
          onClose={() => setTaxDetailsOpen(false)}
          onConfirm={() => {
            setDocumentMode('TAX_INVOICE');
            setVatRate(0);
            setTaxDetailsOpen(false);
          }}
        />
      )}

      {/* ─── รายละเอียด/ประวัติเครื่องที่เพิ่งสแกน (FIX-103) ──────────── */}
      {scannedDevice && (
        <DeviceScanDetailPanel device={scannedDevice} onClose={() => setScannedDevice(null)} />
      )}

      {/* ─── Customer info (walk-in หรือ ระบบ) + ช่องทาง ──────────── */}
      <div className="card border-2 border-sky-300">
        <button type="button" onClick={() => setCustCardOpen((o) => !o)}
                className="card-header flex w-full items-center gap-2 bg-sky-50 text-left">
          <UserCircle2 className="h-5 w-5 shrink-0 text-sky-700" />
          <span className="shrink-0">ข้อมูลลูกค้า + ช่องทาง</span>
          {(paymentMethod === 'INSTALLMENT' || isOnline) && (
            <span className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              * จำเป็น
            </span>
          )}
          {!custCardExpanded && (
            <span className="truncate text-xs font-normal text-slate-500">
              {custSummaryName} · {isOnline ? 'ออนไลน์' : 'หน้าร้าน'}
            </span>
          )}
          <span className="ml-auto shrink-0 text-slate-400">
            {custCardExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
        {custCardExpanded && (
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
        )}
      </div>

      {/* ─── ค่าจัดส่งพัสดุ + พาร์ทเนอร์ (collapsible สำหรับหน้าร้าน) ── */}
      <div className="card border-2 border-orange-300">
        <button type="button" onClick={() => setShipCardOpen((o) => !o)}
                className="card-header flex w-full items-center gap-2 bg-orange-50 text-left">
          <Truck className="h-5 w-5 shrink-0 text-orange-700" />
          <span className="shrink-0">ค่าจัดส่งพัสดุ + พาร์ทเนอร์</span>
          {isOnline && (
            <span className="shrink-0 rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
              * จำเป็น (ออนไลน์)
            </span>
          )}
          {printShippingLabelAfterCheckout && !isOnline && (
            <span className="shrink-0 rounded bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
              พิมพ์ป้ายหลังปิดบิล
            </span>
          )}
          {!shipCardExpanded && (
            <span className="truncate text-xs font-normal text-slate-500">
              {shippingFee > 0 ? `ค่าส่ง ${formatTHB(shippingFee)}` : 'รับเอง / ไม่มีค่าส่ง'}
            </span>
          )}
          <span className="ml-auto shrink-0 text-slate-400">
            {shipCardExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>
        {shipCardExpanded && (
        <div className="card-body space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                ค่าจัดส่งรวม (บาท)
              </label>
              <input
                type="number" min={0} step="1"
                className="input text-right font-semibold"
                value={shippingFee || ''}
                placeholder="0"
                onChange={(e) => setShippingFee(Math.max(0, Number(e.target.value) || 0))}
                onFocus={(e) => e.target.select()}
              />
              <p className="mt-1 text-[11px] text-slate-500">รวมเข้ายอดสุทธิของบิล</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                👴 ค่าส่งของตา (บาท)
              </label>
              <input
                type="number" min={0} step={1}
                className="input text-right"
                value={shippingFeeGrandpa || ''}
                placeholder="0"
                onChange={(e) => setShippingFeeGrandpa(Math.max(0, Number(e.target.value) || 0))}
                onFocus={(e) => e.target.select()}
              />
              <p className="mt-1 text-[11px] text-slate-500">เงินที่ตาออกแทนเก๊ะ</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                👵 ค่าส่งของยาย (บาท)
              </label>
              <input
                type="number" min={0} step={1}
                className="input text-right"
                value={shippingFeeGrandma || ''}
                placeholder="0"
                onChange={(e) => setShippingFeeGrandma(Math.max(0, Number(e.target.value) || 0))}
                onFocus={(e) => e.target.select()}
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

          {/* จ่ายค่าส่งตา/ยาย แบบไม่ต้องมีบิล (ออกไปจ่ายข้างนอกแล้วกรอก) — เงินเจ้าของ STAFF ไม่ยุ่ง */}
          {canSeeBackOffice && (
          <button type="button" onClick={() => setShowOwnerShip(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-orange-300 bg-orange-50/50 px-3 py-2 text-xs font-medium text-orange-700 transition hover:bg-orange-100">
            <Plus className="h-3.5 w-3.5" /> จ่ายค่าส่ง (ตา/ยาย) แบบไม่มีบิล — ออกไปจ่ายข้างนอก
          </button>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              พาร์ทเนอร์จัดส่ง {onlineNeedsPartner && <span className="text-red-600">*</span>}
            </label>
            {/* 8 พาร์ทเนอร์ → 4 คอลัมน์ = 2 แถวเต็มพอดี (5 คอลัมน์เหลือเศษ 3 แถวท้ายเบี้ยว) */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

          {(isOnline || printShippingLabelAfterCheckout) && (
            <div className="space-y-3 rounded-lg border border-orange-200 bg-orange-50/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <SavedShippingAddressPicker onSelect={fillShippingRecipient} />
                <button type="button" className="btn-secondary"
                        disabled={!(customer?.name || walkInName.trim())}
                        onClick={copyCustomerToRecipient}>
                  <UserCircle2 className="h-4 w-4" /> คัดลอกจากลูกค้า
                </button>
                <span className="text-[11px] text-slate-500">
                  ระบบจะจำผู้รับอัตโนมัติหลังปิดบิลสำเร็จ
                </span>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-600">
                  ชื่อผู้รับ <span className="text-red-600">*</span>
                  <input className="input mt-1" value={shippingRecipientName} maxLength={80}
                         placeholder="ชื่อ-นามสกุลผู้รับ"
                         onChange={(event) => setShippingRecipientName(event.target.value)} />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  เบอร์โทรผู้รับ <span className="text-red-600">*</span>
                  <input className="input mt-1" value={shippingRecipientPhone} maxLength={30}
                         inputMode="tel" placeholder="08x-xxx-xxxx"
                         onChange={(event) => setShippingRecipientPhone(event.target.value)} />
                </label>
              </div>
              <label className="block text-xs font-medium text-slate-600">
                ที่อยู่จัดส่ง <span className="text-red-600">*</span>
                <textarea rows={3} className="input mt-1" value={shippingAddress} maxLength={300}
                          placeholder="บ้านเลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์"
                          onChange={(event) => setShippingAddress(event.target.value)} />
              </label>
            </div>
          )}

        </div>
        )}
      </div>

      {/* ─── Installment details panel (only for INSTALLMENT) ───────── */}
      {paymentMethod === 'INSTALLMENT' && (
        <InstallmentPanel
          // QA FIX-151 (Critical): ฐานแผนผ่อนต้องรวม VAT+ค่าส่ง (grandTotal) — เดิมไม่รวม → เก็บขาดทั้งแผน
          grandTotalTarget={grandTotal}
          addOnToday={addOnToday}
          months={installmentMonths} setMonths={setInstallmentMonths}
          monthly={installmentMonthly} setMonthly={setInstallmentMonthly}
          monthlyTouched={installmentMonthlyTouched} setMonthlyTouched={setInstallmentMonthlyTouched}
          downAmount={downAmount} setDownAmount={setDownAmount}
          payTransfer={payTransfer} setPayTransfer={setPayTransfer}
        />
      )}

      {/* ขายของที่ไม่ได้ลงสต็อก — พิมพ์ชื่อ/ราคาเอง (FIX-099) */}
      <CustomItemForm onAdd={addCustomItemToCart} />

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
                    {l.custom ? (
                      <div className="text-xs text-amber-700">
                        พิมพ์เอง · ไม่ตัดสต็อก
                        {l.unitCostCode && <span className="ml-1 font-mono">(ทุน {l.unitCostCode})</span>}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 font-mono">{l.sku}</div>
                    )}
                    {l.imei && <div className="text-xs text-brand-700">IMEI: {l.imei}</div>}
                    {l.detail && <div className="text-xs text-slate-500">{l.detail}</div>}
                    {/* บิลผ่อน: เลือกต่อบรรทัด ว่า "ผ่อน" หรือ "จ่ายวันนี้" (อุปกรณ์เสริม) — FIX-094 */}
                    {paymentMethod === 'INSTALLMENT' && (
                      <button type="button"
                        onClick={() => updateLine(l.key, { payToday: !l.payToday })}
                        className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          l.payToday
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-purple-100 text-purple-800 hover:bg-purple-200'}`}
                        title="กดสลับ: ผ่อน ↔ จ่ายวันนี้">
                        {l.payToday ? '💵 จ่ายวันนี้' : '💳 ผ่อน'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500">{formatTHB(l.labelPrice)}</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      step="0.01"
                      className="input w-32 text-right"
                      value={l.sellPrice}
                      onChange={(e) => updateLine(l.key, { sellPrice: r2(Number(e.target.value) || 0) })}
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

      {/* ─── เทิร์นเครื่องเก่า (FIX-105) ─── */}
      <div className={`card border-2 ${tradeInEnabled ? 'border-violet-400' : 'border-slate-200'}`}>
        <div className="card-header flex items-center gap-2 bg-violet-50">
          <button type="button" onClick={toggleTradeInDetails}
                  aria-expanded={tradeInEnabled && tradeInOpen}
                  aria-controls="trade-in-details"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <ArrowLeftRight className="h-5 w-5 shrink-0 text-violet-700" />
            <span className="shrink-0">เทิร์นเครื่องเก่า</span>
            {tradeInActive && (
              <span className="truncate text-xs font-normal text-slate-500">
                {tradeInVariant?.sku} · ตีเทิร์น {formatTHB(tradeInValueNum)}
              </span>
            )}
            {!tradeInEnabled && <span className="text-xs font-normal text-slate-500">กดเพื่อเปิดใช้</span>}
            <span className="ml-auto shrink-0 text-slate-400">
              {tradeInEnabled && tradeInOpen
                ? <ChevronUp className="h-4 w-4" />
                : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>
          {tradeInEnabled && (
            <button type="button" onClick={resetTradeIn}
                    className="shrink-0 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
              ยกเลิกเทิร์น
            </button>
          )}
        </div>
        {tradeInEnabled && tradeInOpen && (
          <div id="trade-in-details" className="card-body space-y-3">
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <div className="font-semibold">⚠️ {TRADE_IN_INTAKE_POLICY.newIdentifierOnly}</div>
              <div className="mt-0.5">{TRADE_IN_INTAKE_POLICY.destination}</div>
            </div>
            {/* เลือก SKU ของเครื่องเทิร์น */}
            {tradeInVariant ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-mono font-semibold">{tradeInVariant.sku}</span>
                  {' · '}{tradeInVariant.productName}{' '}
                  {[tradeInVariant.color, tradeInVariant.storage].filter(Boolean).join(' ')}
                </span>
                <button type="button" className="shrink-0 text-xs text-red-600 hover:underline"
                        onClick={() => {
                          setTradeInVariant(null); setTradeInSkuQuery('');
                          setTradeInSearchState('idle'); setTradeInSearchError('');
                        }}>✕ เปลี่ยน SKU</button>
              </div>
            ) : (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  รุ่น / SKU มือ 2 สำหรับจัดหมวดเครื่องที่รับเทิร์น
                </label>
                <input className="input" placeholder="ค้นหา SKU / รุ่น เช่น iPhone 13"
                       value={tradeInSkuQuery} onChange={(e) => {
                         setTradeInSkuQuery(e.target.value); setTradeInResults([]);
                       }} />
                <div aria-live="polite">
                  {tradeInSearchState === 'loading' && (
                    <p className="mt-1 text-xs text-violet-700">กำลังค้นหารุ่น...</p>
                  )}
                  {tradeInSearchState === 'error' && (
                    <div className="mt-1 flex items-center gap-2 text-xs text-red-700">
                      <span>ค้นหารุ่นไม่สำเร็จ: {tradeInSearchError}</span>
                      <button type="button" className="font-semibold underline"
                              onClick={() => setTradeInSearchRetry((retry) => retry + 1)}>ลองใหม่</button>
                    </div>
                  )}
                </div>
                {tradeInResults.length > 0 && (
                  <>
                    {/* FIX-145: บอกชัดว่าต้อง "กดเลือก" — พิมพ์เฉยๆ ไม่นับ (เคยทำปิดบิลไม่ได้โดยไม่รู้สาเหตุ) */}
                    <p className="mt-1 text-xs font-medium text-amber-700">
                      ⚠️ กดเลือกรุ่นจากรายการด้านล่าง (พิมพ์อย่างเดียวยังไม่ได้เลือก)
                    </p>
                    <div className="mt-1 max-h-44 overflow-y-auto rounded-md border border-amber-300">
                      {tradeInResults.map((v) => (
                        <button type="button" key={v.id}
                                onClick={() => {
                                  setTradeInVariant(v); setTradeInResults([]); setTradeInSearchState('idle');
                                }}
                                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-violet-50">
                          <span><span className="font-mono">{v.sku}</span> · {v.productName} <span className="text-slate-500">{[v.color, v.storage].filter(Boolean).join(' ')}</span></span>
                          <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">เลือก</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {tradeInSearchState === 'success' && tradeInSkuQuery.trim() !== ''
                  && tradeInResults.length === 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    ไม่พบรุ่น "{tradeInSkuQuery.trim()}" ในระบบ — สร้าง SKU ก่อนแล้วกลับมาค้นใหม่
                  </p>
                )}
                {canSeeBackOffice ? (
                  <a href="/products/new" target="_blank" rel="noreferrer"
                     className="mt-1 inline-block text-xs font-medium text-violet-700 hover:underline">
                    + ไม่เจอรุ่น? สร้าง SKU ใหม่ (เปิดแท็บใหม่ แล้วกลับมาค้นอีกครั้ง)
                  </a>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">ไม่เจอรุ่น ให้แจ้งผู้จัดการสร้าง SKU มือ 2 ก่อน</p>
                )}
              </div>
            )}
            {/* ข้อมูลเครื่องเก่า + มูลค่า */}
            <div className="grid grid-cols-2 gap-2">
              <input className="input font-mono" maxLength={20} placeholder="IMEI ใหม่ (ต้องไม่เคยมีในระบบ)"
                     value={tradeInImei} onChange={(e) => setTradeInImei(e.target.value)} />
              <input className="input font-mono" maxLength={30} placeholder="Serial (ถ้ามี)"
                     value={tradeInSerial} onChange={(e) => setTradeInSerial(e.target.value)} />
              <input type="number" min={0} max={100} step={1} className="input" placeholder="แบต %"
                     value={tradeInBattery} onChange={(e) => setTradeInBattery(e.target.value)} />
              <input type="number" min={0} max={9999999.99} step="0.01" className="input text-right font-semibold" placeholder="มูลค่าตีเทิร์น (บาท)"
                     value={tradeInValueStr} onChange={(e) => setTradeInValueStr(e.target.value)} />
            </div>
            {/* สภาพเครื่องเทิร์น (FIX-106) */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={tiHasBox} onChange={(e) => setTiHasBox(e.target.checked)} /> มีกล่อง</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={tiHasCharger} onChange={(e) => setTiHasCharger(e.target.checked)} /> สายชาร์จแท้</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={tiHasWarranty} onChange={(e) => setTiHasWarranty(e.target.checked)} /> มีประกัน</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={tiNeedsBattery} onChange={(e) => setTiNeedsBattery(e.target.checked)} /> ต้องเปลี่ยนแบต</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={tiNeedsScreen} onChange={(e) => setTiNeedsScreen(e.target.checked)} /> ต้องเปลี่ยนจอ</label>
            </div>
            <input className="input" maxLength={500} placeholder="อุปกรณ์อื่นที่ต้องเปลี่ยน / โน้ต (ถ้ามี)"
                   value={tiNote} onChange={(e) => setTiNote(e.target.value)} />
            {/* เทิร์นดาวน์ (ผ่อน) */}
            {tradeInActive && isInstallmentSel && (
              <div className="rounded-md bg-violet-50 px-3 py-2 text-xs text-violet-800">
                เทิร์นดาวน์: หักมูลค่าเทิร์น {formatTHB(tradeInValueNum)} จากเงินดาวน์ · ลูกค้าจ่ายดาวน์วันนี้เท่าที่เหลือ
              </div>
            )}
            {/* net < 0 → เลือกวิธีจ่ายคืน (เฉพาะเทิร์นสด ไม่ใช่ผ่อน) */}
            {tradeInActive && !isInstallmentSel && netCollect < 0 && (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-sm">
                <div className="mb-1 font-medium text-amber-800">
                  มูลค่าเทิร์นมากกว่ายอดบิล → จ่ายคืนลูกค้า {formatTHB(-netCollect)}
                </div>
                <div className="flex gap-2">
                  {(['CASH', 'TRANSFER'] as PaymentMethod[]).map((m) => (
                    <button type="button" key={m} onClick={() => setTradeInPayoutMethod(m)}
                            className={`rounded-md border px-3 py-1.5 text-sm ${tradeInPayoutMethod === m ? 'border-amber-500 bg-amber-100 font-semibold text-amber-800' : 'border-slate-200 hover:border-slate-300'}`}>
                      {m === 'CASH' ? '💵 จ่ายสด' : '📲 โอนคืน'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              สร้างเครื่องใหม่ใน “รอลงสต็อก” (มือ 2 · ทุน = มูลค่าตีเทิร์น) · ยังไม่เพิ่มจำนวนพร้อมขาย ·
              ยอดขายบันทึกเต็มราคา · รองรับ เงินสด / โอน / ผ่อน (เทิร์นดาวน์)
            </p>
          </div>
        )}
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
                     value={discount} onChange={(e) => setDiscount(r2(Math.max(0, Number(e.target.value) || 0)))} />
            </div>
            {discountExceedsSubtotal && (
              <div className="text-xs text-red-600">⚠️ ส่วนลดเกินยอดรวม</div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">VAT เพิ่มจากราคาขาย (%)</span>
              {documentMode === 'TAX_INVOICE' ? (
                <span className="rounded bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                  0% · ใบกำกับใช้ VAT ถอดใน
                </span>
              ) : (
                <div className="flex items-center gap-1">
                  {[0, 7].map((r) => (
                    <button key={r} type="button"
                            onClick={() => setVatRate(r)}
                            className={`rounded border px-2 py-1 text-xs ${vatRate === r ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700' : 'border-slate-200 hover:border-slate-300'}`}>
                      {r}%
                    </button>
                  ))}
                  <input type="number" step="0.01" min={0} max={7}
                         className="input w-20 text-right"
                         value={vatRate} onChange={(e) => setVatRate(Math.min(7, Math.max(0, Number(e.target.value) || 0)))} />
                </div>
              )}
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
            {paymentMethod === 'INSTALLMENT' ? (
              // ผ่อน → ตัวใหญ่ = "รับวันนี้" = ดาวน์ + อุปกรณ์เสริมจ่ายสด (หัวชาร์จ/เคส) — FIX-072/FIX-090
              (() => {
                const monthlyShow = installmentMonthly > 0
                  ? installmentMonthly
                  : (installmentMonths > 0 ? Math.ceil(Math.max(0, grandTotal - downAmount - addOnToday) / installmentMonths) : 0);
                // เทิร์นดาวน์ (FIX-106): เงินจริงที่ลูกค้าจ่ายวันนี้ = payToday − มูลค่าเทิร์น
                const payNetView = Math.max(0, payToday - (tradeInActive ? tradeInValueNum : 0));
                const transferView = Math.min(payTransferClamped, payNetView);
                const cashView = payNetView - transferView;
                return (
                  <>
                    <div className="text-xs uppercase text-amber-700 font-semibold">
                      รับวันนี้ {addOnToday > 0 ? '(ดาวน์ + อุปกรณ์เสริม)' : '(เงินดาวน์)'}
                    </div>
                    <div className="rounded-md bg-slate-900 px-4 py-6 text-right text-4xl font-bold text-amber-300">
                      {formatTHB(payNetView)}
                    </div>
                    {tradeInActive && tradeInValueNum > 0 && (
                      <div className="flex justify-between text-xs text-violet-700">
                        <span>↳ หักเทิร์นดาวน์</span><span>- {formatTHB(tradeInValueNum)}</span>
                      </div>
                    )}
                    {/* แยกเงินสด/เงินโอน ของยอดรับวันนี้ (FIX-097) */}
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">💵 เงินสด</span>
                      <span className="font-semibold text-slate-700">{formatTHB(cashView)}</span>
                    </div>
                    {transferView > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-500">📲 เงินโอน</span>
                        <span className="font-semibold text-slate-700">{formatTHB(transferView)}</span>
                      </div>
                    )}
                    {addOnToday > 0 && (
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>(ดาวน์ {formatTHB(downAmount)} + อุปกรณ์เสริม {formatTHB(addOnToday)})</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>ยอดรวมบิล (บันทึกในระบบ)</span>
                      <span>{formatTHB(grandTotal)}</span>
                    </div>
                    {monthlyShow > 0 && installmentMonths > 0 && (
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>ผ่อน {installmentMonths} เดือน</span>
                        <span>{formatTHB(monthlyShow)} / เดือน</span>
                      </div>
                    )}
                  </>
                );
              })()
            ) : (
              <>
                {tradeInActive && (
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">ยอดขาย</span><span>{formatTHB(grandTotal)}</span>
                    </div>
                    <div className="flex justify-between text-violet-700">
                      <span>หักเทิร์น ({tradeInVariant?.sku})</span><span>- {formatTHB(tradeInValueNum)}</span>
                    </div>
                  </div>
                )}
                <div className="text-xs uppercase text-amber-700 font-semibold">
                  {tradeInActive ? (netCollect >= 0 ? 'รับสุทธิจากลูกค้า' : 'จ่ายคืนลูกค้า') : 'ยอดสุทธิที่ต้องชำระ (Net Total)'}
                </div>
                <div className="rounded-md bg-slate-900 px-4 py-6 text-right text-4xl font-bold text-amber-300">
                  {formatTHB(tradeInActive ? Math.abs(netCollect) : grandTotal)}
                </div>
              </>
            )}
            <CashierPicker selectedId={cashierProfileId} onSelect={setCashierProfileId} />
            <SaleDocumentSelector
              mode={documentMode}
              buyerName={taxInvoiceDraft.customerName}
              disabled={checkout.isPending}
              shippingLabelSelected={printShippingLabelAfterCheckout}
              shippingRecipientReady={!shippingRecipientError}
              onReceipt={() => { setDocumentMode('RECEIPT'); setVatRate(0); }}
              onTaxInvoice={openTaxInvoiceDetails}
              onToggleShippingLabel={() => {
                setPrintShippingLabelAfterCheckout((selected) => !selected);
                setShipCardOpen(true);
              }}
            />
            <button
              className="btn-primary w-full bg-emerald-600 hover:bg-emerald-700 text-base"
              disabled={checkout.isPending || !!checkoutBlockedReason}
              title={checkoutBlockedReason ?? undefined}
              onClick={() => checkout.mutate()}>
              <Receipt className="h-5 w-5" />
              {checkout.isPending ? 'กำลังปิดบิล...'
                : checkoutBlockedReason
                  ? checkoutBlockedReason
                  : documentMode === 'TAX_INVOICE'
                    ? `รับชำระ · ออกใบกำกับ · พิมพ์${printShippingLabelAfterCheckout ? ' · ป้ายที่อยู่' : ''}`
                    : `รับชำระและปิดบิล${printShippingLabelAfterCheckout ? ' · ป้ายที่อยู่' : ''}`}
            </button>
            {lastBill && (
              <LatestBillActions
                order={lastBill}
                printing={printer.printing}
                onPrintReceipt={() => printer.printReceipt(lastBill.id, {
                  openDrawer: false,
                  browserPrint: ({ duplicate }) => printReceiptInBrowser({ order: lastBill, duplicate }),
                }).catch(() => undefined)}
                onPrintTaxInvoice={() => printer.printTaxInvoice(lastBill.id, { openDrawer: false })
                  .catch(() => undefined)}
                onIssueTaxInvoice={() => setTaxInvoiceFor(lastBill)}
                onPrintShippingLabel={() => setShippingLabelFor(lastBill)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showOwnerShip && (
        <OwnerShippingModal onClose={() => setShowOwnerShip(false)} />
      )}
      {showCustomerPicker && (
        <CustomerPickerModal
          onSelect={selectCustomer}
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
      {showLookup && <DeviceLookupModal onClose={() => setShowLookup(false)} />}
      {showRepair && (
        <RepairIntakeModal
          onClose={() => setShowRepair(false)}
          onCreated={(ticket) => {
            setLastBill(null);
            setReceiptToPrint(null);
            setRepairToPrint(ticket);
          }}
        />
      )}
      {showOpenSession && (
        <OpenSessionModal onClose={() => setShowOpenSession(false)} />
      )}
      {showQuickReprint && (
        <QuickReprintModal
          onClose={() => setShowQuickReprint(false)}
          printing={printer.printing}
          onPrint={(order) => printer.printReceipt(order.id, {
            openDrawer: false,
            browserPrint: ({ duplicate }) => printReceiptInBrowser({ order, duplicate }),
          })}
        />
      )}
      {showPrinterSettings && (
        <PrinterSettingsModal
          status={printer.status}
          onClose={() => setShowPrinterSettings(false)}
          onRefresh={printer.refresh}
          onRequestWebUsb={printer.requestWebUsb}
          onSetBridgeToken={printer.setBridgeToken}
          onSetBridgeUrl={printer.setBridgeUrl}
          getBridgeUrl={printer.getBridgeUrl}
          onOpenDrawer={() => printer.openDrawer('MANUAL')}
          onSetAgentMode={printer.setAgentMode}
          getAgentConfig={printer.getAgentConfig}
        />
      )}

      {/* Hidden printouts — only visible when window.print() fires.
          แสดงครั้งละหนึ่งใบเท่านั้น (ใบเสร็จขาย หรือ ใบรับซ่อม) เพื่อกันพิมพ์ซ้อน */}
      {repairToPrint
        ? <RepairBillPrintView ticket={repairToPrint} />
        : receiptToPrint
          ? <ReceiptPrintView order={receiptToPrint.order} duplicate={receiptToPrint.duplicate} />
          : lastBill && <ReceiptPrintView order={lastBill} />}
    </div>
  );
}

// ─── Installment Panel ────────────────────────────────────────────────────

const MONTH_OPTIONS = [3, 6, 10, 12, 18, 24, 36];

interface InstallmentPanelProps {
  grandTotalTarget: number;
  /** อุปกรณ์เสริม (bulk) ในบิล — จ่ายสดวันนี้ ไม่รวมยอดผ่อน (FIX-090) */
  addOnToday?: number;
  months: number; setMonths: (m: number) => void;
  monthly: number; setMonthly: (n: number) => void;   // ค่างวด/เดือน — ส่งเข้า checkout เพื่อใช้ใน LINE/บิล
  monthlyTouched: boolean; setMonthlyTouched: (b: boolean) => void;  // state อยู่ที่ parent (reset ได้หลังปิดบิล)
  downAmount: number; setDownAmount: (n: number) => void;
  /** ยอดรับวันนี้จ่ายเป็นเงินโอนเท่าไหร่ · ที่เหลือ = เงินสด (FIX-097) */
  payTransfer: number; setPayTransfer: (n: number) => void;
}

function InstallmentPanel({
  grandTotalTarget, addOnToday = 0, months, setMonths, monthly, setMonthly, monthlyTouched, setMonthlyTouched,
  downAmount, setDownAmount, payTransfer, setPayTransfer,
}: InstallmentPanelProps) {
  // ยอดผ่อนคงเหลือ = ยอดบิล − ดาวน์ − อุปกรณ์เสริมที่จ่ายสดวันนี้ (หัวชาร์จ/เคส ไม่รวมยอดผ่อน) FIX-090
  const remaining = Math.max(0, grandTotalTarget - downAmount - addOnToday);
  const payToday = downAmount + addOnToday;
  // ยอดรับวันนี้แยก เงินสด/เงินโอน — โอนไม่เกินยอดรวม · ที่เหลือ = เงินสด (FIX-097)
  const transferPart = Math.min(Math.max(0, payTransfer), payToday);
  const cashPart = Math.max(0, payToday - transferPart);

  // ค่างวด/เดือน — พนักงานกรอกเองได้ (ยืดหยุ่น รองรับดอกเบี้ยบริษัทผ่อน) แล้วคูณกับจำนวนเดือน
  // ค่าตั้งต้น = เงินต้นคงเหลือ ÷ เดือน (ปัดขึ้น) จนกว่าผู้ใช้จะแก้เอง · state+touched อยู่ที่ parent (reset หลังปิดบิล)
  useEffect(() => {
    if (!monthlyTouched) setMonthly(months > 0 ? Math.ceil(remaining / months) : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, months, monthlyTouched]);
  const totalInstallment = monthly * months;
  const interest = Math.max(0, totalInstallment - remaining);

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
          {/* กำหนดเดือนเอง — พนักงานเลือกได้ยืดหยุ่น (คำนวณ/เดือนอัตโนมัติ) */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">หรือกำหนดเอง:</span>
            <input
              type="number" min={1} max={60} step={1} inputMode="numeric"
              className={`input w-24 text-center text-sm font-semibold ${
                !MONTH_OPTIONS.includes(months) ? 'border-purple-400 bg-purple-50 text-purple-800' : ''
              }`}
              value={months}
              onChange={(e) => setMonths(Math.max(1, Math.min(60, Math.floor(Number(e.target.value) || 1))))}
            />
            <span className="text-xs text-slate-500">เดือน (1–60) · กรอกค่างวด/เดือนด้านล่างเองได้</span>
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
            {addOnToday > 0 && (
              <div className="mb-1 flex items-center justify-between">
                <div className="text-xs text-slate-500">อุปกรณ์เสริม (จ่ายสดวันนี้ ไม่รวมยอดผ่อน)</div>
                <div className="text-sm font-semibold text-emerald-700">{formatTHB(addOnToday)}</div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">ส่วนที่เหลือผ่อน (เงินต้น)</div>
              <div className="text-sm font-semibold">{formatTHB(remaining)}</div>
            </div>
            <div className="mt-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-medium text-slate-600">ค่างวด / เดือน (บาท)</label>
                {monthlyTouched && (
                  <button type="button"
                    onClick={() => setMonthlyTouched(false)}
                    className="text-[11px] text-purple-600 hover:underline">
                    ↻ คำนวณจากเงินต้น
                  </button>
                )}
              </div>
              <input
                type="number" min={0} step="100" inputMode="numeric"
                className="input mt-1 text-base font-semibold"
                value={monthly}
                onChange={(e) => { setMonthlyTouched(true); setMonthly(Math.max(0, Number(e.target.value) || 0)); }}
              />
            </div>
            <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-600">
              <strong className="text-purple-700">{formatTHB(monthly)}</strong> × {months} เดือน =
              {' '}<strong className="text-purple-700">{formatTHB(totalInstallment)}</strong> รวมที่ต้องผ่อน
              {interest > 0 && (
                <span className="text-slate-400"> · ส่วนต่าง/ดอกเบี้ย {formatTHB(interest)}</span>
              )}
            </div>
          </div>
        </div>

        {/* ยอดที่ต้องชำระวันนี้ (ยอดเดียว) + แยกเงินสด/เงินโอน (FIX-097) */}
        <div className="rounded-md border-2 border-amber-300 bg-amber-50/70 p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-amber-900">ยอดที่ต้องชำระวันนี้</span>
            <span className="text-lg font-bold text-amber-900">{formatTHB(payToday)}</span>
          </div>
          {addOnToday > 0 && (
            <div className="mt-0.5 text-[11px] text-amber-700">
              = เงินดาวน์ {formatTHB(downAmount)} + อุปกรณ์เสริม {formatTHB(addOnToday)}
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">📲 เงินโอน (บาท)</label>
              <input
                type="number" min={0} max={payToday} step="100" inputMode="numeric"
                className="input"
                value={payTransfer || ''}
                placeholder="0"
                onChange={(e) => setPayTransfer(Math.max(0, Number(e.target.value) || 0))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">💵 เงินสด (บาท)</label>
              <div className="input flex items-center bg-slate-50 font-semibold text-slate-700">
                {formatTHB(cashPart)}
              </div>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            กรอกยอดโอน · ที่เหลือระบบคิดเป็นเงินสดให้อัตโนมัติ (รวม = {formatTHB(payToday)})
          </p>
        </div>

        <div className="rounded-md bg-purple-50 px-3 py-2 text-xs text-purple-800">
          💡 ระบบจะบันทึก: <strong>รับวันนี้ {formatTHB(payToday)}</strong>
          {' '}(💵 สด {formatTHB(cashPart)}{transferPart > 0 ? ` · 📲 โอน ${formatTHB(transferPart)}` : ''})
          • <strong>{formatTHB(remaining)}</strong> ที่เหลือคือยอดผ่อน
        </div>
      </div>
    </div>
  );
}
