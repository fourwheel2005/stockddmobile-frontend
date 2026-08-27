import { describe, expect, it } from 'vitest';
import { createStockCountPayload, type StockCountTexts } from '../StockCountSection';

const COMPLETE: StockCountTexts = {
  newDevices: '5', secondHandDevices: '4', chargerHeads: '12',
  chargingCables: '8', otherAccessories: '3',
};

describe('createStockCountPayload', () => {
  it('keeps device and accessory counts in independent fields', () => {
    expect(createStockCountPayload(COMPLETE, true, ' ปัณณพัฒน์ ')).toEqual({
      countedNew: 5,
      countedSecondHand: 4,
      countedChargerHeads: 12,
      countedChargingCables: 8,
      countedOtherAccessories: 3,
      certified: true,
      certifiedName: 'ปัณณพัฒน์',
    });
  });

  it('does not certify when any accessory field is missing or invalid', () => {
    expect(createStockCountPayload({ ...COMPLETE, chargingCables: '' }, true, 'อุดมพร')).toBeNull();
    expect(createStockCountPayload({ ...COMPLETE, chargerHeads: '-1' }, true, 'อุดมพร')).toBeNull();
    expect(createStockCountPayload(COMPLETE, false, 'อุดมพร')).toBeNull();
  });
});
