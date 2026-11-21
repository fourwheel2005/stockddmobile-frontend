import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronRight, CircleHelp, History, PackagePlus, Pencil, Plus, Scale, Search, Trash2, Wrench } from 'lucide-react';
import { repairPartsApi } from '@/api/repairParts';
import { extractErrorMessage } from '@/api/client';
import { useAuthStore } from '@/stores/authStore';
import { formatTHB } from '@/lib/format';
import { filterCatalog, stockStatus } from '@/lib/repairParts';
import { AdjustModal, GroupModal, HistoryModal, PartModal, REPAIR_PARTS_KEY, ReceiveModal } from '@/components/repair/RepairPartModals';
import type { RepairPart, RepairPartGroup } from '@/types/api';

type Dialog =
  | { kind: 'group'; group?: RepairPartGroup }
  | { kind: 'part'; group: RepairPartGroup; part?: RepairPart }
  | { kind: 'receive' | 'adjust' | 'history'; group: RepairPartGroup; part: RepairPart }
  | null;

const HELP_KEY = 'ddmobile.repairParts.helpHidden';
const readHelpHidden = () => { try { return localStorage.getItem(HELP_KEY) === '1'; } catch { return false; } };

/**
 * อะไหล่ซ่อม / ค่าแรง (FIX-235)
 * ช่าง + ADMIN/MANAGER: กรอกต้นทุน/ราคา รับเข้า ปรับยอด · พนักงานหน้าร้าน: ดูราคาเปลี่ยนเพื่อบอกลูกค้า (ไม่เห็นต้นทุน)
 */
export function RepairPartsPage() {
  const qc = useQueryClient();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === 'TECHNICIAN' || role === 'ADMIN' || role === 'MANAGER' || role === 'FREEDOM';
  const [query, setQuery] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [helpHidden, setHelpHidden] = useState(readHelpHidden);

  const catalog = useQuery({ queryKey: REPAIR_PARTS_KEY, queryFn: repairPartsApi.catalog });
  const groups = catalog.data ?? [];
  const shown = useMemo(() => filterCatalog(groups, query), [groups, query]);
  const searching = query.trim() !== '';
  const isOpen = (id: string) => searching || shown.length <= 2 || openIds.has(id);
  const toggle = (id: string) => setOpenIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const toggleHelp = () => {
    const next = !helpHidden;
    setHelpHidden(next);
    try { localStorage.setItem(HELP_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  };

  const remove = useMutation({
    mutationFn: (d: { kind: 'group' | 'part'; id: string }) => d.kind === 'group' ? repairPartsApi.deleteGroup(d.id) : repairPartsApi.deletePart(d.id),
    onSuccess: () => { toast.success('ลบแล้ว'); qc.invalidateQueries({ queryKey: REPAIR_PARTS_KEY }); },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 page-title"><Wrench className="h-6 w-6 text-amber-600" /> {canEdit ? 'อะไหล่ซ่อม / ราคาซ่อม' : 'ราคาซ่อม / อะไหล่'}</h1>
          <p className="text-sm text-slate-500">
            {canEdit ? 'ตั้งราคาอะไหล่แต่ละรุ่น + รับประกัน + สต็อกอะไหล่ — หน้าร้านเห็นยอดรวมเพื่อบอกลูกค้าทันที'
                     : 'ค้นรุ่นแล้วบอกลูกค้าตาม "ยอดรวม" และระยะรับประกัน — ถ้าของหมดต้องแจ้งลูกค้าว่าต้องสั่ง'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={toggleHelp}><CircleHelp className="h-4 w-4" /> {helpHidden ? 'วิธีใช้' : 'ซ่อนวิธีใช้'}</button>
          {canEdit && <button className="btn-primary" onClick={() => setDialog({ kind: 'group' })}><Plus className="h-4 w-4" /> เพิ่มรุ่น / หมวด</button>}
        </div>
      </div>

      {!helpHidden && <HelpCard canEdit={canEdit} />}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="ค้นหารุ่น (iPhone 13) หรือชิ้น (จอ, แบต)" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {catalog.isLoading && <div className="card p-8 text-center text-slate-400">กำลังโหลด...</div>}
      {catalog.isError && <div className="card p-8 text-center text-red-600">โหลดตารางอะไหล่ไม่สำเร็จ ลองรีเฟรชหน้า</div>}
      {catalog.data && groups.length === 0 && (
        <div className="card p-8 text-center text-slate-500">
          ยังไม่มีรุ่นในตาราง{canEdit ? ' — กด "เพิ่มรุ่น / หมวด" เพื่อเริ่ม (ระบบสร้างรายการชิ้นมาตรฐานให้)' : ' — ให้ช่างเพิ่มรุ่นและราคาก่อน'}
        </div>
      )}
      {catalog.data && groups.length > 0 && shown.length === 0 && (
        <div className="card p-8 text-center text-slate-500">ไม่พบ "{query}" — ลองพิมพ์แค่รุ่น เช่น 13 Pro</div>
      )}

      {shown.map((g) => {
        const open = isOpen(g.id);
        const outOfStock = g.parts.filter((p) => p.quantity <= 0).length;
        const unpriced = g.parts.filter((p) => p.replacePrice <= 0).length;
        return (
          <div key={g.id} className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-4 py-2.5">
              <button className="flex items-center gap-2 text-left" onClick={() => toggle(g.id)}>
                {open ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <span className="font-semibold text-slate-800">{g.name}</span>
                {g.general && <span className="badge-slate">ทั่วไป</span>}
                <span className="text-xs text-slate-500">{g.parts.length} รายการ
                  {outOfStock > 0 && <> · <span className="text-red-600">หมด {outOfStock}</span></>}
                  {canEdit && unpriced > 0 && <> · <span className="text-amber-700">ยังไม่ตั้งราคา {unpriced}</span></>}
                </span>
              </button>
              {canEdit && (
                <div className="flex gap-1">
                  <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setDialog({ kind: 'part', group: g })}><Plus className="h-3.5 w-3.5" /> เพิ่มชิ้น</button>
                  <button className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title="แก้ชื่อรุ่น" onClick={() => setDialog({ kind: 'group', group: g })}><Pencil className="h-4 w-4" /></button>
                  <button className="rounded p-1.5 text-red-600 hover:bg-red-50" title="ลบรุ่น (ต้องไม่เหลือของ)"
                          onClick={() => { if (window.confirm(`ลบรุ่น "${g.name}" ออกจากตาราง?\nใบงานซ่อมเก่ายังเห็นชื่ออะไหล่เดิม`)) remove.mutate({ kind: 'group', id: g.id }); }}>
                    <Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
            {open && g.note && <div className="border-b bg-amber-50/60 px-4 py-1.5 text-xs text-amber-800">{g.note}</div>}
            {open && (
              <div className="overflow-x-auto">
                <table className={`w-full text-sm ${canEdit ? 'min-w-[960px]' : 'min-w-[600px]'}`}>
                  <thead className="text-left text-xs text-slate-500">
                    <tr className="border-b">
                      <th className="px-4 py-2">อะไหล่ / เกรด</th>
                      {canEdit && <th className="px-3 py-2 text-right">ต้นทุน</th>}
                      <th className="px-3 py-2 text-right">ราคาอะไหล่</th>
                      <th className="px-3 py-2 text-right text-brand-700">ยอดรวม (บอกลูกค้า)</th>
                      {canEdit && <th className="px-3 py-2 text-right">กำไร/ชิ้น</th>}
                      <th className="px-3 py-2">รับประกัน</th>
                      <th className="px-3 py-2">สต็อก</th>
                      {canEdit && <th className="px-3 py-2 text-right">จัดการ</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {g.parts.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-400">ยังไม่มีอะไหล่{canEdit ? ' — กด "เพิ่มชิ้น"' : ''}</td></tr>
                    )}
                    {g.parts.map((p) => {
                      const stock = stockStatus(p.quantity);
                      const unpricedPart = p.replacePrice <= 0;
                      return (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{p.name}{p.grade && <span className="ml-1.5 badge-blue">{p.grade}</span>}</div>
                            {p.note && <div className="text-xs text-slate-500">{p.note}</div>}
                          </td>
                          {canEdit && <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{formatTHB(p.cost)}</td>}
                          <td className="px-3 py-2.5 text-right tabular-nums">{unpricedPart || p.partPrice <= 0 ? '—' : formatTHB(p.partPrice)}</td>
                          <td className="px-3 py-2.5 text-right">
                            {unpricedPart ? <span className="badge-amber">ยังไม่ตั้งราคา</span>
                              : <span className="text-base font-bold tabular-nums text-brand-700">{formatTHB(p.replacePrice)}</span>}
                          </td>
                          {canEdit && <td className={`px-3 py-2.5 text-right tabular-nums ${(p.profit ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{unpricedPart ? '—' : formatTHB(p.profit)}</td>}
                          <td className="px-3 py-2.5 text-xs">{p.warranty ? <span className="badge-green">{p.warranty}</span> : <span className="text-slate-400">ไม่ระบุ</span>}</td>
                          <td className="px-3 py-2.5"><span className={stock.cls}>{stock.text}</span></td>
                          {canEdit && (
                            <td className="px-3 py-2.5">
                              <div className="flex justify-end gap-0.5">
                                <button className="rounded px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50" title="รับอะไหล่เข้าสต็อก"
                                        onClick={() => setDialog({ kind: 'receive', group: g, part: p })}><PackagePlus className="inline h-4 w-4" /> รับเข้า</button>
                                <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100" title="ปรับยอดให้ตรงของจริง"
                                        onClick={() => setDialog({ kind: 'adjust', group: g, part: p })}><Scale className="h-4 w-4" /></button>
                                <button className="rounded p-1.5 text-blue-600 hover:bg-blue-50" title="แก้ราคา/ชื่อ"
                                        onClick={() => setDialog({ kind: 'part', group: g, part: p })}><Pencil className="h-4 w-4" /></button>
                                <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100" title="ประวัติสต็อก"
                                        onClick={() => setDialog({ kind: 'history', group: g, part: p })}><History className="h-4 w-4" /></button>
                                <button className="rounded p-1.5 text-red-600 hover:bg-red-50" title="ลบรายการ (ต้องไม่เหลือของ)"
                                        onClick={() => { if (window.confirm(`ลบ "${p.name}${p.grade ? ` (${p.grade})` : ''}" ของ ${g.name}?`)) remove.mutate({ kind: 'part', id: p.id }); }}>
                                  <Trash2 className="h-4 w-4" /></button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}

      {dialog?.kind === 'group' && <GroupModal group={dialog.group} groups={groups} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'part' && <PartModal group={dialog.group} part={dialog.part} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'receive' && <ReceiveModal part={dialog.part} groupName={dialog.group.name} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'adjust' && <AdjustModal part={dialog.part} groupName={dialog.group.name} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'history' && <HistoryModal part={dialog.part} groupName={dialog.group.name} onClose={() => setDialog(null)} />}
    </div>
  );
}

function HelpCard({ canEdit }: { canEdit: boolean }) {
  return (
    <div className="card space-y-3 border-brand-100 bg-brand-50/40 p-4 text-sm text-slate-700">
      <div className="font-semibold text-slate-800">ความหมายของแต่ละช่อง</div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {canEdit && <li><b>ต้นทุน</b> — ราคาที่ร้านซื้ออะไหล่มา ต่อ 1 ชิ้น (อัปเดตเป็นราคาล่าสุดตอน "รับเข้า") · พนักงานหน้าร้านไม่เห็น</li>}
        <li><b>ราคาอะไหล่</b> — ค่าตัวอะไหล่ที่คิดลูกค้า (ไม่แยกก็ได้)</li>
        <li><b className="text-brand-700">ยอดรวม</b> — ราคาเปลี่ยนทั้งหมด รวมค่าช่างแล้ว = <b>ราคาที่บอกลูกค้า</b></li>
        {canEdit && <li><b>กำไร/ชิ้น</b> — ยอดรวม − ต้นทุน คำนวณให้อัตโนมัติ (ติดลบ = ขาดทุน ตัวแดง)</li>}
        <li><b>รับประกัน</b> — ระยะประกันหลังเปลี่ยนชิ้นนั้น เช่น 3 เดือน / 1 ปี · แจ้งลูกค้าพร้อมราคา</li>
        <li><b>สต็อก</b> — จำนวนที่มีในร้าน · "หมด · ต้องสั่ง" = ต้องแจ้งลูกค้าว่ารอของ</li>
        <li><b>เกรด</b> — ชิ้นเดียวกันมีหลายเกรดได้ เช่น จอแท้ศูนย์ / จอ OEM แยกราคากันคนละแถว</li>
      </ul>
      {canEdit ? (
        <>
          <div className="font-semibold text-slate-800">ขั้นตอนใช้งาน (ช่าง)</div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>กด <b>เพิ่มรุ่น / หมวด</b> → ใส่ชื่อรุ่นให้ตรงกับที่หน้าร้านพิมพ์ในใบงาน (เช่น iPhone 13) → ระบบสร้างรายการ จอ แบต ลำโพง ฯลฯ ให้ หรือคัดลอกราคาจากรุ่นใกล้เคียง</li>
            <li>กด <Pencil className="inline h-3.5 w-3.5 text-blue-600" /> ที่แต่ละชิ้นเพื่อกรอก ต้นทุน / ราคาอะไหล่ / ยอดรวม / รับประกัน · ชิ้นที่ยังไม่กรอกจะขึ้น "ยังไม่ตั้งราคา"</li>
            <li>ซื้ออะไหล่มา → กด <b>รับเข้า</b> ใส่จำนวนและต้นทุนต่อชิ้น · ของไม่ตรง (นับใหม่/เสีย/หาย) → กด <Scale className="inline h-3.5 w-3.5" /> ปรับยอด พร้อมเหตุผล</li>
            <li>ตอนซ่อมเสร็จในหน้า <b>งานซ่อม</b> เลือกอะไหล่ที่ใช้ → สต็อกลดเอง และค่าซ่อมเติมให้ตามยอดรวม (แก้ได้) · ยกเลิกงาน = อะไหล่คืนสต็อกเอง</li>
            <li>ทุกการเปลี่ยนจำนวนดูย้อนหลังได้ที่ <History className="inline h-3.5 w-3.5" /> ประวัติ (ใคร เมื่อไหร่ งานไหน)</li>
          </ol>
        </>
      ) : (
        <p>ลูกค้าถามราคา → พิมพ์รุ่นในช่องค้นหา → บอก <b>ยอดรวม</b> และ <b>รับประกัน</b> ของชิ้นที่ต้องเปลี่ยน · ถ้าขึ้น "ยังไม่ตั้งราคา" ให้ถามช่างก่อนบอกลูกค้า</p>
      )}
    </div>
  );
}
