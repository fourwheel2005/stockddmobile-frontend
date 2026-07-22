import { describe, it, expect } from 'vitest';
import {
  parseServerDateTime, formatShopDateTimeCompact, shopDayKey, formatInShopZone,
} from '../datetime';

describe('parseServerDateTime', () => {
  it('treats a zone-less LocalDateTime from the API as UTC', () => {
    // เคสจริงจาก /receipt-data: Jackson serialize LocalDateTime แบบไม่มี offset
    expect(parseServerDateTime('2026-07-22T03:35:12')?.toISOString())
      .toBe('2026-07-22T03:35:12.000Z');
  });

  it('respects an explicit offset when the API sends one', () => {
    expect(parseServerDateTime('2026-07-22T10:35:12+07:00')?.toISOString())
      .toBe('2026-07-22T03:35:12.000Z');
    expect(parseServerDateTime('2026-07-22T03:35:12Z')?.toISOString())
      .toBe('2026-07-22T03:35:12.000Z');
  });

  it('returns null for empty / unparsable input', () => {
    expect(parseServerDateTime(null)).toBeNull();
    expect(parseServerDateTime('')).toBeNull();
    expect(parseServerDateTime('  ')).toBeNull();
    expect(parseServerDateTime('not-a-date')).toBeNull();
  });
});

describe('formatShopDateTimeCompact', () => {
  it('renders zone-less UTC input as Bangkok wall clock (the receipt bug)', () => {
    expect(formatShopDateTimeCompact('2026-07-22T03:35:12')).toBe('22/07/2026 10:35');
  });

  it('renders offset-carrying input identically', () => {
    expect(formatShopDateTimeCompact('2026-07-22T03:35:12Z')).toBe('22/07/2026 10:35');
    expect(formatShopDateTimeCompact('2026-07-22T10:35:12+07:00')).toBe('22/07/2026 10:35');
  });

  it('uses 24-hour clock in the afternoon', () => {
    expect(formatShopDateTimeCompact('2026-07-22T08:35:00Z')).toBe('22/07/2026 15:35');
  });

  it('rolls the date forward across the UTC day boundary', () => {
    expect(formatShopDateTimeCompact('2026-07-21T18:00:00Z')).toBe('22/07/2026 01:00');
  });

  it('falls back to "-" when there is no timestamp', () => {
    expect(formatShopDateTimeCompact(null)).toBe('-');
  });
});

describe('shopDayKey', () => {
  it('groups by Thai business day, not UTC day', () => {
    expect(shopDayKey('2026-07-21T18:00:00Z')).toBe('2026-07-22');
    expect(shopDayKey('2026-07-22T16:59:00Z')).toBe('2026-07-22');
    expect(shopDayKey('2026-07-22T17:00:00Z')).toBe('2026-07-23');
  });

  it('accepts a Date and a date-only string', () => {
    expect(shopDayKey(new Date('2026-07-21T18:00:00Z'))).toBe('2026-07-22');
    expect(shopDayKey('2026-07-22')).toBe('2026-07-22');
  });

  it('returns empty string for missing input', () => {
    expect(shopDayKey(undefined)).toBe('');
  });
});

describe('formatInShopZone', () => {
  it('pins the timezone regardless of the device clock', () => {
    const th = formatInShopZone('2026-07-22T03:35:12', { hour: '2-digit', minute: '2-digit', hour12: false });
    expect(th).toContain('10');
  });
});
