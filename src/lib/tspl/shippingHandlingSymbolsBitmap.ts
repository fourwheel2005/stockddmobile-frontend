import { SHIPPING_HANDLING_SYMBOLS_IMAGE_URL } from '@/assets/shippingHandlingSymbols';
import type { BitmapImage } from './TsplBuilder';
import { imageUrlToBitmap } from './imageUrlBitmap';

let cachedBitmap: Promise<BitmapImage> | undefined;

export function getShippingHandlingSymbolsBitmap(): Promise<BitmapImage> {
  cachedBitmap ??= imageUrlToBitmap(SHIPPING_HANDLING_SYMBOLS_IMAGE_URL, {
    printWidth: 280,
    maxHeight: 286,
    label: 'รูปสัญลักษณ์การจัดส่ง',
  });
  return cachedBitmap;
}
