import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../client';
import { posApi } from '../pos';

describe('posApi.searchTradeInVariants', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the STAFF-safe POS endpoint instead of the product admin API', async () => {
    const page = {
      content: [], page: 0, size: 8, totalElements: 0, totalPages: 0, last: true,
    };
    vi.spyOn(api, 'get').mockResolvedValue({ data: page });

    await expect(posApi.searchTradeInVariants('iPhone 13', 0, 8)).resolves.toEqual(page);
    expect(api.get).toHaveBeenCalledWith('/pos/trade-in-variants/search', {
      params: { q: 'iPhone 13', page: 0, size: 8 },
    });
  });
});
