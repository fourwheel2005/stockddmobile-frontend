import { api } from './client';
import type { PrinterStrategyName } from '@/lib/printer/types';
import type { ReceiptData } from '@/lib/escpos/ddmobileReceipt';

export interface PrintJobResponse {
  id: string;
  billNo: string;
  jobType: PrintJobType;
  status: 'PENDING' | 'PRINTING' | 'PRINTED' | 'FAILED' | 'CANCELLED';
  strategy: PrinterStrategyName | null;
  printerId: string | null;
  attempts: number;
  lastError: string | null;
  requestedBy: string;
  requestedAt: string;
  printedAt: string | null;
  duplicateOf: string | null;
}

export interface ReceiptPrintJobResponse extends Omit<PrintJobResponse, 'jobType'> {
  jobType: 'RECEIPT' | 'DUPLICATE';
}

export interface PrintLogRequest {
  jobType: PrintJobType;
  strategy: PrinterStrategyName;
  printerId?: string;
  success: boolean;
  errorMessage?: string;
  note?: string;
}

export type PrintJobType =
  | 'RECEIPT' | 'DUPLICATE' | 'TAX_INVOICE' | 'TAX_INVOICE_COPY'
  | 'REPAIR_TICKET' | 'TRANSFER' | 'CASH_SESSION_SUMMARY' | 'CASH_MONTHLY_SUMMARY' | 'TEST';

export type DrawerReason = 'CASH_SALE' | 'MANUAL' | 'REFUND' | 'NO_SALE' | 'TEST';

export interface DrawerOpenRequest {
  reason: DrawerReason;
  billNo?: string;
  printJobId?: string;
  note?: string;
}

export const printApi = {
  getReceiptData: (orderId: string) =>
    api.get<ReceiptData>(`/print/orders/${orderId}/receipt-data`).then((r) => r.data),

  createJob: (orderId: string, type: PrintJobType = 'RECEIPT') =>
    api.post<PrintJobResponse>(`/print/orders/${orderId}/print-jobs`, null, {
      params: { type },
    }).then((r) => r.data),

  /** Backend เลือก RECEIPT/DUPLICATE จากต้นฉบับที่ PRINTED จริง */
  createReceiptJob: (orderId: string) =>
    api.post<ReceiptPrintJobResponse>(`/print/orders/${orderId}/receipt-jobs`)
      .then((r) => r.data),

  logResult: (jobId: string, req: PrintLogRequest) =>
    api.post<PrintJobResponse>(`/print/jobs/${jobId}/log`, req).then((r) => r.data),

  logDrawerOpen: (req: DrawerOpenRequest) =>
    api.post(`/print/drawer/open-log`, req),

  /** ฝาก ESC/POS (base64) เข้างานเดิม → agent สาขาดึงไปพิมพ์ (pull model) */
  queueJob: (jobId: string, req: { payloadBase64: string; printerId: string; openDrawer: boolean; copies?: number }) =>
    api.post<PrintJobResponse>(`/print/jobs/${jobId}/queue`, req).then((r) => r.data),

  /** ฝากงานพิมพ์อิสระ (ไม่ผูกบิล) เข้าคิว agent — เช่น ใบโอนสาขา */
  standalone: (req: { payloadBase64: string; printerId: string; refNo: string; jobType?: PrintJobType; openDrawer?: boolean; copies?: number }) =>
    api.post<PrintJobResponse>('/print/standalone', req).then((r) => r.data),

  /** เช็คว่า agent ของปริ้นเตอร์สาขานั้นออนไลน์ไหม (badge สถานะ) */
  agentOnline: (printerId: string) =>
    api.get<{ printerId: string; online: boolean; lastSeenSecondsAgo: number | null }>(
      `/print/agent-online`, { params: { printerId } },
    ).then((r) => r.data),
};
