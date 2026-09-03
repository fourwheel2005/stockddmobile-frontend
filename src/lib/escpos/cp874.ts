/**
 * CP874 (Windows-874 / TIS-620) — Thai code page mapping.
 *
 * Epson TM-T82 รองรับ Code Page 21 (PC874-Thai).
 * Map ตัวอักษรไทย Unicode (U+0E00-U+0E5B) → byte 0xA1-0xFB ใน CP874.
 *
 * Reference:
 *   https://en.wikipedia.org/wiki/Windows-874
 *   https://en.wikipedia.org/wiki/Thai_Industrial_Standard_620-2533
 *
 * รหัส 0x00-0x7F = ASCII identical
 * รหัส 0x80-0xA0 = control / unused (ส่วนใหญ่ 0x80 = Euro sign)
 * รหัส 0xA1-0xDB = พยัญชนะไทย ก-ฮ (U+0E01-U+0E3A)
 * รหัส 0xDF-0xFB = สระ/วรรณยุกต์/ตัวเลขไทย (U+0E3F-U+0E5B)
 */

const THAI_MAP: Record<number, number> = {};

// สร้าง map สำหรับ U+0E01..U+0E3A → 0xA1..0xDA
// CP874 byte = Unicode codepoint - 0x0D60
for (let cp = 0x0e01; cp <= 0x0e3a; cp++) {
  THAI_MAP[cp] = cp - 0x0d60;
}
// U+0E3F..U+0E5B → 0xDF..0xFB (gap จาก U+0E3B-3E)
for (let cp = 0x0e3f; cp <= 0x0e5b; cp++) {
  THAI_MAP[cp] = cp - 0x0d60;
}

/** Special ASCII passthrough + Euro */
const ASCII_OVERRIDE: Record<number, number> = {
  0x20ac: 0x80, // € Euro
};

/**
 * Encode UTF-16 string → Uint8Array ใน CP874.
 * - ASCII (0x00-0x7E) → passthrough
 * - Thai (U+0E01-U+0E5B) → mapped
 * - อื่นๆ → '?' (0x3F) เพราะ printer ไม่รู้จัก
 *
 * Critical: ต้องเรียก codepage() ของ ESC/POS ก่อน text() ทุกครั้ง
 *   - TM-T82III/V    → 21
 *   - TM-T82X-II     → 26
 *   - บางรุ่น (TM-U) → 17 หรือ 18
 */
export function encodeCp874(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    // ASCII range
    if (code >= 0x20 && code <= 0x7e) {
      out.push(code);
      continue;
    }

    // newline / tab
    if (code === 0x0a || code === 0x0d || code === 0x09) {
      out.push(code);
      continue;
    }

    // Thai range
    const thai = THAI_MAP[code];
    if (thai !== undefined) {
      out.push(thai);
      continue;
    }

    // override
    const over = ASCII_OVERRIDE[code];
    if (over !== undefined) {
      out.push(over);
      continue;
    }

    // emoji / กว่าง → strip (ส่วนใหญ่ font printer ไม่มี)
    // ตรวจ surrogate pair (emoji = high+low 2 chars)
    if (code >= 0xd800 && code <= 0xdbff) {
      i++; // skip low surrogate
      continue;
    }

    // fallback '?'
    out.push(0x3f);
  }
  return new Uint8Array(out);
}

/**
 * คำนวณความกว้างที่แสดงจริงบน printer (Thai vowels = 0 width).
 * วรรณยุกต์/สระบน-ล่าง รวมกับพยัญชนะตัวเดียวกัน — ไม่นับ space ใหม่.
 *
 * ใช้คำนวณ column padding ตอน justify.
 */
const ZERO_WIDTH_THAI = new Set<number>([
  0x0e31,           // ั
  0x0e34, 0x0e35,   // ิ ี
  0x0e36, 0x0e37,   // ึ ื
  0x0e38, 0x0e39,   // ุ ู
  0x0e3a,           // ฺ
  0x0e47, 0x0e48,   // ็ ่
  0x0e49, 0x0e4a,   // ้ ๊
  0x0e4b, 0x0e4c,   // ๋ ์
  0x0e4d, 0x0e4e,   // ํ ๎
]);

export function thaiDisplayWidth(text: string): number {
  let w = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // emoji surrogate pair → ตัดทิ้ง (ไม่นับ)
    if (code >= 0xd800 && code <= 0xdbff) { i++; continue; }
    if (ZERO_WIDTH_THAI.has(code)) continue;
    w++;
  }
  return w;
}
