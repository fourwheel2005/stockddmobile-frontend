import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { handleNumberStepKey, handleNumberWheel, isNumberInput } from '@/hooks/useKeyboardOnlyNumberInputs';

/** test runner ไม่มี DOM — จำลอง HTMLInputElement เท่าที่ handler ใช้ */
class FakeInput {
  type: string;
  blur = vi.fn();
  ownerDocument: { activeElement: unknown };
  constructor(type: string, focused: boolean) {
    this.type = type;
    this.ownerDocument = { activeElement: focused ? this : null };
  }
}

const original = (globalThis as { HTMLInputElement?: unknown }).HTMLInputElement;
beforeAll(() => { (globalThis as { HTMLInputElement?: unknown }).HTMLInputElement = FakeInput; });
afterAll(() => { (globalThis as { HTMLInputElement?: unknown }).HTMLInputElement = original; });

describe('keyboard-only number inputs, system-wide (FIX-206, FIX-233)', () => {
  it('recognises only number inputs', () => {
    expect(isNumberInput(new FakeInput('number', true) as unknown as EventTarget)).toBe(true);
    expect(isNumberInput(new FakeInput('text', true) as unknown as EventTarget)).toBe(false);
    expect(isNumberInput(null)).toBe(false);
  });

  it('blurs a focused number input on wheel so the price cannot change by scrolling', () => {
    const input = new FakeInput('number', true);
    expect(handleNumberWheel({ target: input as unknown as EventTarget })).toBe(true);
    expect(input.blur).toHaveBeenCalledOnce();
  });

  it('leaves unfocused number inputs and text inputs alone on wheel (page still scrolls)', () => {
    const unfocused = new FakeInput('number', false);
    const text = new FakeInput('text', true);
    expect(handleNumberWheel({ target: unfocused as unknown as EventTarget })).toBe(false);
    expect(handleNumberWheel({ target: text as unknown as EventTarget })).toBe(false);
    expect(unfocused.blur).not.toHaveBeenCalled();
    expect(text.blur).not.toHaveBeenCalled();
  });

  it('blocks arrow and page keys from stepping a number input', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown']) {
      const preventDefault = vi.fn();
      expect(handleNumberStepKey({ target: new FakeInput('number', true) as unknown as EventTarget, key, preventDefault })).toBe(true);
      expect(preventDefault).toHaveBeenCalledOnce();
    }
  });

  it('keeps typing, editing and arrows in text inputs working', () => {
    for (const key of ['1', 'Backspace', 'ArrowLeft', 'Enter', 'Tab']) {
      const preventDefault = vi.fn();
      expect(handleNumberStepKey({ target: new FakeInput('number', true) as unknown as EventTarget, key, preventDefault })).toBe(false);
      expect(preventDefault).not.toHaveBeenCalled();
    }
    const preventDefault = vi.fn();
    expect(handleNumberStepKey({ target: new FakeInput('text', true) as unknown as EventTarget, key: 'ArrowUp', preventDefault })).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('hides spinner arrows on every number input, not only on the POS page', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toMatch(/^input\[type='number'\]::-webkit-outer-spin-button,$/m);
    expect(css).toMatch(/^input\[type='number'\]::-webkit-inner-spin-button \{$/m);
    expect(css).toMatch(/^input\[type='number'\] \{$/m);
    expect(css).toMatch(/-moz-appearance:\s*textfield/);
    expect(css).not.toContain('pos-keyboard-only-numbers');
  });

  it('is mounted once at the app root so the cash drawer and every other page are covered', () => {
    const src = resolve(__dirname, '../..');
    const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sources(path);
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
    const callers = sources(src)
      .filter((path) => /useKeyboardOnlyNumberInputs\(\)/.test(readFileSync(path, 'utf8')))
      .filter((path) => !path.endsWith('useKeyboardOnlyNumberInputs.ts'));
    expect(callers).toEqual([resolve(src, 'App.tsx')]);
  });
});
