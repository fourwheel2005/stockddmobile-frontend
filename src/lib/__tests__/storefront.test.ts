import { describe, expect, it } from 'vitest';
import { deviceProductUrl, deviceShortUrl } from '../storefront';

describe('storefront URLs', () => {
  it('encodes the canonical shop domain in QR short links', () => {
    expect(deviceShortUrl('DD00004')).toBe('https://www.ddmobileshop.com/d/DD00004');
  });

  it('uses the same canonical domain for direct product fallback links', () => {
    expect(deviceProductUrl('serial/id')).toBe('https://www.ddmobileshop.com/products/serial%2Fid');
  });
});
