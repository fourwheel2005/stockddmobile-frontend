export type PrinterStrategyName = 'LOCAL_BRIDGE' | 'PULL_AGENT' | 'WEB_USB' | 'BROWSER';

export interface PrinterStatus {
  ready: boolean;
  strategy: PrinterStrategyName | null;
  details?: string;
  error?: string;
}

export interface PrintJobMeta {
  billNo: string;
  openDrawer?: boolean;
  duplicate?: boolean;
  /** PrintJob id (backend) — ใช้โดย PULL_AGENT เพื่อฝาก ESC/POS เข้างานเดิม */
  jobId?: string;
  /** FIX-149: เครื่องปลายทางบน bridge — receipt (Epson/ESC-POS, default) · label (TSC TTP-247/TSPL) */
  target?: 'receipt' | 'label';
}

export interface PrinterStrategy {
  readonly name: PrinterStrategyName;
  /** Quick health check (ไม่เกิน 1 วินาที) */
  isReady(): Promise<boolean>;
  /** Print raw ESC/POS bytes */
  print(bytes: Uint8Array, meta: PrintJobMeta): Promise<void>;
  /** Display label สำหรับ UI */
  label(): string;
}
