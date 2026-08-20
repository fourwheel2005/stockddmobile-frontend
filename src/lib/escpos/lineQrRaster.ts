import { LINE_QR_IMAGE_DATA_URL } from '@/assets/lineQr';
import type { EscPosRasterImage } from './EscPosBuilder';

const PRINT_WIDTH = 280;
const WHITE_CROP_THRESHOLD = 245;
const BLACK_PRINT_THRESHOLD = 180;

let cachedRaster: Promise<EscPosRasterImage> | undefined;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('ไม่สามารถโหลดรูป QR LINE สำหรับใบเสร็จได้'));
    image.src = src;
  });
}

function pixelIsWhite(data: Uint8ClampedArray, offset: number): boolean {
  return data[offset] >= WHITE_CROP_THRESHOLD
    && data[offset + 1] >= WHITE_CROP_THRESHOLD
    && data[offset + 2] >= WHITE_CROP_THRESHOLD
    && data[offset + 3] > 0;
}

async function createRaster(): Promise<EscPosRasterImage> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Browser นี้ไม่รองรับการแปลงรูป QR LINE สำหรับเครื่องพิมพ์');
  }

  const image = await loadImage(LINE_QR_IMAGE_DATA_URL);
  const source = document.createElement('canvas');
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) throw new Error('ไม่สามารถเตรียมรูป QR LINE สำหรับเครื่องพิมพ์ได้');
  sourceContext.drawImage(image, 0, 0);

  const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height);
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const offset = (y * source.width + x) * 4;
      if (!pixelIsWhite(sourcePixels.data, offset)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) throw new Error('รูป QR LINE ไม่มีข้อมูลที่พิมพ์ได้');

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const height = Math.max(1, Math.round((cropHeight * PRINT_WIDTH) / cropWidth));
  const output = document.createElement('canvas');
  output.width = PRINT_WIDTH;
  output.height = height;
  const outputContext = output.getContext('2d', { willReadFrequently: true });
  if (!outputContext) throw new Error('ไม่สามารถแปลงรูป QR LINE สำหรับเครื่องพิมพ์ได้');
  outputContext.imageSmoothingEnabled = false;
  outputContext.fillStyle = '#fff';
  outputContext.fillRect(0, 0, PRINT_WIDTH, height);
  outputContext.drawImage(source, minX, minY, cropWidth, cropHeight, 0, 0, PRINT_WIDTH, height);

  const pixels = outputContext.getImageData(0, 0, PRINT_WIDTH, height).data;
  const widthBytes = Math.ceil(PRINT_WIDTH / 8);
  const data = new Uint8Array(widthBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < PRINT_WIDTH; x++) {
      const offset = (y * PRINT_WIDTH + x) * 4;
      const alpha = pixels[offset + 3] / 255;
      const luminance = (0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]) * alpha
        + 255 * (1 - alpha);
      if (luminance < BLACK_PRINT_THRESHOLD) {
        data[y * widthBytes + Math.floor(x / 8)] |= 0x80 >> (x % 8);
      }
    }
  }
  return { width: PRINT_WIDTH, height, data };
}

/** Converts the exact supplied LINE image once, then reuses it for subsequent receipts. */
export function getLineQrRaster(): Promise<EscPosRasterImage> {
  cachedRaster ??= createRaster();
  return cachedRaster;
}
