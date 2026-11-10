import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { printOrchestrator } from '@/lib/printer/PrintOrchestrator';
import { buildDepositSlip } from '@/lib/escpos/depositEscpos';
import { extractErrorMessage } from '@/api/client';
import { DepositPrintView } from '@/components/deposits/DepositPrintView';
import type { DeviceDeposit } from '@/types/api';

/**
 * พิมพ์ใบรับเงินมัดจำ/จองเครื่อง (FIX-222) — เครื่องปริ้นความร้อนก่อน (bridge → pull-agent) ไม่มี = พิมพ์ผ่านเบราว์เซอร์
 * ใช้: const { print, view } = useDepositPrinter(); แล้ววาง {view} ไว้ในหน้า
 */
export function useDepositPrinter() {
  const [printing, setPrinting] = useState<DeviceDeposit | null>(null);
  const print = useCallback(async (d: DeviceDeposit) => {
    try {
      printOrchestrator.setBridgeToken(localStorage.getItem('ddmobile.bridge.token'));
      const { strategy } = await printOrchestrator.print(
        buildDepositSlip(d),
        { billNo: d.depositNo },
        { browserPrint: async () => {
          setPrinting(d);
          await new Promise((resolve) => setTimeout(resolve, 250));
          window.print();
          setPrinting(null);   // ไม่ค้างในหน้า — กันพิมพ์ซ้อนกับใบเสร็จอื่นรอบถัดไป
        } },
      );
      toast.success(strategy === 'PULL_AGENT' ? `ส่งใบมัดจำ ${d.depositNo} เข้าคิวปริ้นแล้ว` : `พิมพ์ใบมัดจำ ${d.depositNo} แล้ว`);
    } catch (e) {
      toast.error(`พิมพ์ใบมัดจำไม่สำเร็จ: ${extractErrorMessage(e)}`);
    }
  }, []);
  return { print, view: printing ? <DepositPrintView deposit={printing} /> : null };
}
