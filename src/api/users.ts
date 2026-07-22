import { api } from './client';
import type { Role } from '@/types/api';

export interface AppUser {
  id: string;
  username: string;
  fullName: string;
  email: string;
  role: Role;
  active: boolean;
  lastLogin: string | null;
}

export interface CreateUserRequest {
  username: string;
  fullName: string;
  email?: string;
  role: Role;
  password: string;
}

/** จัดการบัญชีพนักงาน — ADMIN เท่านั้น (FIX-104) */
export const usersApi = {
  list: () => api.get<AppUser[]>('/users').then((r) => r.data),

  create: (req: CreateUserRequest) =>
    api.post<AppUser>('/users', req).then((r) => r.data),

  setActive: (id: string, active: boolean) =>
    api.patch<AppUser>(`/users/${id}/active`, null, { params: { active } }).then((r) => r.data),

  changeRole: (id: string, role: Role) =>
    api.patch<AppUser>(`/users/${id}/role`, null, { params: { role } }).then((r) => r.data),

  resetPassword: (id: string, newPassword: string) =>
    api.post<AppUser>(`/users/${id}/reset-password`, { newPassword }).then((r) => r.data),
};
