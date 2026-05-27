import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types/api';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  setSession: (s: { accessToken: string; refreshToken: string; user: User }) => void;
  setAccessToken: (token: string) => void;
  clear: () => void;
  isAuthenticated: () => boolean;
  hasRole: (...roles: Array<User['role']>) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: ({ accessToken, refreshToken, user }) =>
        set({ accessToken, refreshToken, user }),
      setAccessToken: (token) => set({ accessToken: token }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
      isAuthenticated: () => !!get().accessToken && !!get().user,
      hasRole: (...roles) => {
        const role = get().user?.role;
        return !!role && roles.includes(role);
      },
    }),
    { name: 'stockdd-auth' }
  )
);
