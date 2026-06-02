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
  active: boolean;
  createdAt: string;
  updatedAt: string;
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
}

export interface WizardInitialItem {
  serialNumber: string;
  imei?: string;
  imei2?: string;
  condition?: 'NEW' | 'SECOND_HAND' | 'LIKE_NEW' | 'REFURBISHED' | 'DEFECTIVE';
  batteryHealth?: number;
  acquisitionType?: AcquisitionType;
  purchasePrice?: number;
  warrantyTerms?: string;
  /** วันหมดประกัน YYYY-MM-DD */
  warrantyExpire?: string;
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
  updatedAt: string;
}

export type SerializedStatus =
  | 'IN_STOCK' | 'RESERVED' | 'SOLD' | 'DEFECTIVE' | 'RETURNED' | 'TRANSFERRED';

export type AcquisitionType =
  // ประเภทธุรกรรม
  | 'PURCHASE' | 'TRADE_IN' | 'OUTRIGHT'
  // ซัพพลายเออร์หน้าร้าน
  | 'ICE' | 'BORROW' | 'P_GREEN' | 'GREETER' | 'RED_HEAT' | 'AMP_MOBILE';
export type ServiceState = 'AWAITING_REPAIR' | 'SENT_CLAIM';
export type SerializedCondition = 'NEW' | 'SECOND_HAND' | 'LIKE_NEW' | 'REFURBISHED' | 'DEFECTIVE';

export interface SerializedItemResponse {
  id: string;
  variantId: string;
  sku: string;
  imei: string | null;
  imei2: string | null;
  serialNumber: string;
  status: SerializedStatus;
  condition: string;
  receivedAt: string;
  soldAt: string | null;
  warrantyExpire: string | null;
  purchasePrice: number | null;
  purchasePriceCode: string | null;   // รหัสต้นทุน (แสดงให้ STAFF)
  batteryHealth: number | null;
  acquisitionType: AcquisitionType | null;
  serviceState: ServiceState | null;
  defectNote: string | null;
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
    purchasePrice?: number;
  }>;
}

// ─── Phase 5: POS ─────────────────────────────────────────────────────────

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'QR' | 'INSTALLMENT';
export type SalesOrderStatus = 'DRAFT' | 'PAID' | 'CANCELLED' | 'REFUNDED';

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
  variantId: string;
  serialItemId?: string;
  quantity: number;
  labelPrice: number;
  sellPrice: number;
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

export type PaidFrom = 'REGISTER' | 'OWNER_GRANDPA' | 'OWNER_GRANDMA' | 'CUSTOMER';

export type CashMovementType =
  | 'SALE_CASH' | 'REFUND_CASH' | 'PAYOUT_SHIPPING' | 'PAYOUT_EXPENSE'
  | 'CASH_IN' | 'SAFE_DROP' | 'PETTY_CASH_FROM_OWNER' | 'OPENING_FLOAT' | 'ADJUSTMENT';

export type SessionStatus = 'OPEN' | 'CLOSED';

export interface CashMovementLine {
  id: string;
  type: CashMovementType;
  amount: number;
  paidFrom: PaidFrom;
  referenceType: string | null;
  referenceNo: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
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
  movements: CashMovementLine[] | null;
}

export interface OpenSessionRequest {
  registerId?: string;
  openingFloat: number;
  note?: string;
}

export interface CloseSessionRequest {
  actualClose: number;
  note?: string;
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
  customerId?: string;
  items: CheckoutLine[];
  paymentMethod: PaymentMethod;
  discountAmount?: number;
  vatAmount?: number;
  paymentReference?: string;
  paymentSlipFileId?: string;        // required when paymentMethod=TRANSFER
  // Installment fields (used only when paymentMethod=INSTALLMENT)
  installmentMonths?: number;
  downPaymentAmount?: number;
  downPaymentCashAmount?: number;
  downPaymentTransferAmount?: number;
  note?: string;
  // Walk-in customer (used when customerId not picked — also drives LINE name)
  walkInCustomerName?: string;
  walkInCustomerPhone?: string;
  // Shipping
  shippingFee?: number;
  shippingPartner?: ShippingPartner;
  shippingTrackingNo?: string;
  shippingAddress?: string;
  orderChannel?: OrderChannel;
  shippingPaidFrom?: PaidFrom;
}

export interface SalesOrderItemResponse {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  imei: string | null;
  labelPrice: number;
  sellPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface SalesOrderResponse {
  id: string;
  billNo: string;
  status: SalesOrderStatus;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  subtotal: number;
  discountAmount: number;
  vatAmount: number;
  shippingFee: number;
  grandTotal: number;
  paidAmount: number;
  paymentMethod: PaymentMethod | null;
  installmentMonths: number | null;
  downPaymentAmount: number | null;
  paymentSlipUrl: string | null;
  shippingPartner: ShippingPartner | null;
  shippingTrackingNo: string | null;
  shippingAddress: string | null;
  orderChannel: OrderChannel | null;
  shippingPaidFrom: PaidFrom | null;
  cashSessionId: string | null;
  note: string | null;
  createdBy: string;
  createdAt: string;
  closedAt: string | null;
  items: SalesOrderItemResponse[];
}

// ─── Phase 6: Reports ─────────────────────────────────────────────────────

export interface SalesSummaryResponse {
  fromDate: string;
  toDate: string;
  totalOrders: number;
  totalItems: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
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
  variantId: string;
  sku: string;
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
  note?: string;
}

export interface UpdateRepairStatusRequest {
  status: RepairStatus;
  repairCost?: number;
  workDescription?: string;
  paymentMethod?: PaymentMethod;
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
