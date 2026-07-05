import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/stores/authStore';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export const api = axios.create({
  baseURL,
  // กัน request ค้างตลอดไปเมื่อเซิร์ฟเวอร์ไม่ตอบ/เน็ตสะดุด (เดิมไม่ตั้ง → หน้าจอ "คา" ไม่หลุด)
  // 45s เผื่อ checkout/อัปสลิปที่นานหน่อย · ปกติ scan/GET เสร็จใน < 1s
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
  },
});

// ─── Request interceptor: attach Bearer ──────────────────────────────────
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: auto-refresh on 401 ───────────────────────────
let refreshPromise: Promise<string> | null = null;

async function performRefresh(): Promise<string> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) throw new Error('No refresh token');

  const { data } = await axios.post(
    `${baseURL}/auth/refresh`,
    { refreshToken },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  useAuthStore.getState().setSession({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user,
  });
  return data.accessToken;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const original = err.config as RetriableConfig | undefined;
    if (!original) return Promise.reject(err);

    const isAuthEndpoint = original.url?.includes('/auth/login')
      || original.url?.includes('/auth/refresh');

    if (err.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      try {
        refreshPromise = refreshPromise ?? performRefresh();
        const newToken = await refreshPromise;
        refreshPromise = null;
        if (original.headers) {
          original.headers.Authorization = `Bearer ${newToken}`;
        }
        return api(original);
      } catch (e) {
        refreshPromise = null;
        useAuthStore.getState().clear();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(e);
      }
    }
    return Promise.reject(err);
  }
);

export function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    // ไม่มี response กลับมาเลย (เซิร์ฟเวอร์ไม่ตอบ / timeout / เน็ตหลุด) → ข้อความไทยชัดเจน
    if (!err.response) {
      if (err.code === 'ECONNABORTED' || /timeout/i.test(err.message)) {
        return 'เซิร์ฟเวอร์ตอบช้าเกินไป (timeout) — ลองใหม่อีกครั้ง';
      }
      return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — เช็คเน็ต/เซิร์ฟเวอร์แล้วลองใหม่';
    }
    const data = err.response.data as { message?: string; errors?: Array<{ field: string; message: string }> } | undefined;
    if (data?.errors?.length) {
      return data.errors.map((e) => `${e.field}: ${e.message}`).join(', ');
    }
    return data?.message ?? err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
