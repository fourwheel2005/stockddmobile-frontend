import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/api/client';
import { printOrchestrator } from '@/lib/printer/PrintOrchestrator';
import { deviceProductUrl, deviceShortUrl } from '@/lib/storefront';
import { buildDeviceLabelsTspl, type DeviceLabelInput } from '@/lib/tspl/deviceLabel';
import { getLabelConfig } from '@/lib/tspl/labelConfig';
import { formatDeviceLabelPrice, resolveDeviceLabelPrice } from '@/lib/tspl/labelPrice';
import type { SerializedItemResponse, VariantResponse } from '@/types/api';

function labelUrl(item: SerializedItemResponse): string {
  return item.stockCode ? deviceShortUrl(item.stockCode) : deviceProductUrl(item.id);
}

function buildInputs(items: SerializedItemResponse[], variants: VariantResponse[]): DeviceLabelInput[] {
  return items.map((item) => {
    const price = resolveDeviceLabelPrice(item, variants);
    if (price == null) {
      const code = item.stockCode ?? item.imei ?? item.serialNumber;
      const field = item.categoryRootName === 'อุปกรณ์เสริม' ? 'ราคาขาย' : 'ราคาดาวน์';
      throw new Error(`สินค้า ${code} ยังไม่ได้ตั้ง${field} — กรุณาตั้งราคาก่อนพิมพ์ป้าย`);
    }
    return { item, url: labelUrl(item), priceText: formatDeviceLabelPrice(price) };
  });
}

async function readyLabelBridge() {
  printOrchestrator.setBridgeToken(localStorage.getItem('ddmobile.bridge.token'));
  const bridge = printOrchestrator.getLocalBridge();
  if (!(await bridge.isReady())) throw new Error('พิมพ์ป้ายต้องเปิด Local Bridge บนเครื่องที่เสียบ TSC TTP-247');
  if (!(await bridge.labelReady())) throw new Error('Bridge ยังไม่พบ TSC TTP-247 — ตรวจ USB และอัปเดต Bridge');
  return bridge;
}

export function useDeviceLabelPrinter(variants: VariantResponse[]) {
  const [isPrinting, setIsPrinting] = useState(false);
  const printingLock = useRef(false);

  const printItems = async (items: SerializedItemResponse[]): Promise<boolean> => {
    if (printingLock.current || items.length === 0) return false;
    printingLock.current = true;
    setIsPrinting(true);
    try {
      const inputs = buildInputs(items, variants);
      const bridge = await readyLabelBridge();
      const bytes = buildDeviceLabelsTspl(inputs);
      const reference = items[0].stockCode ?? items[0].imei ?? items[0].id;
      await bridge.print(bytes, { billNo: `${reference}+${items.length}`, target: 'label' });
      const config = getLabelConfig();
      const blank = items.length === 1 && config.across > 1 ? ' · ดวงที่เหลือเว้นว่าง' : '';
      toast.success(`พิมพ์ป้าย ${items.length} เครื่องแล้ว${blank}`);
      return true;
    } catch (error) {
      toast.error(extractErrorMessage(error));
      return false;
    } finally {
      printingLock.current = false;
      setIsPrinting(false);
    }
  };

  return { isPrinting, printItems };
}
