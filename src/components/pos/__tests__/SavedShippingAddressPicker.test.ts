import { describe, expect, it } from 'vitest';
import { savedAddressToInput } from '../SavedShippingAddressPicker';

describe('savedAddressToInput', () => {
  it('copies the complete recipient without mixing buyer fields', () => {
    expect(savedAddressToInput({
      id: 'address-1',
      recipientName: 'ผู้รับประจำ',
      recipientPhone: '0812345678',
      address: '99/9 สมุทรสงคราม 75000',
    })).toEqual({
      recipientName: 'ผู้รับประจำ',
      recipientPhone: '0812345678',
      address: '99/9 สมุทรสงคราม 75000',
    });
  });
});
