import { SHIPPING_LINE_QR_DATA_URL } from '@/assets/shippingLineQr';
import type { BitmapImage } from './TsplBuilder';

const PRINT_WIDTH = 300;
const WHITE_THRESHOLD = 245;
const BLACK_THRESHOLD = 180;

let cachedBitmap: Promise<BitmapImage> | undefined;

function loadImage(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('ไม่สามารถโหลด QR LINE สำหรับป้ายจัดส่งได้'));
    image.src = SHIPPING_LINE_QR_DATA_URL;
  });
}

function isWhite(data: Uint8ClampedArray, offset: number): boolean {
  return data[offset] >= WHITE_THRESHOLD
    && data[offset + 1] >= WHITE_THRESHOLD
    && data[offset + 2] >= WHITE_THRESHOLD;
}

async function createBitmap(): Promise<BitmapImage> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Browser นี้ไม่รองรับรูป QR LINE สำหรับป้ายจัดส่ง');
  }
  const image = await loadImage();
  const source = document.createElement('canvas');
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) throw new Error('ไม่สามารถเตรียม QR LINE สำหรับป้ายจัดส่งได้');
  sourceContext.drawImage(image, 0, 0);
  const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height).data;

  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const offset = (y * source.width + x) * 4;
      if (!isWhite(sourcePixels, offset)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('QR LINE ไม่มีข้อมูลที่พิมพ์ได้');

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const height = Math.round((cropHeight * PRINT_WIDTH) / cropWidth);
  const output = document.createElement('canvas');
  output.width = PRINT_WIDTH;
  output.height = height;
  const outputContext = output.getContext('2d', { willReadFrequently: true });
  if (!outputContext) throw new Error('ไม่สามารถแปลง QR LINE สำหรับป้ายจัดส่งได้');
  outputContext.imageSmoothingEnabled = false;
  outputContext.fillStyle = '#fff';
  outputContext.fillRect(0, 0, PRINT_WIDTH, height);
  outputContext.drawImage(source, minX, minY, cropWidth, cropHeight, 0, 0, PRINT_WIDTH, height);

  const pixels = outputContext.getImageData(0, 0, PRINT_WIDTH, height).data;
  const wBytes = Math.ceil(PRINT_WIDTH / 8);
  const data = new Uint8Array(wBytes * height).fill(0xff);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < PRINT_WIDTH; x++) {
      const offset = (y * PRINT_WIDTH + x) * 4;
      const luminance = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
      if (luminance < BLACK_THRESHOLD) data[y * wBytes + (x >> 3)] &= ~(0x80 >> (x & 7));
    }
  }
  return { data, wBytes, h: height };
}

export function getShippingLineQrBitmap(): Promise<BitmapImage> {
  cachedBitmap ??= createBitmap();
  return cachedBitmap;
}
