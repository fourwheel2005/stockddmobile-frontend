import type { StockTxType } from './api';

export interface StockUpdatedMessage {
  variantId: string;
  sku: string;
  productName: string;
  qtyBefore: number;
  qtyAfter: number;
  type: StockTxType;
  transactionNo: string;
  performedBy: string;
  timestamp: string;
}

export interface LowStockAlertMessage {
  alertId: string;
  variantId: string;
  sku: string;
  productName: string;
  currentQty: number;
  thresholdQty: number;
  timestamp: string;
}
