import { SHIPPING_LINE_QR_IMAGE_URL } from '@/assets/shippingLineQr';
import type { BitmapImage } from './TsplBuilder';
import { imageUrlToBitmap } from './imageUrlBitmap';

let cachedBitmap: Promise<BitmapImage> | undefined;

export function getShippingLineQrBitmap(): Promise<BitmapImage> {
  cachedBitmap ??= imageUrlToBitmap(SHIPPING_LINE_QR_IMAGE_URL, {
    printWidth: 300,
    label: 'รูป QR LINE สำหรับป้ายจัดส่ง',
  });
  return cachedBitmap;
}
