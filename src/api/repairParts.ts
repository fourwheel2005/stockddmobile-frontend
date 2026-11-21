import { api } from './client';
import type {
  CreateRepairPartGroupRequest,
  RepairPart,
  RepairPartGroup,
  RepairPartLine,
  RepairPartMovement,
  RepairPartRequest,
  RepairTicket,
} from '@/types/api';

/** อะไหล่ซ่อม / ค่าแรง (FIX-235) */
export const repairPartsApi = {
  catalog: () => api.get<RepairPartGroup[]>('/repair-parts').then((r) => r.data),

  createGroup: (req: CreateRepairPartGroupRequest) =>
    api.post<RepairPartGroup>('/repair-parts/groups', req).then((r) => r.data),
  updateGroup: (id: string, req: { name: string; note?: string }) =>
    api.put<RepairPartGroup>(`/repair-parts/groups/${id}`, req).then((r) => r.data),
  deleteGroup: (id: string) => api.delete<void>(`/repair-parts/groups/${id}`).then((r) => r.data),

  createPart: (req: RepairPartRequest) => api.post<RepairPart>('/repair-parts/parts', req).then((r) => r.data),
  updatePart: (id: string, req: RepairPartRequest) =>
    api.put<RepairPart>(`/repair-parts/parts/${id}`, req).then((r) => r.data),
  deletePart: (id: string) => api.delete<void>(`/repair-parts/parts/${id}`).then((r) => r.data),

  receive: (id: string, req: { quantity: number; unitCost?: number; note?: string }) =>
    api.post<RepairPart>(`/repair-parts/parts/${id}/receive`, req).then((r) => r.data),
  adjust: (id: string, req: { newQuantity: number; reason: string }) =>
    api.post<RepairPart>(`/repair-parts/parts/${id}/adjust`, req).then((r) => r.data),
  movements: (id: string) =>
    api.get<RepairPartMovement[]>(`/repair-parts/parts/${id}/movements`).then((r) => r.data),

  /** ตั้งรายการอะไหล่ของใบงานซ่อม (ตัด/คืนสต็อกตามส่วนต่าง) */
  setTicketParts: (ticketId: string, parts: RepairPartLine[]) =>
    api.put<RepairTicket>(`/repair-tickets/${ticketId}/parts`, { parts }).then((r) => r.data),
};
