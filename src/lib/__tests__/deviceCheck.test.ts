import { describe, expect, it } from 'vitest';
import { EMPTY_CHECK, checkFormFrom, checkRequest, checkSummary, isCheckEmpty } from '@/lib/deviceCheck';

describe('device check (FIX-220)', () => {
  it('intake sends nothing when the check was left empty', () => {
    expect(isCheckEmpty(EMPTY_CHECK)).toBe(true);
    expect(checkRequest(EMPTY_CHECK)).toBeUndefined();
  });

  it('edit always sends the full set so fields can be cleared', () => {
    expect(checkRequest(EMPTY_CHECK, true)).toEqual({
      grade: null, screen: null, screenNote: null, body: null, bodyNote: null, camera: null, cameraNote: null,
      faceId: null, faceIdNote: null, conditionNote: null,
    });
  });

  it('trims notes and keeps statuses', () => {
    const req = checkRequest({ ...EMPTY_CHECK, grade: 'B', body: 'MINOR', bodyNote: '  รอยขอบ ', conditionNote: ' ' });
    expect(req).toMatchObject({ grade: 'B', body: 'MINOR', bodyNote: 'รอยขอบ', conditionNote: null, screen: null });
  });

  it('round-trips a saved inspection into the form', () => {
    const f = checkFormFrom({ grade: 'A', screen: 'OK', screenNote: null, faceId: 'ISSUE', faceIdNote: 'สแกนช้า', inspectedAt: '2026-11-07T03:00:00' });
    expect(f).toMatchObject({ grade: 'A', screen: 'OK', screenNote: '', faceId: 'ISSUE', faceIdNote: 'สแกนช้า', body: '' });
  });

  it('summary highlights grade and problems', () => {
    expect(checkSummary({ grade: 'B', camera: 'ISSUE', screen: 'OK', inspectedAt: null })).toBe('เกรด B · กล้องมีปัญหา');
    expect(checkSummary(null)).toBeNull();
  });
});
