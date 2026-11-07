import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { promotionsApi, PROMOTIONS_QUERY_KEY, RUNNING_PROMOTIONS_QUERY_KEY } from '@/api/promotions';
import { extractErrorMessage } from '@/api/client';
import { formatDateTime } from '@/lib/format';
import { STATUS_LABEL, effectSummary } from '@/lib/promotions';
import { PromotionFormModal } from '@/components/promotions/PromotionFormModal';
import type { PromotionResponse } from '@/types/api';

/**
 * โปรโมชันราคารายรุ่น (FIX-217) — ลดราคาสด/ดาวน์/ค่างวด เป็นช่วงเวลา
 * ราคาปกติในตารางไม่ถูกแก้ · POS + เว็บหน้าร้านใช้ราคาโปรเองตอนโปรเริ่ม และกลับราคาปกติเองตอนโปรจบ
 */
export function PromotionsPage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ editing: PromotionResponse | null } | null>(null);
  const { data: list = [], isLoading } = useQuery({ queryKey: PROMOTIONS_QUERY_KEY, queryFn: promotionsApi.list });

  const remove = useMutation({
    mutationFn: (id: string) => promotionsApi.remove(id),
    onSuccess: () => {
      toast.success('ลบโปรแล้ว — ราคากลับเป็นราคาปกติ');
      qc.invalidateQueries({ queryKey: PROMOTIONS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: RUNNING_PROMOTIONS_QUERY_KEY });
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Tag className="h-6 w-6 text-brand-600" /> โปรโมชันราคา</h1>
          <p className="page-subtitle">ลดราคาสด / ดาวน์ / ค่างวด รายรุ่น เป็นช่วงเวลา · ราคาปกติยังอยู่ หมดโปรกลับเอง · POS และเว็บขึ้นป้ายโปรอัตโนมัติ</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({ editing: null })}><Plus className="h-4 w-4" /> สร้างโปร</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2">ชื่อโปร</th><th className="px-4 py-2">ใช้กับ</th><th className="px-4 py-2">ผลโปร</th>
              <th className="px-4 py-2">ช่วงเวลา</th><th className="px-4 py-2">สถานะ</th><th className="px-4 py-2 text-right">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">กำลังโหลด…</td></tr>}
            {!isLoading && list.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">ยังไม่มีโปร — กด “สร้างโปร” เพื่อเริ่ม</td></tr>
            )}
            {list.map((p) => {
              const st = STATUS_LABEL[p.status];
              const targets = p.conditionGroup === 'NEW'
                ? (p.variantIds.length > 0 ? `${p.variantIds.length} สี` : 'ทุกสี')
                : (p.serialIds.length > 0 ? `${p.serialIds.length} เครื่อง` : 'ทุกเครื่อง');
              return (
                <tr key={p.id} className="border-t align-top">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.name}</div>
                    {p.note && <div className="text-xs text-slate-500">{p.note}</div>}
                    {p.priority !== 0 && <div className="text-xs text-slate-500">ลำดับ {p.priority}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div>{p.productName} {p.storageDigits ? `${p.storageDigits}GB` : '(ทุกความจุ)'}</div>
                    <div className="text-xs text-slate-500">{p.conditionGroup === 'NEW' ? 'มือ 1' : 'มือ 2'} · {targets}</div>
                  </td>
                  <td className="px-4 py-2.5">{effectSummary(p)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs">{formatDateTime(p.startAt)}<br />ถึง {formatDateTime(p.endAt)}</td>
                  <td className="px-4 py-2.5"><span className={st.badge}>{st.text}</span></td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100" title="แก้ไข"
                            onClick={() => setModal({ editing: p })}><Pencil className="h-4 w-4" /></button>
                    <button className="rounded p-1.5 text-red-600 hover:bg-red-50" title="ลบ" disabled={remove.isPending}
                            onClick={() => { if (confirm(`ลบโปร "${p.name}" ? ราคาจะกลับเป็นราคาปกติทันที`)) remove.mutate(p.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && <PromotionFormModal editing={modal.editing} onClose={() => setModal(null)} />}
    </div>
  );
}
