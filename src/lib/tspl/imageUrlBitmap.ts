import type { BitmapImage } from './TsplBuilder';

interface ImageUrlBitmapOptions {
  printWidth: number;
  maxHeight?: number;
  label: string;
  whiteThreshold?: number;
  blackThreshold?: number;
}

function loadImage(url: string, label: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`ไม่สามารถโหลด${label}ได้`));
    image.src = url;
  });
}

function channelOnWhite(data: Uint8ClampedArray, offset: number, channel: number): number {
  const alpha = data[offset + 3] / 255;
  return 255 - (255 - data[offset + channel]) * alpha;
}

function isWhite(data: Uint8ClampedArray, offset: number, threshold: number): boolean {
  return channelOnWhite(data, offset, 0) >= threshold
    && channelOnWhite(data, offset, 1) >= threshold
    && channelOnWhite(data, offset, 2) >= threshold;
}

export async function imageUrlToBitmap(
  url: string,
  options: ImageUrlBitmapOptions,
): Promise<BitmapImage> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error(`Browser นี้ไม่รองรับ${options.label}`);
  }

  const image = await loadImage(url, options.label);
  const source = document.createElement('canvas');
  source.width = image.naturalWidth;
  source.height = image.naturalHeight;
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) throw new Error(`ไม่สามารถเตรียม${options.label}ได้`);
  sourceContext.drawImage(image, 0, 0);
  const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height).data;

  const whiteThreshold = options.whiteThreshold ?? 245;
  let minX = source.width;
  let minY = source.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const offset = (y * source.width + x) * 4;
      if (!isWhite(sourcePixels, offset, whiteThreshold)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < minX || maxY < minY) throw new Error(`${options.label}ไม่มีข้อมูลที่พิมพ์ได้`);

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const widthScale = options.printWidth / cropWidth;
  const heightScale = options.maxHeight ? options.maxHeight / cropHeight : Number.POSITIVE_INFINITY;
  const scale = Math.min(widthScale, heightScale);
  const width = Math.max(1, Math.round(cropWidth * scale));
  const height = Math.max(1, Math.round(cropHeight * scale));
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const outputContext = output.getContext('2d', { willReadFrequently: true });
  if (!outputContext) throw new Error(`ไม่สามารถแปลง${options.label}ได้`);
  outputContext.imageSmoothingEnabled = false;
  outputContext.fillStyle = '#fff';
  outputContext.fillRect(0, 0, width, height);
  outputContext.drawImage(source, minX, minY, cropWidth, cropHeight, 0, 0, width, height);

  const pixels = outputContext.getImageData(0, 0, width, height).data;
  const blackThreshold = options.blackThreshold ?? 180;
  const wBytes = Math.ceil(width / 8);
  const data = new Uint8Array(wBytes * height).fill(0xff);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const red = channelOnWhite(pixels, offset, 0);
      const green = channelOnWhite(pixels, offset, 1);
      const blue = channelOnWhite(pixels, offset, 2);
      const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
      if (luminance < blackThreshold) data[y * wBytes + (x >> 3)] &= ~(0x80 >> (x & 7));
    }
  }
  return { data, wBytes, h: height };
}
