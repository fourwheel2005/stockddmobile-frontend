import { api } from './client';
import type { LoginRequest, LoginResponse, User } from '@/types/api';

export const authApi = {
  login: (req: LoginRequest) =>
    api.post<LoginResponse>('/auth/login', req).then((r) => r.data),

  me: () => api.get<User>('/auth/me').then((r) => r.data),

  logout: (refreshToken: string) =>
    api.post<void>('/auth/logout', { refreshToken }).then((r) => r.data),
};
