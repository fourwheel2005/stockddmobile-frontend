import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * กันไม่ให้ emoji กลับเข้ามาใน UI/ข้อความ (FIX-196): ระบบใช้ไอคอน SVG จาก lucide ชุดเดียว
 * เพราะ emoji วาดต่างกันแต่ละ OS, ถูกตัดทิ้งบนใบเสร็จความร้อน และ screen reader อ่านเป็นคำแปลก
 */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2B00}-\u{2BFF}✅❌✔✖✓✕⚠⭐ℹ]/u;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(entry) && !path.includes('__tests__')) out.push(path);
  }
  return out;
}

describe('no emoji in source', () => {
  it('uses lucide icons instead of emoji everywhere in src/', () => {
    const offenders: string[] = [];
    for (const file of walk(join(__dirname, '..'))) {
      readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
        if (EMOJI.test(line)) offenders.push(`${file.split('/src/')[1]}:${index + 1}: ${line.trim().slice(0, 80)}`);
      });
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
