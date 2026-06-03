export type PrinterStrategyName = 'LOCAL_BRIDGE' | 'WEB_USB' | 'BROWSER';

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
