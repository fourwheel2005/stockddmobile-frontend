import { encodeCp874 } from '@/lib/escpos/cp874';

export interface BitmapImage {
  data: Uint8Array;
  wBytes: number;
  h: number;
}

export class TsplBuilder {
  private readonly parts: Uint8Array[] = [];

  raw(command: string): void {
    this.parts.push(encodeCp874(`${command}\r\n`));
  }

  bitmap(x: number, y: number, image: BitmapImage): void {
    this.parts.push(encodeCp874(`BITMAP ${x},${y},${image.wBytes},${image.h},0,`));
    this.parts.push(image.data);
    this.parts.push(encodeCp874('\r\n'));
  }

  build(): Uint8Array {
    const length = this.parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of this.parts) {
      output.set(part, offset);
      offset += part.length;
    }
    return output;
  }
}
