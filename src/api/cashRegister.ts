import { api } from './client';
import type {
  CashMovementRequest,
  CashSessionResponse,
  CloseSessionRequest,
  OpenSessionRequest,
  OwnerLedgerResponse,
} from '@/types/api';

export const cashRegisterApi = {
  /** Get current OPEN session (HTTP 204 if none) */
  current: () =>
    api.get<CashSessionResponse | ''>('/cash-register/current')
       .then((r) => (r.status === 204 ? null : (r.data as CashSessionResponse))),

  get: (id: string) =>
    api.get<CashSessionResponse>(`/cash-register/${id}`).then((r) => r.data),

  open: (req: OpenSessionRequest) =>
    api.post<CashSessionResponse>('/cash-register/open', req).then((r) => r.data),

  addMovement: (id: string, req: CashMovementRequest) =>
    api.post<CashSessionResponse>(`/cash-register/${id}/movements`, req).then((r) => r.data),

  close: (id: string, req: CloseSessionRequest) =>
    api.post<CashSessionResponse>(`/cash-register/${id}/close`, req).then((r) => r.data),

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
