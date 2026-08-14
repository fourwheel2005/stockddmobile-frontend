import { api } from './client';
import type {
  CashMovementRequest,
  CashSessionResponse,
  CloseSessionRequest,
  CashPeriodSummaryResponse,
  OpenSessionRequest,
  OwnerLedgerResponse,
  PageResponse,
} from '@/types/api';

export const cashRegisterApi = {
  /** Get current OPEN session ของสาขา (HTTP 204 if none) */
  current: (branchId?: string) =>
    api.get<CashSessionResponse | ''>('/cash-register/current', { params: branchId ? { branchId } : {} })
       .then((r) => (r.status === 204 ? null : (r.data as CashSessionResponse))),

  /** ค่าตั้งต้นของร้าน (เงินทอนตั้งต้นมาตรฐาน) — FIX-100 */
  defaults: () =>
    api.get<{ defaultOpeningFloat: number }>('/cash-register/defaults').then((r) => r.data),

  get: (id: string) =>
    api.get<CashSessionResponse>(`/cash-register/${id}`).then((r) => r.data),

  open: (req: OpenSessionRequest) =>
    api.post<CashSessionResponse>('/cash-register/open', req).then((r) => r.data),

  addMovement: (id: string, req: CashMovementRequest) =>
    api.post<CashSessionResponse>(`/cash-register/${id}/movements`, req).then((r) => r.data),

  close: (id: string, req: CloseSessionRequest) =>
    api.post<CashSessionResponse>(`/cash-register/${id}/close`, req).then((r) => r.data),

  history: (params: { from: string; to: string; branchId?: string; page?: number; size?: number }) =>
    api.get<PageResponse<CashSessionResponse>>('/cash-register/sessions', { params })
      .then((r) => r.data),

  summary: (params: { from: string; to: string; branchId?: string }) =>
    api.get<CashPeriodSummaryResponse>('/cash-register/summary', { params })
      .then((r) => r.data),

  ownerLedger: (from?: string, to?: string) =>
    api.get<OwnerLedgerResponse>('/cash-register/owner-ledger', {
      params: { from, to },
    }).then((r) => r.data),

  /** บันทึกค่าส่งที่ตา/ยายสำรองจ่าย — ไม่ต้องมีการขาย (ใช้เก๊ะ OPEN ปัจจุบัน) */
  recordOwnerShipping: (req: { grandpa?: number; grandma?: number; note?: string }) =>
    api.post<OwnerLedgerResponse>('/cash-register/owner-shipping', req).then((r) => r.data),

  // ─── P4 — Self-heal stale session ────────────────────────────────
  /** List OPEN session ทุก register — admin debug deadlock */
  listAllOpen: () =>
    api.get<CashSessionResponse[]>('/cash-register/sessions/open').then((r) => r.data),

  /** Force-close orphan session (ADMIN only) */
  forceClose: (id: string, reason?: string) =>
    api.post<CashSessionResponse>(`/cash-register/${id}/force-close`,
      null, { params: reason ? { reason } : {} }).then((r) => r.data),
};
