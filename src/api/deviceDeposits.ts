import { api } from './client';
import type {
  DepositArrivalRequest, DepositMethod, DeviceDeposit, OrderDeviceRequest, ReserveDeviceRequest, UpdateDepositRequest,
} from '@/types/api';

/** จองเครื่อง / มัดจำสั่งเครื่อง (FIX-214) */
export const deviceDepositsApi = {
  /** scope: OPEN = รอเครื่องถึง + พร้อมขาย · CLOSED = ขายแล้ว + ยกเลิก */
  list: (scope: 'OPEN' | 'CLOSED' | 'ALL' = 'OPEN') =>
    api.get<DeviceDeposit[]>('/device-deposits', { params: { scope } }).then((r) => r.data),

  get: (id: string) => api.get<DeviceDeposit>(`/device-deposits/${id}`).then((r) => r.data),

  reserve: (req: ReserveDeviceRequest) =>
    api.post<DeviceDeposit>('/device-deposits/reserve', req).then((r) => r.data),

  order: (req: OrderDeviceRequest) =>
    api.post<DeviceDeposit>('/device-deposits/order', req).then((r) => r.data),

  /** แก้ไขใบที่ยังเปิดอยู่ — ทุก role (FIX-215) */
  update: (id: string, req: UpdateDepositRequest) =>
    api.put<DeviceDeposit>(`/device-deposits/${id}`, req).then((r) => r.data),

  addPayment: (id: string, amount: number, method: DepositMethod, note?: string) =>
    api.post<DeviceDeposit>(`/device-deposits/${id}/payments`, { amount, method, note }).then((r) => r.data),

  arrive: (id: string, req: DepositArrivalRequest) =>
    api.post<DeviceDeposit>(`/device-deposits/${id}/arrive`, req).then((r) => r.data),

  /** ยกเลิก — refundAmount 0 = ริบมัดจำทั้งหมด · ต้องใช้รหัสความปลอดภัยร้าน */
  cancel: (id: string, refundAmount: number, refundMethod: 'CASH' | 'TRANSFER', reason: string, securityCode: string) =>
    api.post<DeviceDeposit>(`/device-deposits/${id}/cancel`, { refundAmount, refundMethod, reason },
      { headers: { 'X-Security-Code': securityCode } }).then((r) => r.data),
};
