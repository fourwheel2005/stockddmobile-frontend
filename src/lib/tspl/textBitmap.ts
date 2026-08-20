import type { BitmapImage } from './TsplBuilder';

export interface TextBitmapOptions {
  fontSize: number;
  bold: boolean;
  maxWidth: number;
}

function font(options: TextBitmapOptions): string {
  return `${options.bold ? '700' : '400'} ${options.fontSize}px Tahoma, 'Leelawadee UI', sans-serif`;
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let fitted = text;
  while (fitted.length > 1 && context.measureText(`${fitted}…`).width > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted}…`;
}

function toBitmap(context: CanvasRenderingContext2D, width: number, height: number): BitmapImage {
  const rgba = context.getImageData(0, 0, width, height).data;
  const wBytes = Math.ceil(width / 8);
  const data = new Uint8Array(wBytes * height).fill(0xff);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      const luminance = 0.299 * rgba[pixel] + 0.587 * rgba[pixel + 1] + 0.114 * rgba[pixel + 2];
      if (luminance < 140) data[y * wBytes + (x >> 3)] &= ~(0x80 >> (x & 7));
    }
  }
  return { data, wBytes, h: height };
}

function canvasContext(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext('2d');
}

export function textBitmap(text: string, options: TextBitmapOptions): BitmapImage | null {
  if (!text.trim() || options.maxWidth <= 0) return null;
  const measure = canvasContext(1, 1);
  if (!measure) return null;
  measure.font = font(options);
  const fitted = fitText(measure, text, options.maxWidth);
  const width = Math.min(options.maxWidth, Math.ceil(measure.measureText(fitted).width) + 2);
  const height = Math.ceil(options.fontSize * 1.35);
  const context = canvasContext(width, height);
  if (!context) return null;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#000';
  context.font = font(options);
  context.textBaseline = 'top';
  context.fillText(fitted, 0, Math.round(options.fontSize * 0.1));
  return toBitmap(context, width, height);
}

function nextWrappedLine(context: CanvasRenderingContext2D, text: string, maxWidth: number): [string, string] {
  if (context.measureText(text).width <= maxWidth) return [text, ''];
  let end = 1;
  while (end < text.length && context.measureText(text.slice(0, end + 1)).width <= maxWidth) end++;
  const whitespace = text.slice(0, end).lastIndexOf(' ');
  const splitAt = whitespace > Math.floor(end / 2) ? whitespace : end;
  return [text.slice(0, splitAt).trim(), text.slice(splitAt).trim()];
}

export function wrapText(text: string, options: TextBitmapOptions, maxLines: number): string[] {
  const context = canvasContext(1, 1);
  if (!context) return [text.trim()].filter(Boolean);
  context.font = font(options);
  const pending = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lines: string[] = [];
  while (pending.length > 0 && lines.length < maxLines) {
    const [line, remainder] = nextWrappedLine(context, pending.shift()!, options.maxWidth);
    lines.push(line);
    if (remainder) pending.unshift(remainder);
  }
  if (pending.length > 0) lines[lines.length - 1] = fitText(context, `${lines.at(-1)}…`, options.maxWidth);
  return lines;
}
