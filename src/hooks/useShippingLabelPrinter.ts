import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/api/client';
import { requireLabelBridge } from '@/lib/printer/labelBridge';
import { buildShippingLabelTspl, type ShippingLabelRecipient } from '@/lib/tspl/shippingLabel';
import { getShippingLineQrBitmap } from '@/lib/tspl/shippingLineQrBitmap';

export function useShippingLabelPrinter() {
  const [isPrinting, setIsPrinting] = useState(false);
  const printingLock = useRef(false);

  const printShippingLabel = async (
    recipient: ShippingLabelRecipient,
    billNo: string,
  ): Promise<boolean> => {
    if (printingLock.current) return false;
    printingLock.current = true;
    setIsPrinting(true);
    try {
      const lineQrImage = await getShippingLineQrBitmap();
      const bytes = buildShippingLabelTspl(recipient, lineQrImage);
      const bridge = await requireLabelBridge();
      await bridge.print(bytes, { billNo: `SHIP-${billNo}`, target: 'label' });
      toast.success(`พิมพ์ป้ายจัดส่ง 10×15 ซม. สำหรับบิล ${billNo} แล้ว`);
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
