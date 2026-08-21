import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/api/client';
import { requireLabelBridge } from '@/lib/printer/labelBridge';
import { buildShippingLabelTspl, type ShippingLabelRecipient } from '@/lib/tspl/shippingLabel';
import { getShippingLineQrBitmap } from '@/lib/tspl/shippingLineQrBitmap';

export function createShippingLabelPrintContext(billNo?: string, now = Date.now()) {
  const normalizedBillNo = billNo?.trim();
  return {
    reference: `SHIP-${normalizedBillNo || `MANUAL-${now}`}`,
    successMessage: normalizedBillNo
      ? `พิมพ์ใบจัดส่ง 10×15 ซม. สำหรับบิล ${normalizedBillNo} แล้ว`
      : 'พิมพ์ใบจัดส่ง 10×15 ซม. แล้ว',
  };
}

export function useShippingLabelPrinter() {
  const [isPrinting, setIsPrinting] = useState(false);
  const printingLock = useRef(false);

  const printShippingLabel = async (
    recipient: ShippingLabelRecipient,
    billNo?: string,
  ): Promise<boolean> => {
    if (printingLock.current) return false;
    printingLock.current = true;
    setIsPrinting(true);
    try {
      const lineQrImage = await getShippingLineQrBitmap();
      const bytes = buildShippingLabelTspl(recipient, lineQrImage);
      const bridge = await requireLabelBridge();
      const context = createShippingLabelPrintContext(billNo);
      await bridge.print(bytes, { billNo: context.reference, target: 'label' });
      toast.success(context.successMessage);
      return true;
    } catch (error) {
      toast.error(extractErrorMessage(error));
      return false;
    } finally {
      printingLock.current = false;
      setIsPrinting(false);
    }
  };

  return { isPrinting, printShippingLabel };
}
