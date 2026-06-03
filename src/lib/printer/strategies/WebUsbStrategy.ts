/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PrinterStrategy, PrinterStrategyName, PrintJobMeta } from '../types';

// Epson USB vendor ID
const EPSON_VENDOR_ID = 0x04b8;

/**
 * WebUSB direct — Chrome only, requires user gesture to grant.
 * Persists permission across sessions (per origin).
 *
 * Limitations:
 *  - Chrome/Edge only (no Safari, no Firefox)
 *  - HTTPS only (Vercel = OK)
 *  - User must grant permission once (browser remembers)
 *
 * NOTE: Uses `any` for WebUSB types because @types/w3c-web-usb not installed.
 */
export class WebUsbStrategy implements PrinterStrategy {
  readonly name: PrinterStrategyName = 'WEB_USB';

  private device: any = null;
  private endpointOut: number | null = null;

  label(): string {
    return '🔗 WebUSB (Chrome)';
  }

  async isReady(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('usb' in navigator)) return false;
    if (this.device?.opened) return true;

    try {
      const devices = await (navigator as any).usb.getDevices();
      const epson = devices.find((d: any) => d.vendorId === EPSON_VENDOR_ID);
      if (epson) {
        this.device = epson;
        return true;
      }
    } catch {
      /* not supported */
    }
    return false;
  }

  /** ต้องเรียกจาก user gesture (ปุ่มกด) — browser block ถ้า auto */
  async requestPermission(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !('usb' in navigator)) {
      throw new Error('Browser ไม่รองรับ WebUSB (ลองใช้ Chrome/Edge)');
    }
    try {
      const device = await (navigator as any).usb.requestDevice({
        filters: [{ vendorId: EPSON_VENDOR_ID }],
      });
      this.device = device;
      return true;
    } catch {
      return false;
    }
  }

  private async ensureOpen() {
    if (!this.device) throw new Error('ไม่พบเครื่องพิมพ์ (กด "เชื่อมต่อ" ก่อน)');
    if (!this.device.opened) await this.device.open();
    if (this.device.configuration === null) await this.device.selectConfiguration(1);

    const iface = this.device.configuration.interfaces[0];
    if (!iface.claimed) await this.device.claimInterface(iface.interfaceNumber);

    const ep = iface.alternate.endpoints.find((e: any) => e.direction === 'out');
    if (!ep) throw new Error('ไม่พบ OUT endpoint บน printer');
    this.endpointOut = ep.endpointNumber;
  }

  async print(bytes: Uint8Array, _meta: PrintJobMeta): Promise<void> {
    await this.ensureOpen();
    if (!this.device || this.endpointOut == null) {
      throw new Error('WebUSB device not ready');
    }

    // ส่งเป็น chunks 4KB กัน USB buffer overflow
    const CHUNK = 4096;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      const slice = bytes.slice(i, i + CHUNK);
      await this.device.transferOut(this.endpointOut, slice);
    }
  }

  async close(): Promise<void> {
    if (this.device?.opened) {
      try {
        await this.device.close();
      } catch {
        /* ignore */
      }
    }
  }
}
