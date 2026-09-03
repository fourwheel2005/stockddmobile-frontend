import type { PrinterStrategy, PrinterStrategyName, PrintJobMeta } from '../types';
import { printApi } from '@/api/print';

const ENABLED_KEY = 'ddmobile.print.agent.enabled';
const PRINTER_ID_KEY = 'ddmobile.print.agent.printerId';

/** เปิดโหมด pull-agent ไหม + รหัสปริ้นเตอร์สาขา (ตั้งใน Printer Settings) */
export function isAgentMode(): boolean {
  return typeof window !== 'undefined' && localStorage.getItem(ENABLED_KEY) === '1';
}
export function getAgentPrinterId(): string {
  return (typeof window !== 'undefined' && localStorage.getItem(PRINTER_ID_KEY)?.trim()) || '';
}
export function setAgentConfig(enabled: boolean, printerId: string): void {
  localStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
  localStorage.setItem(PRINTER_ID_KEY, printerId.trim());
}

/** Uint8Array → base64 (chunk กัน stack overflow บน array ใหญ่) */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Pull-agent strategy — แทนที่จะ "ยิงเข้า" bridge ใน LAN (ติด HTTPS/mixed-content)
 * จะ "ฝากงานเข้าคิว" backend ผ่าน HTTPS แล้วให้ agent ของสาขาดึงไปพิมพ์เอง.
 *
 * <h3>ข้อดี</h3>
 *  - ไม่ต้อง tunnel/ngrok/cert — iPad/มือถือยิง HTTPS เข้า backend ตรงๆ
 *  - ใช้ได้ทุกสาขา: ตั้ง printerId ครั้งเดียว
 *
 * <h3>หมายเหตุ async</h3>
 *  - print() = "ฝากเข้าคิวสำเร็จ" (ไม่ใช่ "พิมพ์เสร็จ") — agent เป็นคนพิมพ์จริง + ack กลับ
 *  - ดังนั้นสถานะ PRINTED มาจาก agent ไม่ใช่ฝั่งนี้
 */
export class CloudQueueStrategy implements PrinterStrategy {
  readonly name: PrinterStrategyName = 'PULL_AGENT';

  label(): string {
    const id = getAgentPrinterId();
    return `คิวปริ้นสาขา${id ? ` (${id})` : ''}`;
  }

  async isReady(): Promise<boolean> {
    if (!isAgentMode()) return false;
    const printerId = getAgentPrinterId();
    if (!printerId) return false;
    try {
      const status = await printApi.agentOnline(printerId);
      return status.online;
    } catch {
      return false;   // backend เช็คไม่ได้ → ถือว่าไม่พร้อม (fallback ตัวถัดไป)
    }
  }

  async print(bytes: Uint8Array, meta: PrintJobMeta): Promise<void> {
    const printerId = getAgentPrinterId();
    if (!printerId) throw new Error('ยังไม่ได้ตั้งรหัสปริ้นเตอร์สาขา (Printer ID)');
    const payloadBase64 = toBase64(bytes);

    if (meta.jobId) {
      // มี PrintJob อยู่แล้ว (ใบเสร็จขาย) → ฝาก payload เข้างานเดิม
      await printApi.queueJob(meta.jobId, { payloadBase64, printerId, openDrawer: !!meta.openDrawer, copies: 1 });
    } else {
      // งานอิสระ (ใบโอน/test) → สร้างงานใหม่ในคิว
      await printApi.standalone({
        payloadBase64, printerId, refNo: meta.billNo,
        jobType: meta.jobType ?? 'TRANSFER', openDrawer: !!meta.openDrawer,
      });
    }
  }
}
