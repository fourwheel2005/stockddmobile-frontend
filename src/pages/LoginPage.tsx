import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { LogIn } from 'lucide-react';
import { authApi } from '@/api/auth';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

interface FormValues {
  username: string;
  password: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: { username: '', password: '' },
  });

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const res = await authApi.login(data);
      setSession({
        accessToken: res.accessToken,
        refreshToken: res.refreshToken,
        user: res.user,
      });
      toast.success(`สวัสดี ${res.user.fullName}`);
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-100 px-4">
      <div className="w-full max-w-md">
        <div className="card">
          <div className="card-body space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white">
                <LogIn className="h-6 w-6" />
              </div>
              <h1 className="text-2xl font-bold">Stockdd Mobile</h1>
              <p className="text-sm text-slate-500">เข้าสู่ระบบจัดการสต็อก</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">Username</label>
                <input
                  type="text"
                  autoComplete="username"
                  className="input"
                  {...register('username', { required: 'กรุณาระบุ username' })}
                />
                {errors.username && (
                  <p className="mt-1 text-xs text-red-600">{errors.username.message}</p>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Password</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  className="input"
                  {...register('password', { required: 'กรุณาระบุ password' })}
                />
                {errors.password && (
                  <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
                )}
              </div>

              <button type="submit" className="btn-primary w-full" disabled={submitting}>
                {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
              </button>
            </form>

            <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              <div className="mb-1 font-medium">บัญชีทดสอบ:</div>
              <div>admin / Admin@1234</div>
              <div>manager01 / Manager@1234</div>
              <div>staff01 / Staff@1234</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
