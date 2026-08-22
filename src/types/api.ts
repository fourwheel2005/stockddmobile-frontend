// ─── Auth ─────────────────────────────────────────────────────────────────

export type Role = 'ADMIN' | 'MANAGER' | 'STAFF';

export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: Role;
  active: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

// ─── Product / Category ───────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  children?: Category[];
}

export interface ProductSummary {
  id: string;
  name: string;
  brand: string;
  modelNumber: string | null;
  serialized: boolean;
  active: boolean;
  categoryId: string;
  categoryName: string;
  createdAt: string;
}

export interface VariantResponse {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  color: string | null;
  storage: string | null;
  network: string | null;
  barcode: string | null;
  costPrice: number | null;   // null สำหรับ STAFF (เห็นได้เฉพาะ ADMIN/MANAGER)
  costCode: string | null;    // รหัสตัวอักษรของต้นทุน (แสดงให้ STAFF)
  sellingPrice: number;
  reorderPoint: number;
  imageUrl: string | null;
  imageUrls?: string[] | null;
  active: boolean;
  /** "มือ" ของ SKU (FIX-113): NEW=มือ1 · SECOND_HAND=มือ2 · null=ยังไม่ผูกมือ (ไม่เคยมีเครื่อง) */
  condition?: 'NEW' | 'SECOND_HAND' | null;
  downPayment?: number | null;         // ผ่อนดาวน์ มือ 1 (แผนแรก · back-compat เว็บหน้าร้าน)
  installmentTerms?: string | null;    // JSON: [{"months":12,"monthly":2190}, ...]
  installmentPromo?: string | null;
  installmentPlans?: string | null;    // JSON แผนหลายแบบ: [{"label","down","promo","terms":[...]}, ...]
  createdAt: string;
  updatedAt: string;
}

/** รุ่นสินค้าใน catalog สำหรับระบุเครื่องที่ลูกค้านำมา — ไม่มี Stock/SKU/ราคา. */
export interface TradeInProductResponse {
  id: string;
  name: string;
  brand: string;
}

export interface ProductDetail {
  id: string;
  name: string;
  brand: string;
  modelNumber: string | null;
  description: string | null;
  serialized: boolean;
  active: boolean;
  category: Category;
  variants: VariantResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductRequest {
  categoryId: string;
  name: string;
  brand?: string;
  modelNumber?: string;
  description?: string;
  serialized: boolean;
}

export interface CreateVariantRequest {
  sku: string;
  color?: string;
  storage?: string;
  network?: string;
  barcode?: string;
  costPrice: number;
  sellingPrice: number;
  reorderPoint: number;
  imageUrl?: string;
  imageUrls?: string[];
  downPayment?: number | null;
  installmentTerms?: string | null;
  installmentPromo?: string | null;
  installmentPlans?: string | null;    // JSON แผนหลายแบบ
}

// ─── Edit (แก้ที่พิมพ์ผิด หลังสร้าง/รับของ) ────────────────────────────
export interface UpdateVariantRequest {
  color?: string;
  storage?: string;
  network?: string;
  barcode?: string;
  costPrice: number;
  sellingPrice: number;
  reorderPoint: number;
  imageUrl?: string;
  imageUrls?: string[];
  active: boolean;
  downPayment?: number | null;
  installmentTerms?: string | null;
  installmentPromo?: string | null;
  installmentPlans?: string | null;    // JSON แผนหลายแบบ
}

export interface UpdateSerialRequest {
  imei?: string;
  imei2?: string;
  serialNumber: string;
  deviceColor?: string;
  modelNumber?: string;
  deviceStorage?: string;
  deviceNetwork?: string;
  warrantyTerms?: string;
  batteryHealth?: number;
  condition?: SerializedCondition;
  acquisitionType?: AcquisitionType;   // ที่มา (null = ไม่แตะค่าเดิม)
  sourceCustomer?: string;             // ชื่อลูกค้าที่คืนเครื่อง (RETURN_CREDIT)
  purchasePrice?: number;              // ราคาทุนรายเครื่อง
  sellingPrice?: number;               // ราคาขายรายเครื่อง
  warrantyExpire?: string;             // YYYY-MM-DD
  note?: string;
  imageUrls?: string[];   // แก้รูปรายเครื่อง (แทนที่ทั้งชุด · รูปแรก = ปก)
  downPayment?: number | null;         // ผ่อนดาวน์ มือ 2 (รายเครื่อง)
  installmentTerms?: string | null;    // JSON: [{"months":12,"monthly":2190}, ...]
  installmentPromo?: string | null;
  installmentProvided?: boolean;       // true = ตั้งใจแก้ตารางผ่อน (ให้ backend เซ็ต/ล้าง)
}

// ─── Device Service Log (ประวัติซ่อม/อะไหล่รายเครื่อง — เครื่องมือสอง) ────
export type DeviceServiceType = 'SELF' | 'OUTSOURCED';

export interface DeviceServiceLogRequest {
  type: DeviceServiceType;
  detail: string;          // อะไหล่ (SELF) / อาการ (OUTSOURCED)
  vendorName?: string;     // ชื่อช่าง (เฉพาะ OUTSOURCED)
  cost: number;
  servicedAt?: string;     // YYYY-MM-DD (null = วันนี้)
  note?: string;
}

export interface DeviceServiceLogResponse {
  id: string;
  type: DeviceServiceType;
  detail: string;
  vendorName: string | null;
  cost: number | null;         // null สำหรับ STAFF
  costCode: string | null;     // รหัสตัวอักษร (แสดงให้ STAFF)
  servicedAt: string;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

// ─── Product Wizard (สร้างหน้าเดียว — atomic, รองรับหลาย variants) ────
export interface WizardVariantSpec {
  sku: string;
  color?: string;
  storage?: string;
  network?: string;
  barcode?: string;
  costPrice: number;
  sellingPrice: number;
  reorderPoint: number;
  imageUrl?: string;
  imageUrls?: string[];
  downPayment?: number;          // ผ่อนดาวน์ มือ1 (ต่อรุ่น) = แผนแรก (back-compat)
  installmentTerms?: string;     // JSON [{months,monthly}]
  installmentPromo?: string;
  installmentPlans?: string;     // JSON แผนหลายแบบ [{"label","down","promo","terms":[...]}, ...]
}

export interface WizardInitialItem {
  serialNumber: string;
  stockCode?: string;
  imei?: string;
  imei2?: string;
  condition?: 'NEW' | 'SECOND_HAND' | 'LIKE_NEW' | 'REFURBISHED' | 'DEFECTIVE';
  batteryHealth?: number;
  // อุปกรณ์เครื่องมือสอง (FIX-108) — ตัวเครื่องเปล่า = ทั้งคู่ false
  hasBox?: boolean;
  hasCharger?: boolean;
  deviceColor?: string;
  modelNumber?: string;
  deviceStorage?: string;
  deviceNetwork?: string;
  acquisitionType?: AcquisitionType;
  sourceCustomer?: string;       // ชื่อลูกค้าที่คืนเครื่อง (RETURN_CREDIT)
  purchasePrice?: number;
  sellingPrice?: number;
  warrantyTerms?: string;
  /** วันหมดประกัน YYYY-MM-DD */
  warrantyExpire?: string;
  /** รูปรายเครื่อง (หลายรูป) — รูปแรก = ปก */
  imageUrls?: string[];
  downPayment?: number;          // ผ่อนดาวน์ มือ2 (ต่อเครื่อง)
  installmentTerms?: string;     // JSON [{months,monthly}]
  installmentPromo?: string;
}

export interface WizardVariantBlock {
  spec: WizardVariantSpec;
  // เลือกอย่างใดอย่างหนึ่ง:
  quantity?: number;              // bulk
  items?: WizardInitialItem[];    // serialized
  // bulk lot info (ใช้เฉพาะกรณีอุปกรณ์เสริม)
  acquisitionType?: AcquisitionType;
  unitCost?: number;
  supplierRef?: string;
  invoiceNo?: string;
  lotNote?: string;
}

export interface ProductWizardRequest {
  // Product
  categoryId: string;
  name: string;
  brand?: string;
  modelNumber?: string;
  description?: string;
  serialized: boolean;
  /** รับเข้าสาขาไหน (Phase 2A) — เว้น = สาขาเริ่มต้น (MAIN) */
  branchId?: string;
  // ≥1 variants
  variants: WizardVariantBlock[];
  // shared lot info (serialized only, optional)
  lotNo?: string;
  importDate?: string;   // YYYY-MM-DD
  note?: string;
}

/** เพิ่ม SKU ใหม่ใน Product ที่มีอยู่ + รับสต็อกล็อตแรก (Clone Flow). */
export interface AddVariantWithStockRequest {
  variant: WizardVariantBlock;
  branchId?: string;
  lotNo?: string;
  importDate?: string;
  note?: string;
}

// ─── Inventory ────────────────────────────────────────────────────────────

export interface InventoryResponse {
  variantId: string;
  sku: string;
  productName: string;
  color: string | null;
  storage: string | null;
  quantity: number;
  reservedQty: number;
  availableQty: number;
  reorderPoint: number;
  lowStock: boolean;
  newInStock?: number;            // จำนวนพร้อมขาย "มือ 1"
  secondHandInStock?: number;     // จำนวนพร้อมขาย "มือ 2"
  everReceived?: boolean;         // เคยมีเครื่องเข้า SKU นี้ไหม — แยก "ขายหมด" vs "ยังไม่เคยรับเข้า" (FIX-113)
  imageUrl?: string | null;       // รูปปก
  imageUrls?: string[] | null;    // รูปทั้งหมด (เว็บหน้าร้านดึงไปแสดง)
  updatedAt: string;
}

/** สรุปจำนวนเครื่องพร้อมขาย (IN_STOCK) แยกมือ1/มือ2 — total = new + secondHand */
/** F-มือ1 (FIX-138): แถวตารางผ่อนมือ 1 (ต่อ รุ่น×ความจุ) — อ่าน/เขียน ProductVariant มือ 1 โดยตรง */
export interface FirstHandInstallmentRow {
  productId: string;
  productName: string;
  storage: string;                 // digits ("128")
  downPayment: number | null;
  installmentTerms: string | null; // JSON [{months,monthly}]
  variantCount: number;
}

export interface UpsertFirstHandInstallmentRequest {
  productId: string;
  storage: string;
  downPayment?: number | null;     // null = ล้างค่าผ่อนกลุ่มนี้
  installmentTerms?: string | null;
}

export interface StockSummaryResponse {
  totalAvailable: number;
  newAvailable: number;
  secondHandAvailable: number;
}

export interface DailyStockHeld {
  pendingIntake: number;
  reserved: number;
  defective: number;
  returned: number;
}

export interface DailyStockOnHand {
  readyToSell: number;
  held: DailyStockHeld;
  expectedPhysical: number;
}

export interface DailyStockGroup {
  label: string;
  onHand: DailyStockOnHand;
  soldToday: number;
}

export interface DailyStockBalance {
  context: { businessDate: string; branchId: string | null };
  newDevices: DailyStockGroup;
  secondHandDevices: DailyStockGroup;
  total: DailyStockGroup;
  /** รับเข้าวันนี้ทุกช่องทาง (FIX-158) */
  intakeToday: {
    total: number;
    purchase: number;   // มือ2/ของซื้อเข้า (รวมซัพพลายเออร์)
    tradeIn: number;    // เทิร์นเข้า
    outright: number;   // ลูกค้ามาขาย (ซื้อขายขาด)
    buyback: number;    // บอลลูนไม่ไปต่อ + ลูกค้าคืนเครื่อง
  };
}

/** ตรวจนับสต็อกเปิด/ปิดร้าน (FIX-158) */
export interface StockCountRequestPayload {
  countedNew: number;
  countedSecondHand: number;
  certified: true;
  certifiedName: string;
  note?: string;
}

export interface StockCountResponse {
  phase: 'OPENING' | 'CLOSING';
  expectedNew: number;
  expectedSecondHand: number;
  countedNew: number;
  countedSecondHand: number;
  varianceNew: number;
  varianceSecondHand: number;
  matched: boolean;
  certifiedName: string;
  countedAt: string;
}

/** F-12 (FIX-135): แถว reconciliation — serialized SKU ที่ inventory.quantity ไม่ตรงจำนวน IMEI พร้อมขายจริง */
export interface StockReconciliationRow {
  variantId: string;
  sku: string;
  productName: string;
  inventoryQty: number;
  actualInStock: number;
  diff: number;
}

/** จำนวนบิล/ยอดรวมต่อวัน — มาร์กวันที่มีการขายบนปฏิทิน */
export interface SalesDayCount {
  date: string;   // YYYY-MM-DD
  count: number;
  total: number;
}

export type SerializedStatus =
  | 'IN_STOCK' | 'PENDING_INTAKE' | 'RESERVED' | 'SOLD' | 'DEFECTIVE' | 'RETURNED' | 'TRANSFERRED';

export type AcquisitionType =
  // ประเภทธุรกรรม
  | 'PURCHASE' | 'TRADE_IN' | 'OUTRIGHT' | 'RETURN_CREDIT' | 'BALLOON_BUYBACK'
  // ซัพพลายเออร์หน้าร้าน
  | 'ICE' | 'BORROW' | 'P_GREEN' | 'GREETER' | 'RED_HEAT' | 'AMP_MOBILE';
export type ServiceState = 'AWAITING_REPAIR' | 'SENT_CLAIM';
export type SerializedCondition = 'NEW' | 'SECOND_HAND' | 'LIKE_NEW' | 'REFURBISHED' | 'DEFECTIVE';

export interface SerializedItemResponse {
  id: string;
  variantId: string;
  productId?: string | null;   // ลิงก์ไปหน้ารุ่นตรงๆ (FIX-124)
  categoryRootName?: string | null;
  sku: string;
  productName: string | null;
  imei: string | null;
  imei2: string | null;
  serialNumber: string;
  stockCode: string | null;
  status: SerializedStatus;
  condition: string;
  receivedAt: string;
  soldAt: string | null;
  warrantyExpire: string | null;
  warrantyTerms: string | null;
  purchasePrice: number | null;
  purchasePriceCode: string | null;   // รหัสต้นทุน (แสดงให้ STAFF)
  refurbCost: number | null;          // ค่าซ่อม/อะไหล่สะสม (null สำหรับ STAFF)
  totalCost: number | null;           // ต้นทุนรวม = ทุน + ค่าซ่อม (null สำหรับ STAFF)
  sellingPrice: number | null;        // ราคาขายรายเครื่อง
  batteryHealth: number | null;
  deviceColor: string | null;
  modelNumber: string | null;
  deviceStorage: string | null;
  deviceNetwork: string | null;
  acquisitionType: AcquisitionType | null;
  sourceCustomer: string | null;   // ชื่อลูกค้าที่คืนเครื่อง (RETURN_CREDIT)
  serviceState: ServiceState | null;
  defectNote: string | null;
  imageUrls?: string[] | null;     // รูปรายเครื่อง — เว็บหน้าร้านดึงไปแสดง
  branchId?: string | null;        // เครื่องอยู่สาขาไหน (Phase 2A)
  branchName?: string | null;
  downPayment?: number | null;         // ผ่อนดาวน์ มือ 2 (เว็บหน้าร้านดึงไปแสดง)
  installmentTerms?: string | null;    // JSON: [{"months":12,"monthly":2190}, ...]
  installmentPromo?: string | null;
}

/** ยอดขายแยกสาขา (Phase 2C) */
export interface BranchSalesRow {
  branchName: string;
  orders: number;
  revenue: number;
  cost: number;
  profit: number;
}

/** สาขา (Phase 2A) */
export interface Branch {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  defaultPrinterId?: string | null;
  active: boolean;
}

export interface BranchRequest {
  code: string;
  name: string;
  address?: string;
  phone?: string;
  defaultPrinterId?: string;
  active?: boolean;
}

/** โอนสต๊อกระหว่างสาขา (Phase 2B) */
export type TransferStatus = 'PENDING' | 'RECEIVED' | 'CANCELLED';

export interface TransferItem {
  serialItemId: string;
  stockCode: string | null;
  imei: string | null;
  serialNumber: string;
  productName: string | null;
  deviceColor: string | null;
  deviceStorage: string | null;
}

export interface Transfer {
  id: string;
  transferNo: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  status: TransferStatus;
  createdBy: string;
  createdAt: string;
  receivedBy: string | null;
  receivedAt: string | null;
  note: string | null;
  itemCount: number;
  items: TransferItem[];
}

export interface CreateTransferRequest {
  toBranchId: string;
  serialItemIds: string[];
  note?: string;
}

export interface ServiceActionRequest {
  serviceState: ServiceState;
  defectNote?: string;
}

export type StockTxType =
  | 'INBOUND' | 'OUTBOUND' | 'ADJUSTMENT' | 'TRANSFER' | 'RETURN' | 'RESERVE' | 'RESERVE_CANCEL';

export interface StockTransactionResponse {
  id: string;
  transactionNo: string;
  variantId: string;
  sku: string;
  productName: string;
  type: StockTxType;
  quantity: number;
  qtyBefore: number;
  qtyAfter: number;
  referenceNo: string | null;
  referenceType: string | null;
  note: string | null;
  performedBy: string;
  approvedBy: string | null;
  performedAt: string;
}

export interface InboundRequest {
  variantId: string;
  quantity?: number;
  referenceNo?: string;
  referenceType?: string;
  note?: string;
  serializedItems?: Array<{
    serialNumber: string;
    imei?: string;
    imei2?: string;
    condition?: string;
    purchasePrice?: number;
    warrantyExpire?: string;
  }>;
}

export interface OutboundRequest {
  variantId: string;
  quantity?: number;
  serialIdentifiers?: string[];
  referenceNo?: string;
  referenceType?: string;
  note?: string;
}

export interface AdjustmentRequest {
  variantId: string;
  newQuantity: number;
  reason: string;
}

export interface StockMovementResponse {
  transactionId: string;
  transactionNo: string;
  variantId: string;
  qtyBefore: number;
  qtyAfter: number;
  lowStockAlertCreated: boolean;
  affectedSerialItemIds: string[];
}

export type AlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface LowStockAlertResponse {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  currentQty: number;
  thresholdQty: number;
  status: AlertStatus;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}

export interface ApiError {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
  errors?: Array<{ field: string; message: string }>;
}

// ─── Phase 5: Stock Lot ───────────────────────────────────────────────────

export interface LotResponse {
  id: string;
  lotNo: string;
  importDate: string;
  totalItems: number;
  totalCost: number;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface LotInboundRequest {
  lotNo: string;
  importDate: string;
  note?: string;
  items: Array<{
    variantId: string;
    serialNumber: string;
    imei?: string;
    imei2?: string;
    condition?: string;
    batteryHealth?: number;
    acquisitionType?: AcquisitionType;
    warrantyTerms?: string;
    deviceColor?: string;
    modelNumber?: string;
    deviceStorage?: string;
    deviceNetwork?: string;
    purchasePrice?: number;
  }>;
}

// ─── Phase 5: POS ─────────────────────────────────────────────────────────

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'QR' | 'INSTALLMENT' | 'MIXED';
export type SalesOrderStatus = 'DRAFT' | 'PAID' | 'CANCELLED' | 'REFUNDED';

/** V31 — Finance partner สำหรับ INSTALLMENT ผ่านสถาบันการเงิน */
export type FinancePartner =
  | 'MBK' | 'SCB' | 'KTC' | 'AEON' | 'KRUNGSRI'
  | 'SAMSUNG_FIN' | 'HOMECREDIT' | 'UMAY' | 'OTHER';

export type FinancePayoutStatus = 'PENDING' | 'APPROVED' | 'RECEIVED' | 'DECLINED';

export const FINANCE_PARTNER_LABEL: Record<FinancePartner, string> = {
  MBK:         'MBK',
  SCB:         'ไทยพาณิชย์ (SCB)',
  KTC:         'กรุงไทย (KTC)',
  AEON:        'อิออน (AEON)',
  KRUNGSRI:    'กรุงศรี',
  SAMSUNG_FIN: 'Samsung Financial',
  HOMECREDIT:  'โฮมเครดิต',
  UMAY:        'อูเมะ',
  OTHER:       'อื่นๆ',
};

export const FINANCE_STATUS_LABEL: Record<FinancePayoutStatus, string> = {
  PENDING:  'รออนุมัติ',
  APPROVED: 'อนุมัติแล้ว รอเงินโอน',
  RECEIVED: 'รับเงินแล้ว',
  DECLINED: 'ปฏิเสธ',
};

/** Split payment ใช้กับ MIXED order — sum ต้อง = grandTotal (±0.01) */
export interface PaymentSplit {
  cash:     number;
  transfer: number;
  card:     number;
  qr:       number;
}

/** Q4 — รายงาน shipping partner */
export interface ShippingPartnerReport {
  fromDate: string;
  toDate: string;
  totalShipments: number;
  totalShippingFee: number;
  totalGrandpa: number;
  totalGrandma: number;
  totalRegister: number;
  rows: ShippingPartnerRow[];
}
export interface ShippingPartnerRow {
  partner: ShippingPartner;
  orderCount: number;
  totalFee: number;
  grandpaFee: number;
  grandmaFee: number;
  registerFee: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
}

export interface CustomerRequest {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  note?: string;
}

export interface CartScanResponse {
  serialized: boolean;
  variantId: string;
  sku: string;
  productName: string;
  color: string | null;
  storage: string | null;
  labelPrice: number;
  sellPrice: number;
  serialItemId: string | null;
  imei: string | null;
  serialNumber: string | null;
  availableQty: number;
}

export interface CheckoutLine {
  /** เว้นว่าง = รายการพิมพ์เอง (ของที่ไม่ได้ลงสต็อก) → ต้องส่ง customName แทน — FIX-099 */
  variantId?: string;
  /** ชื่อสินค้าที่พนักงานพิมพ์เอง (ใช้คู่กับ variantId ว่าง) */
  customName?: string;
  /** ทุนต่อชิ้นของรายการพิมพ์เอง กรอกเป็นรหัสตัวอักษร (เช่น SRR = 200) — เว้นว่างได้ */
  unitCostCode?: string;
  serialItemId?: string;
  quantity: number;
  labelPrice: number;
  sellPrice: number;
  /** บิลผ่อน: บรรทัดนี้จ่ายสดวันนี้ (อุปกรณ์เสริม) แทนรวมยอดผ่อน — FIX-094
   *  ไม่ส่ง = backend fallback เป็น "ไม่มี serial = จ่ายวันนี้" (เข้ากันได้กับ FIX-090) */
  payToday?: boolean;
}

export type ShippingPartner =
  | 'ICE'
  | 'YUEM_MAI'
  | 'PEE_KEAW'
  | 'GREATER'
  | 'RED_HEAT'
  | 'AMP_MOBILE'
  | 'PICKUP'
  | 'OTHER';

export type OrderChannel = 'WALK_IN' | 'ONLINE';

export type PaidFrom = 'REGISTER' | 'OWNER_GRANDPA' | 'OWNER_GRANDMA' | 'CUSTOMER' | 'BANK';

export type CashMovementType =
  | 'SALE_CASH' | 'SALE_TRANSFER' | 'SALE_CARD' | 'SALE_QR'
  | 'FINANCE_PAYOUT_RECEIVED'
  | 'REFUND_CASH' | 'REFUND_TRANSFER'
  | 'PAYOUT_SHIPPING' | 'PAYOUT_EXPENSE' | 'TRADEIN_PAYOUT'
  | 'CASH_IN' | 'SAFE_DROP' | 'PETTY_CASH_FROM_OWNER' | 'OPENING_FLOAT' | 'ADJUSTMENT';

export type SessionStatus = 'OPEN' | 'CLOSED';

export interface CashMovementLine {
  id: string;
  type: CashMovementType;
  amount: number;         // กระทบเก๊ะ (โอน/บัตร/QR = 0)
  displayAmount: number;  // ยอดจริงเพื่อแสดงผล (โอน/บัตร/QR = ยอดที่รับจริง)
  paidFrom: PaidFrom;
  referenceType: string | null;
  referenceNo: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

/** V31 — สรุปยอดรับเงินแยกตาม method สำหรับ "เย็นนี้สรุปสด/โอน" */
export interface PaymentBreakdown {
  cashTotal:          number;
  cashOrderCount:     number;
  transferTotal:      number;
  transferOrderCount: number;
  cardTotal:          number;
  cardOrderCount:     number;
  qrTotal:            number;
  qrOrderCount:       number;
  grandTotal:         number;
  totalOrderCount:    number;
}

export interface CashSessionResponse {
  id: string;
  sessionNo: string;
  registerId: string;
  registerName: string;
  status: SessionStatus;
  openedBy: string;
  openedAt: string;
  openingFloat: number;
  closedBy: string | null;
  closedAt: string | null;
  expectedClose: number | null;
  actualClose: number | null;
  variance: number | null;
  note: string | null;
  /** V31 — null สำหรับ session เก่าก่อน V31 */
  breakdown: PaymentBreakdown | null;
  refundCashTotal: number;
  refundTransferTotal: number;
  refundTotal: number;
  refundCount: number;
  netSalesTotal: number;
  cashInTotal: number;
  payoutTotal: number;
  safeDropTotal: number;
  adjustmentTotal: number;
  financePayoutTotal: number;
  ownerPaidTotal: number;
  movements: CashMovementLine[] | null;
}

export interface CashPeriodSummaryResponse {
  fromDate: string;
  toDate: string;
  generatedAt: string;
  registerId: string | null;
  registerName: string;
  sessionCount: number;
  balancedSessionCount: number;
  shortageSessionCount: number;
  overageSessionCount: number;
  breakdown: PaymentBreakdown;
  refundCashTotal: number;
  refundTransferTotal: number;
  refundTotal: number;
  refundCount: number;
  netSalesTotal: number;
  cashInTotal: number;
  payoutTotal: number;
  safeDropTotal: number;
  adjustmentTotal: number;
  financePayoutTotal: number;
  ownerPaidTotal: number;
  openingFloatTotal: number;
  expectedCloseTotal: number;
  actualCloseTotal: number;
  varianceTotal: number;
  shortageTotal: number;
  overageTotal: number;
}

export interface OpenSessionRequest {
  registerId?: string;
  branchId?: string;       // เปิดกะของสาขาไหน (Phase 2C)
  /** เว้นว่าง = ใช้เงินทอนตั้งต้นมาตรฐานของร้าน (FIX-100) */
  openingFloat?: number;
  note?: string;
  stockCount: StockCountRequestPayload;   // FIX-158 บังคับ
}

export interface CloseSessionRequest {
  actualClose: number;
  note?: string;
  stockCount: StockCountRequestPayload;   // FIX-158 บังคับ
}

export interface CashMovementRequest {
  type: CashMovementType;
  amount: number;
  paidFrom?: PaidFrom;
  referenceType?: string;
  referenceNo?: string;
  note?: string;
}

export interface OwnerLedgerEntry {
  id: string;
  createdAt: string;
  paidFrom: PaidFrom;
  amount: number;
  referenceType: string | null;
  referenceNo: string | null;
  note: string | null;
  createdBy: string | null;
}

export interface OwnerLedgerResponse {
  fromDate: string;
  toDate: string;
  totalGrandpa: number;
  totalGrandma: number;
  totalAll: number;
  entries: OwnerLedgerEntry[];
}

export interface CheckoutRequest {
  /** F-03 (FIX-132): idempotency key ต่อตะกร้า — กันปิดบิลซ้ำจาก retry/timeout/กดซ้ำ */
  clientRequestId?: string;
  /** เงินสดที่ลูกค้ายื่น (FIX-156) — เฉพาะบิลมีส่วนเงินสด · backend คำนวณทอนเอง */
  tenderedAmount?: number;
  customerId?: string;
  branchId?: string;                 // ขายที่สาขาไหน (Phase 2C)
  cashierProfileId?: string;         // ผู้รับเงินที่แสดงบนเอกสาร (ผู้ทำรายการยัง audit จาก login)
  items: CheckoutLine[];
  paymentMethod: PaymentMethod;
  discountAmount?: number;
  vatAmount?: number;
  paymentReference?: string;
  paymentSlipFileId?: string;        // legacy single slip
  slipFileIds?: string[];            // V31 — multi-slip support
  /** V31 — required when paymentMethod=MIXED; sum must equal grandTotal (±0.01) */
  paymentSplit?: PaymentSplit;
  /** null/undefined = ใบเสร็จปกติ; มีค่า = ออกใบกำกับเต็มรูปพร้อม checkout */
  taxInvoice?: import('@/api/taxInvoice').IssueTaxInvoiceRequest;
  // Installment fields (used only when paymentMethod=INSTALLMENT)
  installmentMonths?: number;
  installmentMonthlyAmount?: number;
  downPaymentAmount?: number;
  downPaymentCashAmount?: number;
  downPaymentTransferAmount?: number;
  /** V31 — ไฟแนนซ์ที่รับผ่อน (ใช้กับ INSTALLMENT เท่านั้น) */
  financePartner?: FinancePartner;
  note?: string;
  // Walk-in customer (used when customerId not picked — also drives LINE name)
  walkInCustomerName?: string;
  walkInCustomerPhone?: string;
  // Shipping
  shippingFee?: number;
  shippingPartner?: ShippingPartner;
  shippingTrackingNo?: string;
  shippingAddress?: string;
  shippingRecipientName?: string;
  shippingRecipientPhone?: string;
  orderChannel?: OrderChannel;
  shippingPaidFrom?: PaidFrom;     // legacy — deprecated
  shippingFeeGrandpa?: number;     // ค่าส่งของตา (บาท)
  shippingFeeGrandma?: number;     // ค่าส่งของยาย (บาท)
  // ─── เทิร์นเครื่องเก่า (FIX-105) — null = ไม่มีเทิร์น ───
  tradeIn?: TradeInRequest;
}

/** เทิร์นที่จุดขาย — เครื่องเก่าลงสต็อก (ทุน = value) + คิดส่วนต่างเข้า/ออกเก๊ะ (FIX-105) */
export interface TradeInRequest {
  productId: string;               // รุ่นของเครื่องลูกค้า ไม่ใช่ Stock/SKU
  color: string;
  storage: string;
  value: number;                   // มูลค่าตีเทิร์น (= ต้นทุนเครื่องเก่า)
  imei?: string;
  serialNumber?: string;
  condition?: SerializedCondition; // เว้น = SECOND_HAND (มือ 2)
  batteryHealth?: number;
  // สภาพตอนรับเทิร์น (FIX-106)
  hasBox?: boolean;
  hasCharger?: boolean;
  hasWarranty?: boolean;
  needsBattery?: boolean;
  needsScreen?: boolean;
  note?: string;                   // อุปกรณ์อื่นที่ต้องเปลี่ยน / โน้ต
  /** วิธีจ่ายส่วนต่างคืน เมื่อราคาเทิร์นเกินยอดที่ต้องชำระวันนี้ — CASH/TRANSFER */
  diffPayoutMethod?: PaymentMethod;
}

export interface SalesOrderItemResponse {
  id: string;
  variantId: string | null;      // null = รายการพิมพ์เอง (FIX-099)
  sku: string | null;
  productName: string;
  custom?: boolean;              // true = รายการพิมพ์เอง ไม่ผูกสต็อก
  imei: string | null;
  serialNumber: string | null;   // แสดง SN เมื่อไม่มี IMEI (iPad WiFi)
  color: string | null;
  storage: string | null;
  condition: string | null;   // "มือ 1" / "มือ 2" ฯลฯ
  labelPrice: number;
  sellPrice: number;
  quantity: number;
  lineTotal: number;
  /** "จ่ายวันนี้" ในบิลผ่อน ตามที่เลือกจริงตอนคิดเงิน (FIX-122) · null = บิลเก่า → FE เดาแบบเดิม */
  payToday?: boolean | null;
}

export interface SalesOrderResponse {
  id: string;
  billNo: string;
  status: SalesOrderStatus;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  branchName?: string | null;        // ขายที่สาขาไหน (Phase 2C)
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  shippingFee: number;
  grandTotal: number;
  paidAmount: number;
  tradeInValue?: number | null;      // มูลค่าตีเทิร์น (FIX-105)
  tradeInSettlementAmount?: number | null;
  tradeInDifferenceAmount?: number | null; // + ลูกค้าจ่ายร้าน · - ร้านจ่ายลูกค้า
  tradeInDifferenceMethod?: PaymentMethod | null;
  tradeInSerialId?: string | null;   // เครื่องเทิร์นที่ลงสต็อก
  paymentMethod: PaymentMethod | null;
  installmentMonths: number | null;
  installmentMonthlyAmount: number | null;
  downPaymentAmount: number | null;
  paymentSlipUrl: string | null;
  shippingPartner: ShippingPartner | null;
  shippingTrackingNo: string | null;
  shippingAddress: string | null;
  shippingRecipientName: string | null;
  shippingRecipientPhone: string | null;
  orderChannel: OrderChannel | null;
  shippingPaidFrom: PaidFrom | null;
  shippingFeeGrandpa: number;
  shippingFeeGrandma: number;
  // ─── V31 — Payment breakdown ──────────────────────────────────
  cashAmount: number;
  tenderedAmount?: number | null;   // เงินที่ลูกค้ายื่น (FIX-156)
  changeAmount?: number | null;     // เงินทอน (snapshot backend)
  transferAmount: number;
  cardAmount: number;
  qrAmount: number;
  // V31 — multi-slip URLs (populated only on detail response)
  slipUrls: string[] | null;
  // ─── V31 — Finance partner ────────────────────────────────────
  financePartner: FinancePartner | null;
  financePayoutAmount: number | null;
  financePayoutStatus: FinancePayoutStatus | null;
  financePayoutReceivedAt: string | null;
  financePayoutReference: string | null;
  cashSessionId: string | null;
  note: string | null;
  createdBy: string;
  cashierName: string;
  createdAt: string;
  closedAt: string | null;
  saleDate?: string;                    // วันขายสำหรับประวัติ/รายงาน; fallback closedAt/createdAt ระหว่าง rolling deploy
  taxInvoiceNo: string | null;
  taxInvoiceIssuedAt: string | null;
  creditNoteNo: string | null;
  creditNoteIssuedAt: string | null;
  items: SalesOrderItemResponse[];
}

export interface SavedShippingAddress {
  id: string;
  recipientName: string;
  recipientPhone: string;
  address: string;
}

export interface CashierProfile {
  id: string;
  name: string;
}

export interface ShippingAddressInput {
  recipientName: string;
  recipientPhone: string;
  address: string;
}

// ─── Phase 6: Reports ─────────────────────────────────────────────────────

export interface SalesSummaryResponse {
  fromDate: string;
  toDate: string;
  totalOrders: number;
  totalItems: number;
  totalRevenue: number;
  bookedSales: number;             // ยอดขายตามบิล (รวมยอดผ่อนเต็ม) — F-14
  cashCollected: number;           // เก็บชำระแล้ว ณ วันขาย (ผ่อน = เฉพาะดาวน์) — F-14
  uncollectedInstallment: number;  // ยอดผ่อนค้างจากบิลในช่วงนี้ — F-14
  totalCost: number;
  totalProfit: number;
  shippingExpense: number;   // ค่าส่งที่จ่ายออก (รายจ่าย — หักจากกำไรแล้ว)
  avgOrderValue: number;
  profitMargin: number;
  repairCount: number;
  repairRevenue: number;
}

export interface DailySalesPoint {
  date: string;
  orderCount: number;
  itemCount: number;
  revenue: number;
  profit: number;
}

export interface TopProductRow {
  variantId: string | null;   // null = รายการพิมพ์เอง (จัดกลุ่มตามชื่อ) — FIX-099
  sku: string | null;
  productName: string;
  color: string | null;
  storage: string | null;
  qtySold: number;
  revenue: number;
  profit: number;
}

export interface PaymentMethodSummary {
  method: PaymentMethod;
  orderCount: number;
  total: number;
}

export interface InventoryValueResponse {
  totalUnits: number;
  activeVariants: number;
  totalCostValue: number;
  totalSellValue: number;
  potentialProfit: number;
}

// ─── Phase 7 ──────────────────────────────────────────────────────────────

export interface InStockItem {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  imei: string | null;
  serialNumber: string;
  color: string | null;
  storage: string | null;
  sellingPrice: number;
  warrantyTerms: string | null;
  warrantyExpire: string | null;
  receivedAt: string;
}

// ─── Repair Tickets (รับซ่อม/เคลมเครื่องลูกค้า) ─────────────────────────────

export type RepairStatus = 'RECEIVED' | 'IN_PROGRESS' | 'DONE' | 'PICKED_UP' | 'CANCELLED';

export interface RepairTicket {
  id: string;
  ticketNo: string;
  status: RepairStatus;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  deviceBrand: string | null;
  deviceModel: string;
  deviceColor: string | null;
  imei: string | null;
  serialNumber: string | null;
  screenCode: string | null;
  reportedSymptom: string;
  workDescription: string | null;
  estimatedCost: number | null;
  repairCost: number;
  depositAmount: number;
  balanceDue: number;
  outsourced: boolean;             // ส่งซ่อมช่างนอก (FIX-093)
  technicianName: string | null;   // ชื่อช่าง
  outsourceCost: number | null;    // ราคาส่งซ่อม (ต้นทุนจ่ายช่าง)
  paymentMethod: PaymentMethod | null;
  receivedBy: string;
  receivedAt: string;
  doneAt: string | null;
  pickedUpAt: string | null;
  note: string | null;
  createdAt: string;
}

export interface CreateRepairRequest {
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  deviceBrand?: string;
  deviceModel: string;
  deviceColor?: string;
  imei?: string;
  serialNumber?: string;
  screenCode?: string;
  reportedSymptom: string;
  estimatedCost?: number;
  depositAmount?: number;
  outsourced?: boolean;            // ส่งซ่อมช่างนอก (FIX-093)
  technicianName?: string;
  outsourceCost?: number;
  note?: string;
}

export interface UpdateRepairStatusRequest {
  status: RepairStatus;
  repairCost?: number;
  workDescription?: string;
  paymentMethod?: PaymentMethod;
}

/** แก้ไข/เพิ่มข้อมูลใบซ่อมระหว่างทาง (partial) */
export interface UpdateRepairRequest {
  customerName?: string;
  customerPhone?: string;
  deviceBrand?: string;
  deviceModel?: string;
  deviceColor?: string;
  imei?: string;
  serialNumber?: string;
  screenCode?: string;
  reportedSymptom?: string;
  workDescription?: string;
  estimatedCost?: number;
  repairCost?: number;
  depositAmount?: number;
  outsourced?: boolean;            // ส่งซ่อมช่างนอก (FIX-093)
  technicianName?: string;
  outsourceCost?: number;
  note?: string;
}

export interface WarrantyLookup {
  id: string;
  imei: string | null;
  serialNumber: string;
  status: SerializedStatus;
  productName: string;
  sku: string;
  color: string | null;
  storage: string | null;
  purchasePrice: number | null;
  purchasePriceCode: string | null;   // รหัสต้นทุน (แสดงให้ STAFF)
  sellingPrice: number;
  receivedAt: string;
  soldAt: string | null;
  warrantyExpire: string | null;
  warrantyTerms: string | null;
  daysUntilExpire: number | null;
  isWarrantyActive: boolean | null;
  soldOnBill: string | null;
}

/** Source of truth กลางของข้อมูลหน้าร้าน เอกสารภาษี และใบจัดส่ง. */
export interface StoreProfile {
  version: number;
  shopName: string;
  receiptAddress: string;
  receiptPhone: string;
  website: string;
  legalName: string;
  branchLabel: string;
  taxAddress: string;
  taxId: string;
  taxPhone: string;
  shippingSenderName: string;
  shippingAddressLine1: string;
  shippingAddressLine2: string;
  shippingPhone: string;
  tiktok: string;
  facebook: string;
  updatedBy: string;
  updatedAt: string | null;
}

export type UpdateStoreProfileRequest = Omit<StoreProfile, 'updatedBy' | 'updatedAt'>;
