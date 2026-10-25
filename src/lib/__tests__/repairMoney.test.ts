import { describe, expect, it } from 'vitest';
import { cancelRequest, depositDelta, repairPickupSettlement } from '@/lib/repairMoney';

describe('repair money (FIX-207)', () => {
  it('pickup: customer pays the remainder, or the shop returns an oversized deposit', () => {
    expect(repairPickupSettlement(3000, 1000)).toEqual({ due: 2000, refund: 0 });
    expect(repairPickupSettlement(800, 1000)).toEqual({ due: 0, refund: 200 });
    expect(repairPickupSettlement(1000, 1000)).toEqual({ due: 0, refund: 0 });
    expect(repairPickupSettlement(2999.99, 1000.5)).toEqual({ due: 1999.49, refund: 0 });
  });

  it('cancel: refund by cash or transfer, or keep the deposit as income', () => {
    expect(cancelRequest('REFUND_CASH')).toEqual({ status: 'CANCELLED', keepDeposit: false, paymentMethod: 'CASH' });
    expect(cancelRequest('REFUND_TRANSFER')).toEqual({ status: 'CANCELLED', keepDeposit: false, paymentMethod: 'TRANSFER' });
    expect(cancelRequest('KEEP')).toEqual({ status: 'CANCELLED', keepDeposit: true });
  });

  it('deposit edit moves only the difference', () => {
    expect(depositDelta(1000, 1500)).toBe(500);
    expect(depositDelta(1500, 600)).toBe(-900);
    expect(depositDelta(500, 500)).toBe(0);
  });
});
