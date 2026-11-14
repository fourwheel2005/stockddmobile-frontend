import { useRef, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/api/client';
import { productsApi } from '@/api/products';
import { requireLabelBridge } from '@/lib/printer/labelBridge';
import { deviceProductUrl, deviceShortUrl } from '@/lib/storefront';
import { buildDeviceLabelsTspl, type DeviceLabelInput } from '@/lib/tspl/deviceLabel';
import { getLabelConfig } from '@/lib/tspl/labelConfig';
import { formatLabelSellingPrice, isAccessoryLabelItem, resolveAccessoryLabelPrice } from '@/lib/tspl/labelPrice';
import type { SerializedItemResponse, VariantResponse } from '@/types/api';

/** จำนวนแถวสติ๊กเกอร์ต่อ 1 งานที่ส่งเข้า Bridge — กันงานใหญ่ (ปริ้นทั้งวัน) เกินขนาดที่ Bridge รับ (1 MB) */
const ROWS_PER_JOB = 8;

function labelUrl(item: SerializedItemResponse): string {
  return item.stockCode ? deviceShortUrl(item.stockCode) : deviceProductUrl(item.id);
}

function itemCode(item: SerializedItemResponse): string {
  return item.stockCode ?? item.imei ?? item.serialNumber;
}

/**
 * อุปกรณ์เสริมที่ไม่มีราคารายชิ้นต้องใช้ราคา SKU — หน้าที่ไม่ได้ส่ง variants มา (เช่น หน้าปริ้นสติ๊กเกอร์
 * เครื่องเข้าใหม่ ซึ่งมีหลายรุ่นปนกัน) จะโหลดรุ่นของชิ้นนั้นมาเติมให้ตรงนี้.
 */
async function variantsForAccessories(
  items: SerializedItemResponse[],
  known: VariantResponse[],
  queryClient: QueryClient,
): Promise<VariantResponse[]> {
  const missing = new Set<string>();
  for (const item of items) {
    if (!isAccessoryLabelItem(item) || !item.productId) continue;
    if (resolveAccessoryLabelPrice(item, known) == null) missing.add(item.productId);
  }
  const products = await Promise.all([...missing].map((productId) => queryClient.fetchQuery({
    queryKey: ['product', productId],
    queryFn: () => productsApi.get(productId),
    staleTime: 60_000,
  })));
  return [...known, ...products.flatMap((product) => product.variants ?? [])];
}

function buildInputs(items: SerializedItemResponse[], variants: VariantResponse[]): DeviceLabelInput[] {
  return items.map((item) => {
    // FIX-227: เครื่องไม่พิมพ์ราคา (เอาราคาดาวน์ออก) — เหลือราคาเฉพาะอุปกรณ์เสริม
    if (!isAccessoryLabelItem(item)) return { item, url: labelUrl(item) };
    const price = resolveAccessoryLabelPrice(item, variants);
    if (price == null) {
      throw new Error(`สินค้า ${itemCode(item)} ยังไม่ได้ตั้งราคาขาย — กรุณาตั้งราคาก่อนพิมพ์ป้าย`);
    }
    return { item, url: labelUrl(item), priceText: formatLabelSellingPrice(price) };
  });
}

export function useDeviceLabelPrinter(variants: VariantResponse[] = []) {
  const queryClient = useQueryClient();
  const [isPrinting, setIsPrinting] = useState(false);
  const printingLock = useRef(false);

  const printItems = async (items: SerializedItemResponse[]): Promise<boolean> => {
    if (printingLock.current || items.length === 0) return false;
    printingLock.current = true;
    setIsPrinting(true);
    let printed = 0;
    try {
      const inputs = buildInputs(items, await variantsForAccessories(items, variants, queryClient));
      const bridge = await requireLabelBridge();
      const config = getLabelConfig();
      const perJob = ROWS_PER_JOB * config.across;
      for (let start = 0; start < inputs.length; start += perJob) {
        const batch = inputs.slice(start, start + perJob);
        const reference = itemCode(batch[0].item);
        await bridge.print(buildDeviceLabelsTspl(batch, config), {
          billNo: `${reference}+${batch.length}`, target: 'label',
        });
        printed += batch.length;
      }
      const blank = items.length % config.across === 0 ? '' : ' · ดวงที่เหลือในแถวสุดท้ายเว้นว่าง';
      toast.success(`พิมพ์ป้าย ${items.length} เครื่องแล้ว${blank}`);
      return true;
    } catch (error) {
      const partial = printed > 0 ? ` (ออกไปแล้ว ${printed} จาก ${items.length} เครื่อง)` : '';
      toast.error(`${extractErrorMessage(error)}${partial}`);
      return false;
    } finally {
      printingLock.current = false;
      setIsPrinting(false);
    }
  };

  return { isPrinting, printItems };
}
