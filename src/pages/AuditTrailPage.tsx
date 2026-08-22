import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, Search } from 'lucide-react';
import { auditApi } from '@/api/audit';
import { formatTHB, formatDateTime } from '@/lib/format';
import { shopDayKey } from '@/lib/datetime';

/** สี per หมวด — อ่าน timeline ปราดเดียวรู้ประเภท */
const CATEGORY_STYLE: Record<string, string> = {
  'ขายออก': 'bg-emerald-100 text-emerald-700',
  'คืนเงิน/รับคืน': 'bg-red-100 text-red-700',
  'สต็อกเข้า': 'bg-sky-100 text-sky-700',
  'สต็อกออก': 'bg-orange-100 text-orange-700',
  'ปรับ/ย้ายสต็อก': 'bg-violet-100 text-violet-700',
  'เก๊ะเงินสด': 'bg-amber-100 text-amber-700',
  'ตรวจนับ': 'bg-cyan-100 text-cyan-700',
  'แก้ไขข้อมูล': 'bg-fuchsia-100 text-fuchsia-700',
  'ลบข้อมูล': 'bg-rose-100 text-rose-700',
};

const today = () => shopDayKey(new Date().toISOString());
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return shopDayKey(d.toISOString());
};

/**
 * รายงานหลังบ้านทั้งหมด (FIX-159) — เห็นเฉพาะ role FREEDOM (เจ้าของ)
 * timeline รวมทุกแหล่ง: ขาย/คืน · สต็อก · เก๊ะ · ตรวจนับ · แก้ไข/ลบ
 */
export function AuditTrailPage() {
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(today());
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');

  const query = useQuery({
    queryKey: ['audit-trail', from, to],
    queryFn: () => auditApi.trail({ from, to, limit: 500 }),
  });

  const rows = useMemo(() => {
    let items = query.data ?? [];
    if (category) items = items.filter((i) => i.category === category);
    const term = q.trim().toLowerCase();
    if (term) {
      items = items.filter((i) =>
        [i.action, i.refNo, i.actor, i.detail].some((v) => v?.toLowerCase().includes(term)));
    }
    return items;
  }, [query.data, category, q]);

  const categories = useMemo(
    () => [...new Set((query.data ?? []).map((i) => i.category))], [query.data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Eye className="h-6 w-6 text-brand-600" /> รายงานหลังบ้านทั้งหมด
        </h1>
        <p className="text-sm text-slate-500">
          ทุกความเคลื่อนไหวในระบบ — ขายออก · ซื้อเข้า · สต็อก · เก๊ะ · ตรวจนับ · แก้ไข/ลบข้อมูล ·
          <strong> เห็นเฉพาะบัญชีเจ้าของ (Freedom)</strong>
        </p>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-2 p-3">
        <input type="date" className="input w-40" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span className="text-slate-400">→</span>
        <input type="date" className="input w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input w-full pl-9" placeholder="ค้นหา เลขบิล / รหัสเครื่อง / ชื่อคน..."
                 value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setCategory('')}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${category === ''
                  ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-600'}`}>
          ทั้งหมด ({query.data?.length ?? 0})
        </button>
        {categories.map((c) => (
          <button key={c} type="button" onClick={() => setCategory(c === category ? '' : c)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${category === c
                    ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-300 bg-white text-slate-600'}`}>
            {c}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="card overflow-x-auto">
        {query.isPending && <div className="p-8 text-center text-slate-400">กำลังโหลด...</div>}
        {!query.isPending && rows.length === 0 && (
          <div className="p-8 text-center text-slate-400">ไม่มีรายการในช่วง/เงื่อนไขที่เลือก</div>
        )}
        {rows.length > 0 && (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5">เวลา</th>
                <th className="px-4 py-2.5">หมวด</th>
                <th className="px-4 py-2.5">รายการ</th>
                <th className="px-4 py-2.5">อ้างอิง</th>
                <th className="px-4 py-2.5 text-right">จำนวนเงิน</th>
                <th className="px-4 py-2.5">โดย</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50/60">
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{formatDateTime(r.occurredAt)}</td>
                  <td className="px-4 py-2">
                    <span className={`whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-semibold ${CATEGORY_STYLE[r.category] ?? 'bg-slate-100 text-slate-600'}`}>
                      {r.category}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    {r.action}
                    {r.detail && <div className="text-xs text-slate-400">{r.detail}</div>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{r.refNo ?? '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.amount != null ? formatTHB(r.amount) : '—'}</td>
                  <td className="px-4 py-2 text-xs">{r.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
