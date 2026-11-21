import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FRONT_COUNTER_ROLES, REPAIR_ROLES, homePathFor } from '@/lib/auth/homePath';
import { navItems } from '@/components/AppShell';

describe('technician role routing (FIX-234)', () => {
  it('sends every role to a page it can open', () => {
    expect(homePathFor('TECHNICIAN')).toBe('/repairs');
    expect(homePathFor('STAFF')).toBe('/pos');
    expect(homePathFor('ADMIN')).toBe('/');
    expect(homePathFor('FREEDOM')).toBe('/');
    expect(homePathFor(undefined)).toBe('/');
    expect(REPAIR_ROLES).toContain('TECHNICIAN');
  });

  it('keeps the technician out of selling and cash pages', () => {
    expect(FRONT_COUNTER_ROLES).not.toContain('TECHNICIAN');
    const techMenu = navItems.filter((n) => (n.roles as readonly string[]).includes('TECHNICIAN')).map((n) => n.to);
    expect(techMenu.sort()).toEqual(['/repair-parts', '/repairs', '/tech-stock']);
  });

  it('guards the selling, cash and bill routes with the front-counter roles', () => {
    const app = readFileSync(resolve(__dirname, '../../../App.tsx'), 'utf8');
    const counterGroup = app.slice(app.indexOf('roles={FRONT_COUNTER_ROLES}'), app.indexOf('roles={REPAIR_ROLES}'));
    for (const path of ['/pos', '/shipping-labels', '/cash-register', '/deposits', '/sales', '/pos/orders/:id']) {
      expect(counterGroup).toContain(`path="${path}"`);
    }
    expect(counterGroup).not.toContain('path="/repairs"');
    expect(app).toMatch(/roles=\{REPAIR_ROLES\}[\s\S]*path="\/repairs"/);
    expect(app).toMatch(/roles=\{\['TECHNICIAN'\]\}[\s\S]*path="\/tech-stock"/);
  });
});
