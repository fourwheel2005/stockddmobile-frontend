import { encodeCp874, thaiDisplayWidth } from './cp874';

/**
 * ESC/POS Builder — สร้างคำสั่ง ESC/POS bytes แบบ chainable.
 *
 * <h3>รุ่นที่รองรับ</h3>
 * Epson TM-T82III/IV/V/VI · TM-T88V/VI/VII · TM-m30III และ thermal printer ESC/POS ทั่วไป
 *
 * <h3>กระดาษ 80mm</h3>
 *  - Font A (12x24): 48 chars/บรรทัด
 *  - Font B (9x17):  64 chars/บรรทัด
 *  - Font A ขนาด 2x: 24 chars/บรรทัด
 *
 * <h3>การใช้งาน</h3>
 * <pre>
 *   const bytes = new EscPosBuilder()
 *     .init()
 *     .codepage(21)       // Thai
 *     .align('C')
 *     .size(2, 2).text('DDMobile').size(1, 1).newline()
 *     .align('L')
 *     .text('สวัสดี').newline()
 *     .feedAndCut()
 *     .build();
 * </pre>
 */
export class EscPosBuilder {
  private buf: number[] = [];

  /** ESC @ — initialize printer (reset all settings) */
  init(): this {
    this.buf.push(0x1b, 0x40);
    return this;
  }

  /** ESC t n — select character code table.
   *  21 = PC874 (Thai), 0 = PC437 (USA) */
  codepage(n: number): this {
    this.buf.push(0x1b, 0x74, n);
    return this;
  }

  /** ESC a n — align (0=left, 1=center, 2=right) */
  align(a: 'L' | 'C' | 'R'): this {
    const map = { L: 0, C: 1, R: 2 };
    this.buf.push(0x1b, 0x61, map[a]);
    return this;
  }

  /** ESC E n — bold on/off */
  bold(on: boolean): this {
    this.buf.push(0x1b, 0x45, on ? 1 : 0);
    return this;
  }

  /** ESC - n — underline (0=off, 1=1-dot, 2=2-dot) */
  underline(level: 0 | 1 | 2): this {
    this.buf.push(0x1b, 0x2d, level);
    return this;
  }

  /** GS ! n — character size (width 1-8, height 1-8) */
  size(w: 1 | 2 | 3 | 4, h: 1 | 2 | 3 | 4): this {
    const n = ((w - 1) << 4) | (h - 1);
    this.buf.push(0x1d, 0x21, n);
    return this;
  }

  /** ESC ! n — select font: 0 = Font A (12x24), 1 = Font B (9x17) */
  font(n: 0 | 1): this {
    this.buf.push(0x1b, 0x4d, n);
    return this;
  }

  /** GS B n — reverse mode (white on black) */
  inverse(on: boolean): this {
    this.buf.push(0x1d, 0x42, on ? 1 : 0);
    return this;
  }

  /** Print plain text (encoded as CP874 — auto Thai support) */
  text(s: string): this {
    const bytes = encodeCp874(s);
    for (let i = 0; i < bytes.length; i++) this.buf.push(bytes[i]);
    return this;
  }

  /** Print text + newline */
  textln(s: string): this {
    return this.text(s).newline();
  }

  /** Newline (1+ lines) */
  newline(n = 1): this {
    for (let i = 0; i < n; i++) this.buf.push(0x0a);
    return this;
  }

  /** ESC d n — feed n lines */
  feed(n: number): this {
    this.buf.push(0x1b, 0x64, Math.max(0, Math.min(255, n)));
    return this;
  }

  /** GS V — cut paper (0 = full cut, 1 = partial) */
  cut(partial = false): this {
    this.buf.push(0x1d, 0x56, partial ? 1 : 0);
    return this;
  }

  /** Feed N lines then cut */
  feedAndCut(n = 4, partial = false): this {
    return this.feed(n).cut(partial);
  }

  /** ESC p m t1 t2 — open cash drawer
   *  m = 0 (DK port 1) or 1 (port 2)
   *  t1, t2 = pulse duration (default 25, 250) */
  drawerKick(pin: 0 | 1 = 0): this {
    this.buf.push(0x1b, 0x70, pin, 25, 250);
    return this;
  }

  /** Horizontal separator line (───…) */
  separator(char = '-', width = 48): this {
    return this.textln(char.repeat(width));
  }

  /**
   * 2-column justify (left + right) — รองรับ Thai เพราะ display-width = Thai-aware
   * ถ้า left+right ยาวเกิน width → ตัดบรรทัด: left ขึ้นบน, right ขวาล่าง
   */
  justify(left: string, right: string, width = 48): this {
    const lw = thaiDisplayWidth(left);
    const rw = thaiDisplayWidth(right);
    const gap = width - lw - rw;
    if (gap >= 1) {
      return this.text(left).text(' '.repeat(gap)).textln(right);
    }
    // overflow — break into 2 lines
    return this.textln(left).text(' '.repeat(Math.max(0, width - rw))).textln(right);
  }

  /**
   * GS ( k — QR Code (Model 2, error correction L, size 6)
   * data ≤ ~2KB ASCII (ใช้กับ bill_no ปลอดภัย)
   */
  qrcode(data: string, opts?: { size?: number; errorCorrection?: 'L' | 'M' | 'Q' | 'H' }): this {
    const size = Math.max(1, Math.min(16, opts?.size ?? 6));
    const ec = { L: 48, M: 49, Q: 50, H: 51 }[opts?.errorCorrection ?? 'L'];

    // Function 165: Select model
    this.buf.push(0x1d, 0x28, 0x6b, 4, 0, 49, 65, 50, 0);
    // Function 167: Set size
    this.buf.push(0x1d, 0x28, 0x6b, 3, 0, 49, 67, size);
    // Function 169: Error correction
    this.buf.push(0x1d, 0x28, 0x6b, 3, 0, 49, 69, ec);
    // Function 180: Store data
    const dataBytes = new TextEncoder().encode(data);
    const pL = (dataBytes.length + 3) & 0xff;
    const pH = ((dataBytes.length + 3) >> 8) & 0xff;
    this.buf.push(0x1d, 0x28, 0x6b, pL, pH, 49, 80, 48);
    for (let i = 0; i < dataBytes.length; i++) this.buf.push(dataBytes[i]);
    // Function 181: Print
    this.buf.push(0x1d, 0x28, 0x6b, 3, 0, 49, 81, 48);
    return this;
  }

  /** GS k — Code128 barcode (CODE B subset) */
  barcode(data: string, height = 80): this {
    this.buf.push(0x1d, 0x68, height);          // height
    this.buf.push(0x1d, 0x77, 2);                // width
    this.buf.push(0x1d, 0x48, 2);                // HRI below
    this.buf.push(0x1d, 0x6b, 73, data.length + 2, 0x7b, 0x42);
    const bytes = new TextEncoder().encode(data);
    for (let i = 0; i < bytes.length; i++) this.buf.push(bytes[i]);
    return this;
  }

  /** Raw bytes (escape hatch สำหรับ command พิเศษ) */
  raw(bytes: number[]): this {
    for (const b of bytes) this.buf.push(b);
    return this;
  }

  /** Build final byte array */
  build(): Uint8Array {
    return new Uint8Array(this.buf);
  }

  /** Build → Base64 (สำหรับส่งผ่าน HTTP JSON) */
  toBase64(): string {
    const bytes = this.build();
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
}
