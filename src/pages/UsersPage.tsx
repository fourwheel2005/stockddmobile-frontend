import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { UserCog, UserPlus, KeyRound, Eye, EyeOff, ShieldCheck, CheckCircle2, Ban } from 'lucide-react';
import { usersApi, type AppUser, type CreateUserRequest } from '@/api/users';
import { extractErrorMessage } from '@/api/client';
import { formatDateTime } from '@/lib/format';
import type { Role } from '@/types/api';

const ROLE_INFO: Record<Role, { label: string; hint: string; cls: string }> = {
  FREEDOM: { label: 'เจ้าของสูงสุด (Freedom)', hint: 'สิทธิ์ทุกอย่าง — บัญชีนี้ไม่แสดง/แก้ในหน้านี้', cls: 'badge-amber' },
  ADMIN:   { label: 'เจ้าของ (ADMIN)',   hint: 'เห็นทุกอย่าง + จัดการพนักงาน', cls: 'badge-red' },
  MANAGER: { label: 'ผู้จัดการ',          hint: 'เห็นต้นทุน/รายงาน/สต็อก',      cls: 'badge-blue' },
  STAFF:   { label: 'พนักงานขาย (STAFF)', hint: 'ขายหน้าร้านอย่างเดียว',        cls: 'badge-slate' },
};

const EMPTY_FORM: CreateUserRequest = {
  username: '', fullName: '', email: '', role: 'STAFF', password: '',
};

/** จัดการบัญชีพนักงาน — ADMIN สร้าง/ปิดใช้งาน/รีเซ็ตรหัสได้เอง (FIX-104) */
export function UsersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateUserRequest>(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [resetFor, setResetFor] = useState<AppUser | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const create = useMutation({
    mutationFn: () => usersApi.create({ ...form, email: form.email?.trim() || undefined }),
    onSuccess: (u) => {
      toast.success(`สร้างบัญชี ${u.username} แล้ว`);
      setForm(EMPTY_FORM);
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => usersApi.setActive(id, active),
    onSuccess: (u) => { toast.success(`${u.username} — ${u.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}แล้ว`); invalidate(); },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const resetPassword = useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => usersApi.resetPassword(id, password),
    onSuccess: (u) => {
      toast.success(`ตั้งรหัสผ่านใหม่ให้ ${u.username} แล้ว`);
      setResetFor(null);
      setNewPassword('');
      invalidate();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  const formValid = form.username.trim().length >= 3
    && form.fullName.trim().length > 0
    && form.password.length >= 8;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <UserCog className="h-6 w-6 text-brand-600" />
          จัดการพนักงาน
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          สร้างบัญชีให้พนักงานใหม่ · ปิดบัญชีคนที่ลาออก · ตั้งรหัสผ่านใหม่เมื่อลืมรหัส
        </p>
      </div>

      {/* สร้างบัญชีใหม่ */}
      <div className="card">
        <div className="card-header flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          <span>เพิ่มพนักงานใหม่</span>
        </div>
        <div className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-600">ชื่อผู้ใช้ (login) *</label>
              <input className="input lowercase" placeholder="เช่น staff02" value={form.username}
                     onChange={(e) => setForm({ ...form, username: e.target.value.trim() })} />
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-600">ชื่อ-นามสกุล *</label>
              <input className="input" placeholder="เช่น สมชาย ใจดี" value={form.fullName}
                     onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-600">รหัสผ่านตั้งต้น * (≥ 8 ตัว)</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input pr-11"
                  value={form.password}
                  autoComplete="new-password"
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 hover:text-slate-700"
                        aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="sm:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-600">สิทธิ์ *</label>
              <select className="input" value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                {(Object.keys(ROLE_INFO) as Role[]).map((r) => (
                  <option key={r} value={r}>{ROLE_INFO[r].label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              <ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-emerald-600" />
              {ROLE_INFO[form.role].hint}
            </p>
            <button className="btn-primary" disabled={!formValid || create.isPending}
                    onClick={() => create.mutate()}>
              <UserPlus className="h-4 w-4" />
              {create.isPending ? 'กำลังสร้าง...' : 'สร้างบัญชี'}
            </button>
          </div>
        </div>
      </div>

      {/* รายชื่อ */}
      <div className="card">
        <div className="card-header">รายชื่อผู้ใช้ทั้งหมด</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-left text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">ชื่อผู้ใช้</th>
                <th className="px-4 py-3">ชื่อ-นามสกุล</th>
                <th className="px-4 py-3">สิทธิ์</th>
                <th className="px-4 py-3">เข้าใช้ล่าสุด</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {users?.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-medium">{u.username}</td>
                  <td className="px-4 py-3">{u.fullName}</td>
                  <td className="px-4 py-3">
                    <span className={ROLE_INFO[u.role].cls}>{ROLE_INFO[u.role].label}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {u.lastLogin ? formatDateTime(u.lastLogin) : 'ยังไม่เคยเข้า'}
                  </td>
                  <td className="px-4 py-3">
                    {u.active
                      ? <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-4 w-4" /> ใช้งานได้
                        </span>
                      : <span className="inline-flex items-center gap-1 text-slate-400">
                          <Ban className="h-4 w-4" /> ปิดใช้งาน
                        </span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button className="btn-secondary py-1 text-xs"
                              onClick={() => { setResetFor(u); setNewPassword(''); }}>
                        <KeyRound className="h-3.5 w-3.5" />
                        ตั้งรหัสใหม่
                      </button>
                      <button
                        className={`btn-secondary py-1 text-xs ${u.active ? 'text-red-600' : 'text-emerald-700'}`}
                        disabled={toggleActive.isPending}
                        onClick={() => toggleActive.mutate({ id: u.id, active: !u.active })}>
                        {u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ตั้งรหัสผ่านใหม่ */}
      {resetFor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/70 p-4 pt-[15vh] backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl">
            <h2 className="flex items-center gap-2 font-semibold">
              <KeyRound className="h-5 w-5 text-brand-600" />
              ตั้งรหัสผ่านใหม่ — {resetFor.username}
            </h2>
            <div className="relative mt-4">
              <input
                type={showNewPassword ? 'text' : 'password'}
                className="input pr-11"
                placeholder="รหัสผ่านใหม่ (≥ 8 ตัว)"
                value={newPassword}
                autoFocus
                autoComplete="new-password"
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <button type="button" onClick={() => setShowNewPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 hover:text-slate-700"
                      aria-label={showNewPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setResetFor(null)}>ยกเลิก</button>
              <button className="btn-primary"
                      disabled={newPassword.length < 8 || resetPassword.isPending}
                      onClick={() => resetPassword.mutate({ id: resetFor.id, password: newPassword })}>
                {resetPassword.isPending ? 'กำลังบันทึก...' : 'บันทึกรหัสใหม่'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
