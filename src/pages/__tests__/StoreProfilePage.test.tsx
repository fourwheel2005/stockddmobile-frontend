import { describe, expect, it } from 'vitest';
import { navItems } from '@/components/AppShell';

describe('StoreProfilePage navigation', () => {
  it('is a back-office category for admin and manager only', () => {
    const item = navItems.find((nav) => nav.to === '/store-profile');
    expect(item?.label).toBe('ข้อมูลร้าน');
    expect(item?.roles).toEqual(['ADMIN', 'MANAGER']);
  });
});
