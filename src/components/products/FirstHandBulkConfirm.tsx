import { X } from 'lucide-react';
import { formatTHB } from '@/lib/format';
import { termsSummary } from '@/lib/firstHandBulk';
import type { FirstHandInstallmentRow, UpsertFirstHandInstallmentRequest } from '@/types/api';

export interface BulkChange {
  row: FirstHandInstallmentRow;
  request: UpsertFirstHandInstallmentRequest;
  clears: boolean;
}

const money = (v: number | null | undefined) => (v == null ? '—' : formatTHB(v));

/** ยืนยันก่อนบันทึกทั้งหมด (FIX-208) — แสดง เดิม → ใหม่ ทุกแถว · ทั้งหมดบันทึกพร้อมกันหรือไม่บันทึกเลย */
export function FirstHandBulkConfirm({ changes, pending, onConfirm, onClose }: {
  changes: BulkChange[];
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const skuCount = changes.reduce((sum, c) => sum + c.row.variantCount, 0);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 pt-[5vh]">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="font-semibold">ยืนยันบันทึก {changes.length} รุ่น×ความจุ ({skuCount} SKU มือ 1)</h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2">รุ่น</th>
                <th className="px-4 py-2 text-right">ราคาซื้อสด</th>
                <th className="px-4 py-2 text-right">ดาวน์หลัก</th>
                <th className="px-4 py-2">ค่างวด</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {changes.map(({ row, request, clears }) => {
                const cashChanged = request.cashPrice != null && request.cashPrice !== row.cashPrice;
                const downChanged = (request.downPayment ?? null) !== (row.downPayment ?? null);
                const termsChanged = termsSummary(request.installmentTerms) !== termsSummary(row.installmentTerms);
                return (
                  <tr key={`${row.productId}|${row.storage}`} className="align-top">
                    <td className="px-4 py-2 font-medium">{row.productName} {row.storage}GB
                      {clears && <div className="text-xs font-normal text-rose-600">ล้างค่าผ่อนของกลุ่มนี้</div>}</td>
                    <td className={`px-4 py-2 text-right tabular-nums ${cashChanged ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>
                      {cashChanged ? <>{money(row.cashPrice)} → {money(request.cashPrice)}</> : money(row.cashPrice)}
                    </td>
                    <td className={`px-4 py-2 text-right tabular-nums ${downChanged ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>
                      {downChanged ? <>{money(row.downPayment)} → {money(request.downPayment)}</> : money(row.downPayment)}
                    </td>
                    <td className={`px-4 py-2 text-xs ${termsChanged ? 'text-amber-800' : 'text-slate-400'}`}>
                      {termsChanged
                        ? <><div className="line-through decoration-slate-300">{termsSummary(row.installmentTerms)}</div><div className="font-semibold">{termsSummary(request.installmentTerms)}</div></>
                        : termsSummary(row.installmentTerms)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-2 border-t bg-slate-50 px-5 py-3">
          <p className="text-xs text-slate-500">บันทึกพร้อมกันทั้งหมด · ถ้ามีแถวใดผิดจะไม่บันทึกเลยสักแถว · เว็บหน้าร้านอัปเดตหลังบันทึกสำเร็จ</p>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onClose}>กลับไปแก้</button>
            <button className="btn-primary bg-emerald-600 hover:bg-emerald-700" disabled={pending} onClick={onConfirm}>
              {pending ? 'กำลังบันทึก…' : `ยืนยันบันทึก ${changes.length} แถว`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
