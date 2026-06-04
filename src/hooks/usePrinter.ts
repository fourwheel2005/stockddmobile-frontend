import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { printOrchestrator } from '@/lib/printer/PrintOrchestrator';
import { buildDDMobileReceipt } from '@/lib/escpos/ddmobileReceipt';
import { printApi } from '@/api/print';
import type { PrinterStrategyName } from '@/lib/printer/types';

const TOKEN_KEY = 'ddmobile.bridge.token';
const URL_KEY = 'ddmobile.bridge.url';

export interface PrinterStatus {
  bridge: boolean;
  webUsb: boolean;
  browser: boolean;
  primary: PrinterStrategyName | null;
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
    bridge: false, webUsb: false, browser: true, primary: null,
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
    const webUsb = results.find((r) => r.name === 'WEB_USB')?.ready ?? false;
    const browser = results.find((r) => r.name === 'BROWSER')?.ready ?? false;
    const primary: PrinterStrategyName | null =
      bridge ? 'LOCAL_BRIDGE' : webUsb ? 'WEB_USB' : browser ? 'BROWSER' : null;
    setStatus({ bridge, webUsb, browser, primary });
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
    opts: { duplicate?: boolean; openDrawer?: boolean } = {},
  ) => {
    setPrinting(true);
    let jobId: string | undefined;
    try {
      // 1. Create job (idempotency check at backend)
      const jobType = opts.duplicate ? 'DUPLICATE' : 'RECEIPT';
      const job = await printApi.createJob(orderId, jobType);
      jobId = job.id;

      // 2. Get receipt data
      const data = await printApi.getReceiptData(orderId);

      // 3. Build ESC/POS bytes
      const isCash = data.paymentMethod === 'CASH';
      const openDrawer = (opts.openDrawer ?? true) && isCash;
      const bytes = buildDDMobileReceipt(data, {
        duplicate: opts.duplicate,
        openDrawer,
      });

      // 4. Print via orchestrator
      const result = await printOrchestrator.print(bytes, {
        billNo: data.billNo,
        duplicate: opts.duplicate,
        openDrawer,
      });

      // 5. Log success
      await printApi.logResult(jobId, {
        jobType,
        strategy: result.strategy,
        printerId: result.printerId,
        success: true,
      });

      // 6. Drawer log (if opened)
      if (openDrawer && (result.strategy === 'LOCAL_BRIDGE' || result.strategy === 'WEB_USB')) {
        try {
          await printApi.logDrawerOpen({
            reason: 'CASH_SALE',
            billNo: data.billNo,
            printJobId: jobId,
          });
        } catch {
          /* drawer log fail ≠ print fail — silent */
        }
      }

      toast.success(`พิมพ์ใบเสร็จแล้ว (${result.strategy})`);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (jobId) {
        try {
          await printApi.logResult(jobId, {
            jobType: opts.duplicate ? 'DUPLICATE' : 'RECEIPT',
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

  return {
    status,
    printing,
    refresh,
    printReceipt,
    openDrawer,
    requestWebUsb,
    setBridgeToken,
    setBridgeUrl,
    getBridgeUrl,
  };
}
