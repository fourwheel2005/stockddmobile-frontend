import { api } from './client';

/** รายงานหลังบ้าน (FIX-159) — FREEDOM เท่านั้น */
export interface AuditTrailItem {
  occurredAt: string;
  category: string;
  action: string;
  refNo: string | null;
  actor: string;
  amount: number | null;
  detail: string | null;
}

export const auditApi = {
  trail: (params: { from?: string; to?: string; limit?: number } = {}) =>
    api.get<AuditTrailItem[]>('/audit/trail', { params }).then((r) => r.data),
};
