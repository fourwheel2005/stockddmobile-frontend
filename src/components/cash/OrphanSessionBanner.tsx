import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertOctagon, X, RefreshCw, DoorClosed } from 'lucide-react';
import { cashRegisterApi } from '@/api/cashRegister';
import { extractErrorMessage } from '@/api/client';
import { formatDateTime } from '@/lib/format';
import { useAuthStore } from '@/stores/authStore';
import type { CashSessionResponse } from '@/types/api';

interface Props {
  /** id ของ session ที่กำลังเปิดอยู่ — ใช้แยก orphan จาก current */
  currentSessionId: string | undefined;
}

/**
 * P4 — Self-heal banner: surface session ที่ "OPEN ค้าง" บน register อื่น
 *
 *  - แสดงเฉพาะ ADMIN/MANAGER
 *  - แสดงเฉพาะถ้ามี OPEN session > 1 ที่ไม่ใช่ current
 *  - ADMIN กด "Force close" → ปิด orphan + invalidate cache
 */
export function OrphanSessionBanner({ currentSessionId }: Props) {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const canAdmin = useAuthStore((s) => s.hasRole('ADMIN'));
  const canManage = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));

  // เปิดเฉพาะ ADMIN/MANAGER — ไม่ต้อง query ถ้า STAFF
  const { data } = useQuery({
    queryKey: ['cash-sessions', 'orphans'],
    queryFn: cashRegisterApi.listAllOpen,
    enabled: canManage && !dismissed,
    refetchInterval: 60_000,
  });

  const forceClose = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      cashRegisterApi.forceClose(vars.id, vars.reason),
    onSuccess: (s) => {
      toast.success(`Force-close ${s.sessionNo} สำเร็จ`);
      qc.invalidateQueries({ queryKey: ['cash-session'] });
      qc.invalidateQueries({ queryKey: ['cash-sessions', 'orphans'] });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  if (!canManage || dismissed) return null;

  const orphans = (data ?? []).filter((s) => s.id !== currentSessionId);
  if (orphans.length === 0) return null;

  const handleForceClose = (s: CashSessionResponse) => {
    const reason = window.prompt(
      `Force-close session ${s.sessionNo}?\n\n` +
      `เก๊ะ: ${s.registerName}\n` +
      `เปิดโดย: ${s.openedBy}\n` +
      `เปิดเมื่อ: ${formatDateTime(s.openedAt)}\n\n` +
      'การ force-close จะตั้ง variance = 0 และทำเครื่องหมายเป็น cleanup.\n' +
      'กรอกเหตุผล (จะถูกบันทึกใน note):',
      'Orphan cleanup',
    );
    if (!reason || !reason.trim()) return;
    forceClose.mutate({ id: s.id, reason: reason.trim() });
  };

  return (
    <div className="card border-2 border-amber-300 bg-amber-50">
      <div className="card-body">
        <div className="mb-2 flex items-start gap-2">
          <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <h3 className="font-semibold text-amber-900">
              พบ session ค้างอยู่ {orphans.length} อัน (ไม่ใช่ session ปัจจุบัน)
            </h3>
            <p className="mt-0.5 text-xs text-amber-800">
              อาจเกิดจากระบบ crash ก่อน close หรือเปิดบน register อื่น —
              {canAdmin ? ' Force-close ได้ที่นี่' : ' ติดต่อ ADMIN เพื่อจัดการ'}
            </p>
          </div>
          <button onClick={() => setDismissed(true)}
                  className="rounded p-1 text-amber-700 hover:bg-amber-100"
                  title="ซ่อน">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          {orphans.map((s) => (
            <div key={s.id}
                 className="flex items-center gap-2 rounded border border-amber-200 bg-white p-2 text-sm">
              <div className="flex-1">
                <div className="font-mono text-xs font-semibold text-slate-800">{s.sessionNo}</div>
                <div className="text-[11px] text-slate-500">
                  เก๊ะ {s.registerName} · เปิดโดย {s.openedBy} · {formatDateTime(s.openedAt)}
                </div>
              </div>
              {canAdmin && (
                <button
                  onClick={() => handleForceClose(s)}
                  disabled={forceClose.isPending}
                  className="flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                  {forceClose.isPending
                    ? <RefreshCw className="h-3 w-3 animate-spin" />
                    : <DoorClosed className="h-3 w-3" />}
                  Force-close
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
