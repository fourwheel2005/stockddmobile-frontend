import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import {
  Boxes, Eye, EyeOff, Loader2, ArrowRight,
  ScanLine, BellRing, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import { authApi } from '@/api/auth';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';

interface FormValues {
  username: string;
  password: string;
}

const FEATURES = [
  { icon: ScanLine,    title: 'ขายไว ยิงบาร์โค้ด/IMEI', desc: 'ตัดสต็อกอัตโนมัติทุกการขาย' },
  { icon: BellRing,    title: 'แจ้งเตือนผ่าน LINE',      desc: 'สต็อกใกล้หมด · สรุปยอดรายวัน' },
  { icon: ShieldCheck, title: 'ปลอดภัย แยกสิทธิ์',       desc: 'ผู้ดูแล · ผู้จัดการ · พนักงาน' },
];

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((s) => s.setSession);

  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [shake, setShake] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    defaultValues: { username: '', password: '' },
  });

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

  const detectCaps = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (typeof e.getModifierState === 'function') setCapsOn(e.getModifierState('CapsLock'));
  };

  const onSubmit = async (data: FormValues) => {
    setSubmitting(true);
    try {
      const res = await authApi.login(data);
      setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken, user: res.user });
      toast.success(`สวัสดี ${res.user.fullName}`);
      navigate(from, { replace: true });
    } catch (err) {
      setShake(true);
      setTimeout(() => setShake(false), 450);
      toast.error(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-white font-sans md:grid md:grid-cols-[1.05fr_1fr]">
      {/* ─── Brand panel ─────────────────────────────────────────────── */}
      <aside className="relative isolate overflow-hidden bg-gradient-to-br from-brand-950 via-brand-900 to-brand-800 px-6 pb-10 pt-9 text-white md:flex md:flex-col md:justify-between md:rounded-r-[2.5rem] md:p-12">
        {/* animated accent blobs (ปิดเองเมื่อ prefers-reduced-motion) */}
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl animate-float-slow motion-reduce:animate-none" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-accent-400/20 blur-3xl animate-float-slower motion-reduce:animate-none" />
        {/* subtle grid texture */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />

        {/* logo + wordmark */}
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur">
            <Boxes className="h-6 w-6 text-accent-400" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg font-bold tracking-tight">
              Stockdd<span className="text-accent-400">Mobile</span>
            </div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/50">Inventory · POS</div>
          </div>
        </div>

        {/* headline + features (เต็มรูปแบบบนจอใหญ่) */}
        <div className="relative mt-8 md:mt-0">
          <h2 className="font-display text-2xl font-bold leading-snug md:text-4xl">
            จัดการสต็อกร้านมือถือ<br className="hidden md:block" />
            <span className="text-accent-400"> ครบ จบ ในที่เดียว</span>
          </h2>
          <p className="mt-3 max-w-sm text-sm text-white/60">
            รับเข้า–ขาย–เช็กไอเอ็มอี–แจ้งเตือน รวมไว้ในระบบเดียว ใช้ได้ทั้งหน้าร้านและบนมือถือ
          </p>

          <ul className="mt-7 hidden space-y-4 md:block">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  <f.icon className="h-[18px] w-[18px] text-accent-400" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="block text-xs text-white/55">{f.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-8 hidden text-xs text-white/40 md:block">
          © {new Date().getFullYear()} Stockdd Mobile · ระบบจัดการสต็อกและขายหน้าร้าน
        </p>
      </aside>

      {/* ─── Form panel ──────────────────────────────────────────────── */}
      <main className="flex items-center justify-center px-6 py-12 md:p-12">
        <div className="w-full max-w-sm">
          <header className="animate-fade-up" style={{ animationDelay: '40ms' }}>
            <h1 className="font-display text-[26px] font-bold tracking-tight text-slate-900">
              เข้าสู่ระบบ
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              ยินดีต้อนรับกลับ — กรอกข้อมูลเพื่อเริ่มทำงาน
            </p>
          </header>

          <form
            onSubmit={handleSubmit(onSubmit)}
            className={`mt-8 space-y-5 ${shake ? 'animate-shake' : ''}`}
            noValidate
          >
            {/* Username */}
            <div className="animate-fade-up" style={{ animationDelay: '120ms' }}>
              <label htmlFor="username" className="mb-1.5 block text-sm font-semibold text-slate-700">
                ชื่อผู้ใช้ <span className="font-normal text-slate-400">(Username)</span>
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                placeholder="เช่น staff01"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
                aria-invalid={!!errors.username}
                {...register('username', { required: 'กรุณาระบุชื่อผู้ใช้' })}
              />
              {errors.username && (
                <p className="mt-1.5 text-xs font-medium text-red-600">{errors.username.message}</p>
              )}
            </div>

            {/* Password */}
            <div className="animate-fade-up" style={{ animationDelay: '200ms' }}>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-700">
                รหัสผ่าน <span className="font-normal text-slate-400">(Password)</span>
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-12 text-sm outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
                  aria-invalid={!!errors.password}
                  onKeyUp={detectCaps}
                  onKeyDown={detectCaps}
                  {...register('password', { required: 'กรุณาระบุรหัสผ่าน' })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                  className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs font-medium text-red-600">{errors.password.message}</p>
              )}
              {capsOn && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-amber-600">
                  <AlertTriangle className="h-3.5 w-3.5" /> Caps Lock เปิดอยู่
                </p>
              )}
            </div>

            {/* Submit */}
            <div className="animate-fade-up pt-1" style={{ animationDelay: '280ms' }}>
              <button
                type="submit"
                disabled={submitting}
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-600/25 transition-all duration-200 hover:bg-brand-700 hover:shadow-brand-700/30 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> กำลังเข้าสู่ระบบ...
                  </>
                ) : (
                  <>
                    เข้าสู่ระบบ
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </div>
          </form>

          <p className="mt-8 text-center text-xs text-slate-400 md:hidden">
            © {new Date().getFullYear()} Stockdd Mobile
          </p>
        </div>
      </main>
    </div>
  );
}
