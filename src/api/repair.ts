import { api } from './client';
import type {
  CreateRepairRequest,
  PageResponse,
  RepairStatus,
  RepairTicket,
  UpdateRepairRequest,
  UpdateRepairStatusRequest,
} from '@/types/api';

export const repairApi = {
  create: (req: CreateRepairRequest) =>
    api.post<RepairTicket>('/repair-tickets', req).then((r) => r.data),

  list: (params: { status?: RepairStatus; page?: number; size?: number } = {}) =>
    api.get<PageResponse<RepairTicket>>('/repair-tickets', { params }).then((r) => r.data),

  get: (id: string) =>
    api.get<RepairTicket>(`/repair-tickets/${id}`).then((r) => r.data),

  /** ประวัติใบรับซ่อมของเครื่อง (ยิง IMEI/Serial ที่ POS) — FIX-103 */
  listByDevice: (params: { imei?: string; serial?: string }) =>
    api.get<RepairTicket[]>('/repair-tickets/by-device', { params }).then((r) => r.data),

  updateStatus: (id: string, req: UpdateRepairStatusRequest) =>
    api.patch<RepairTicket>(`/repair-tickets/${id}/status`, req).then((r) => r.data),

  /** แก้ไข/เพิ่มข้อมูลใบซ่อมระหว่างทาง (ก่อนรับเครื่องคืน) */
  update: (id: string, req: UpdateRepairRequest) =>
    api.put<RepairTicket>(`/repair-tickets/${id}`, req).then((r) => r.data),
};
