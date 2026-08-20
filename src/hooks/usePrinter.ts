import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { printOrchestrator } from '@/lib/printer/PrintOrchestrator';
import { buildDDMobileReceipt } from '@/lib/escpos/ddmobileReceipt';
import { getLineQrRaster } from '@/lib/escpos/lineQrRaster';
import { buildTaxInvoice } from '@/lib/escpos/taxInvoice';
import { buildCreditNote } from '@/lib/escpos/creditNote';
import { buildCashPeriodSummary, buildCashSessionSummary } from '@/lib/escpos/cashSummaryReceipt';
import { taxInvoiceApi } from '@/api/taxInvoice';
import { creditNoteApi } from '@/api/creditNote';
import { printApi } from '@/api/print';
import axios from 'axios';
import { extractErrorMessage } from '@/api/client';
import {
  isAgentMode, getAgentPrinterId, setAgentConfig,
} from '@/lib/printer/strategies/CloudQueueStrategy';
import type { PrinterStrategyName } from '@/lib/printer/types';
import { resolveReceiptPrintPlan } from '@/lib/printer/receiptPrintPlan';
import type { CashPeriodSummaryResponse, CashSessionResponse } from '@/types/api';

const TOKEN_KEY = 'ddmobile.bridge.token';
const URL_KEY = 'ddmobile.bridge.url';

export interface PrinterStatus {
  bridge: boolean;
  agent: boolean;
  webUsb: boolean;
  browser: boolean;
  primary: PrinterStrategyName | null;
}

export interface ReceiptPrintOptions {
  openDrawer?: boolean;
  /** Render HTML ของบิลเดียวกับ orderId สำหรับ fallback ผ่าน print dialog */
  browserPrint?: (context: { duplicate: boolean }) => Promise<void>;
}

/**
 * Hook สำหรับ POS — จัดการ:
 *  - Discovery (เช็คทุก strategy ว่า ready ไหม)
 *  - Print receipt (server-side audit + client-side ESC/POS)
 *  - Manual reprint
 *  - Cash drawer (open manual)
 *  - Bridge token persistence (localStorage)
 */
export function usePrinter() {
  const [status, setStatus] = useState<PrinterStatus>({
    bridge: false, agent: false, webUsb: false, browser: true, primary: null,
  });
  const [printing, setPrinting] = useState(false);

  // Load bridge token from localStorage
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    printOrchestrator.setBridgeToken(token);
  }, []);

  // Periodic discovery
  const refresh = useCallback(async () => {
    const results = await printOrchestrator.discover();
    const bridge = results.find((r) => r.name === 'LOCAL_BRIDGE')?.ready ?? false;
    const agent = results.find((r) => r.name === 'PULL_AGENT')?.ready ?? false;
    const webUsb = results.find((r) => r.name === 'WEB_USB')?.ready ?? false;
    const browser = results.find((r) => r.name === 'BROWSER')?.ready ?? false;
    const primary: PrinterStrategyName | null =
      bridge ? 'LOCAL_BRIDGE' : agent ? 'PULL_AGENT' : webUsb ? 'WEB_USB' : browser ? 'BROWSER' : null;
    setStatus({ bridge, agent, webUsb, browser, primary });
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const setBridgeToken = useCallback((token: string) => {
    localStorage.setItem(TOKEN_KEY, token);
    printOrchestrator.setBridgeToken(token);
    refresh();
  }, [refresh]);

  const setBridgeUrl = useCallback((url: string) => {
    const cleaned = url.trim().replace(/\/$/, '');
    if (cleaned) {
      localStorage.setItem(URL_KEY, cleaned);
    } else {
      localStorage.removeItem(URL_KEY);
    }
    refresh();
  }, [refresh]);

  const getBridgeUrl = useCallback(() => {
    return localStorage.getItem(URL_KEY) ?? 'http://localhost:8765';
  }, []);

  /** โหมด pull-agent (คิวปริ้นสาขา) — เปิด/ปิด + รหัสปริ้นเตอร์ */
  const setAgentMode = useCallback((enabled: boolean, printerId: string) => {
    setAgentConfig(enabled, printerId);
    refresh();
  }, [refresh]);

  const getAgentConfig = useCallback(() => ({
    enabled: isAgentMode(), printerId: getAgentPrinterId(),
  }), []);

  const requestWebUsb = useCallback(async () => {
    const ok = await printOrchestrator.getWebUsb().requestPermission();
    if (ok) {
      toast.success('เชื่อมต่อเครื่องพิมพ์สำเร็จ');
      refresh();
    } else {
      toast.error('ผู้ใช้ยกเลิก หรือไม่พบเครื่องพิมพ์');
    }
  }, [refresh]);

  /**
   * Print receipt — full pipeline:
   *  1. Backend create PENDING job
   *  2. Backend get structured receipt data
   *  3. Build ESC/POS bytes (Thai mapped)
   *  4. Orchestrator print (try each strategy)
   *  5. Log result back to backend
   *  6. Drawer log (if cash + opened)
   */
  const printReceipt = useCallback(async (
    orderId: string,
    opts: ReceiptPrintOptions = {},
  ) => {
    setPrinting(true);
    let job: Awaited<ReturnType<typeof printApi.createReceiptJob>> | undefined;
    try {
      // 1. Backend เป็น source of truth: FAILED/ยังไม่เคยสำเร็จ = RECEIPT, PRINTED แล้ว = DUPLICATE
      job = await printApi.createReceiptJob(orderId);

      // 2. Get receipt data
      const data = await printApi.getReceiptData(orderId);

      // 3. Build ESC/POS bytes
      const { duplicate, openDrawer } = resolveReceiptPrintPlan({
        jobType: job.jobType,
        isCash: data.paymentMethod === 'CASH',
        openDrawerRequested: opts.openDrawer,
      });
      const lineQrImage = await getLineQrRaster();
      const bytes = buildDDMobileReceipt(data, {
        duplicate,
        openDrawer,
        lineQrImage,
      });
      const browserPrint = opts.browserPrint;

      // 4. Print via orchestrator (PULL_AGENT = ฝากเข้าคิว, agent พิมพ์จริงทีหลัง)
      const result = await printOrchestrator.print(bytes, {
        billNo: data.billNo,
        duplicate,
        openDrawer,
        jobId: job.id,
      }, {
        browserPrint: browserPrint
          ? () => browserPrint({ duplicate })
          : undefined,
      });

      const queued = result.strategy === 'PULL_AGENT';

      // 5. Log success — เฉพาะโหมดพิมพ์ทันที (PULL_AGENT ให้ agent เป็นคน ack สถานะ PRINTED)
      if (!queued) {
        await printApi.logResult(job.id, {
          jobType: job.jobType,
          strategy: result.strategy,
          printerId: result.printerId,
          success: true,
        });
      }

      // 6. Drawer log (เปิดลิ้นชัก — bridge/webusb พิมพ์ทันที, pull-agent บันทึกเจตนา)
      const drawerStrategies = ['LOCAL_BRIDGE', 'WEB_USB', 'PULL_AGENT'];
      if (openDrawer && drawerStrategies.includes(result.strategy)) {
        try {
          await printApi.logDrawerOpen({
            reason: 'CASH_SALE',
            billNo: data.billNo,
            printJobId: job.id,
          });
        } catch {
          /* drawer log fail ≠ print fail — silent */
        }
      }

      const documentLabel = duplicate ? 'สำเนาใบเสร็จ' : 'ใบเสร็จต้นฉบับ';
      toast.success(queued
        ? `ส่ง${documentLabel}เข้าคิวปริ้นสาขาแล้ว ☁️`
        : `พิมพ์${documentLabel}แล้ว (${result.strategy})`);
      return { ...result, jobType: job.jobType };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (job) {
        try {
          await printApi.logResult(job.id, {
            jobType: job.jobType,
            strategy: 'BROWSER',
            success: false,
            errorMessage: msg,
          });
        } catch {
          /* swallow */
        }
      }
      toast.error(`พิมพ์ไม่สำเร็จ: ${msg}`);
      throw e;
    } finally {
      setPrinting(false);
    }
  }, []);

  const createTaxInvoicePrintJob = useCallback(async (orderId: string) => {
    try {
      return await printApi.createJob(orderId, 'TAX_INVOICE');
    } catch (e) {
      if (!axios.isAxiosError(e) || e.response?.status !== 409) throw e;
      if (!extractErrorMessage(e).includes('TAX_INVOICE_COPY')) throw e;
      return printApi.createJob(orderId, 'TAX_INVOICE_COPY');
    }
  }, []);

  /** พิมพ์ใบกำกับ: backend เป็นผู้ตัดสินต้นฉบับ/สำเนาจาก audit ที่พิมพ์สำเร็จจริง. */
  const printTaxInvoice = useCallback(async (
    orderId: string,
    opts: { openDrawer?: boolean } = {},
  ) => {
    setPrinting(true);
    let job: Awaited<ReturnType<typeof printApi.createJob>> | undefined;
    try {
      const data = await taxInvoiceApi.get(orderId);
      job = await createTaxInvoicePrintJob(orderId);
      const copy = job.jobType === 'TAX_INVOICE_COPY';
      const openDrawer = (opts.openDrawer ?? false) && data.paymentMethod === 'CASH';
      const bytes = buildTaxInvoice(data, { copy, openDrawer });
      const result = await printOrchestrator.print(bytes, {
        billNo: data.taxInvoiceNo,
        jobId: job.id,
        openDrawer,
        duplicate: copy,
        target: 'receipt',
      });
      const queued = result.strategy === 'PULL_AGENT';
      if (!queued) {
        await printApi.logResult(job.id, {
          jobType: job.jobType,
          strategy: result.strategy,
          printerId: result.printerId,
          success: true,
        });
      }
      if (openDrawer && ['LOCAL_BRIDGE', 'WEB_USB', 'PULL_AGENT'].includes(result.strategy)) {
        await printApi.logDrawerOpen({ reason: 'CASH_SALE', billNo: data.billNo, printJobId: job.id })
          .catch(() => undefined);
      }
      toast.success(queued
        ? 'ส่งใบเสร็จ/ใบกำกับภาษีเข้าคิวปริ้นสาขาแล้ว ☁️'
        : `พิมพ์ใบเสร็จ/ใบกำกับภาษี${copy ? ' (สำเนา)' : ' (ต้นฉบับ)'}แล้ว`);
      return result;
    } catch (e) {
      if (job) {
        await printApi.logResult(job.id, {
          jobType: job.jobType, strategy: 'BROWSER', success: false,
          errorMessage: e instanceof Error ? e.message : String(e),
        }).catch(() => undefined);
      }
      toast.error(`พิมพ์ใบกำกับไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    } finally {
      setPrinting(false);
    }
  }, [createTaxInvoicePrintJob]);

  const createCreditNotePrintJob = useCallback(async (orderId: string) => {
    try {
      return await printApi.createJob(orderId, 'CREDIT_NOTE');
    } catch (e) {
      if (!axios.isAxiosError(e) || e.response?.status !== 409) throw e;
      if (!extractErrorMessage(e).includes('CREDIT_NOTE_COPY')) throw e;
      return printApi.createJob(orderId, 'CREDIT_NOTE_COPY');
    }
  }, []);

  /** พิมพ์ใบลดหนี้ โดย backend ตัดสินต้นฉบับ/สำเนาจาก print audit. */
  const printCreditNote = useCallback(async (orderId: string) => {
    setPrinting(true);
    let job: Awaited<ReturnType<typeof printApi.createJob>> | undefined;
    try {
      const data = await creditNoteApi.get(orderId);
      job = await createCreditNotePrintJob(orderId);
      const copy = job.jobType === 'CREDIT_NOTE_COPY';
      const result = await printOrchestrator.print(buildCreditNote(data, copy), {
        billNo: data.creditNoteNo,
        jobId: job.id,
        openDrawer: false,
        duplicate: copy,
        target: 'receipt',
      });
      if (result.strategy !== 'PULL_AGENT') {
        await printApi.logResult(job.id, {
          jobType: job.jobType,
          strategy: result.strategy,
          printerId: result.printerId,
          success: true,
        });
      }
      toast.success(result.strategy === 'PULL_AGENT'
        ? 'ส่งใบลดหนี้เข้าคิวปริ้นสาขาแล้ว ☁️'
        : `พิมพ์ใบลดหนี้${copy ? ' (สำเนา)' : ' (ต้นฉบับ)'}แล้ว`);
      return result;
    } catch (e) {
      if (job) {
        await printApi.logResult(job.id, {
          jobType: job.jobType,
          strategy: 'BROWSER',
          success: false,
          errorMessage: e instanceof Error ? e.message : String(e),
        }).catch(() => undefined);
      }
      toast.error(`พิมพ์ใบลดหนี้ไม่สำเร็จ: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    } finally {
      setPrinting(false);
    }
  }, [createCreditNotePrintJob]);

  /** เปิดลิ้นชักโดยตรง (manual) — ต้องผ่าน bridge เท่านั้น */
  const openDrawer = useCallback(async (reason: 'MANUAL' | 'NO_SALE' = 'MANUAL') => {
    try {
      if (!status.bridge) {
        toast.error('ต้องใช้ Local Bridge เพื่อเปิดลิ้นชัก');
        return;
      }
      await printOrchestrator.getLocalBridge().openDrawer();
      await printApi.logDrawerOpen({ reason });
      toast.success('เปิดลิ้นชักแล้ว');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'เปิดลิ้นชักไม่สำเร็จ');
    }
  }, [status.bridge]);

  const printCashBytes = useCallback(async (
    bytes: Uint8Array,
    reference: string,
    jobType: 'CASH_SESSION_SUMMARY' | 'CASH_MONTHLY_SUMMARY',
    successMessage: string,
  ) => {
    setPrinting(true);
    try {
      const result = await printOrchestrator.print(bytes, {
        billNo: reference, jobType, openDrawer: false, target: 'receipt',
      });
      toast.success(result.strategy === 'PULL_AGENT'
        ? 'ส่งใบสรุปเข้าคิวปริ้นสาขาแล้ว'
        : successMessage);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error(`พิมพ์ใบสรุปไม่สำเร็จ: ${message}`);
      throw e;
    } finally {
      setPrinting(false);
    }
  }, []);

  const printCashSessionSummary = useCallback((session: CashSessionResponse) =>
    printCashBytes(buildCashSessionSummary(session), session.sessionNo,
      'CASH_SESSION_SUMMARY', 'พิมพ์ใบสรุปปิดเก๊ะแล้ว'), [printCashBytes]);

  const printCashPeriodSummary = useCallback((summary: CashPeriodSummaryResponse) =>
    printCashBytes(buildCashPeriodSummary(summary), `${summary.fromDate}_${summary.toDate}`,
      'CASH_MONTHLY_SUMMARY', 'พิมพ์ใบสรุปยอดแล้ว'), [printCashBytes]);

  return {
    status,
    printing,
    refresh,
    printReceipt,
    printTaxInvoice,
    printCreditNote,
    printCashSessionSummary,
    printCashPeriodSummary,
    openDrawer,
    requestWebUsb,
    setBridgeToken,
    setBridgeUrl,
    getBridgeUrl,
    setAgentMode,
    getAgentConfig,
  };
}
