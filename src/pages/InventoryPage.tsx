import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Smartphone, X, ChevronRight, ChevronDown } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';
import { useBranchStore } from '@/stores/branchStore';
import { SerialsModal } from '@/components/SerialsModal';
import { formatNumber, formatDateTime } from '@/lib/format';
import type { SerializedItemResponse } from '@/types/api';

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  IN_STOCK: { text: 'อยู่ในสต็อก', cls: 'badge-green' },
  RESERVED: { text: 'จองแล้ว', cls: 'badge-amber' },
  SOLD: { text: 'ขายแล้ว', cls: 'bg-slate-200 text-slate-600 rounded-full px-2 py-0.5 text-xs font-medium' },
  IN_SERVICE: { text: 'ส่งซ่อม/เคลม', cls: 'badge-amber' },
  RETURNED: { text: 'คืนแล้ว', cls: 'bg-slate-200 text-slate-600 rounded-full px-2 py-0.5 text-xs font-medium' },
};

type ConditionFilter = '' | 'NEW' | 'SECOND_HAND';
type ViewMode = 'device' | 'variant';

const CONDITION_TH: Record<string, string> = {
  NEW: 'มือ 1', SECOND_HAND: 'มือ 2', LIKE_NEW: 'สภาพดี', REFURBISHED: 'รีเฟอร์บ', DEFECTIVE: 'ชำรุด',
};

export function InventoryPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('device');
  const [page, setPage] = useState(0);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [condition, setCondition] = useState<ConditionFilter>('');
  const [deviceStatus, setDeviceStatus] = useState('');
  const [deviceSearchInput, setDeviceSearchInput] = useState('');  // input ดิบ
  const [deviceQ, setDeviceQ] = useState('');                      // debounced → ส่ง query
  const [searchQuery, setSearchQuery] = useState('');
  const [foundDevice, setFoundDevice] = useState<SerializedItemResponse | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [serialsFor, setSerialsFor] = useState<{ variantId: string; productName: string; sku: string; highlightId?: string } | null>(null);

  // มุมมองรวมรุ่น — ดึงมาทั้งหมด (ร้านมี variant ไม่กี่สิบ) แล้ว group ตามชื่อรุ่นฝั่ง client
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', { lowStockOnly, condition }],
    enabled: viewMode === 'variant',
    queryFn: () => inventoryApi.list({ page: 0, size: 500, lowStockOnly, condition: condition || undefined }),
  });

  // debounce ค้นหาเครื่อง (IMEI/Serial/รหัส/รุ่น) — ค้นข้ามทุกสถานะรวมเครื่องที่ขายแล้ว
  useEffect(() => {
    const t = setTimeout(() => { setDeviceQ(deviceSearchInput.trim()); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [deviceSearchInput]);

  // มุมมองรายเครื่อง (flat ทุกรุ่น) — filter ตาม condition (chips) + status + คำค้น
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ['inventory-serials', { page, condition, deviceStatus, deviceQ, activeBranchId }],
    enabled: viewMode === 'device',
    queryFn: () => inventoryApi.listSerials({
      page, size: 50,
      condition: condition || undefined,
      status: deviceStatus || undefined,
      branchId: activeBranchId || undefined,   // กรองตามสาขาที่เลือก (Phase 2A)
      q: deviceQ || undefined,
    }),
  });

  const { data: summary } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: () => inventoryApi.summary(),
  });

  const pickCondition = (c: ConditionFilter) => { setCondition(c); setPage(0); };
  const pickView = (v: ViewMode) => { setViewMode(v); setPage(0); };

  // group variant ตามชื่อรุ่น (iPhone 13 ที่กระจายหลาย variant → รวมเป็นหมวดเดียว)
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const groups = useMemo(() => {
    const rows = data?.content ?? [];
    const map = new Map<string, { name: string; rows: typeof rows; quantity: number; reservedQty: number; availableQty: number; lowStock: boolean }>();
    for (const r of rows) {
      const key = (r.productName ?? r.sku).trim().toLowerCase();
      const g = map.get(key) ?? { name: r.productName ?? r.sku, rows: [], quantity: 0, reservedQty: 0, availableQty: 0, lowStock: false };
      g.rows.push(r);
      g.quantity += r.quantity;
      g.reservedQty += r.reservedQty;
      g.availableQty += r.availableQty;
      g.lowStock = g.lowStock || r.lowStock;
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const handleLookup = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setNotFound(null);
    try {
      const result = await inventoryApi.lookupSerial(q);
      setFoundDevice(result);
    } catch {
      setFoundDevice(null);
      setNotFound(q);
    }
  };

  const clearSearch = () => { setFoundDevice(null); setNotFound(null); setSearchQuery(''); };

  /** ชื่อรุ่นจากตารางสต็อก (match ด้วย variantId) — ใช้เปิด SerialsModal ของเครื่องที่เจอ */
  const productNameOf = (variantId: string) =>
    data?.content.find((r) => r.variantId === variantId)?.productName ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="text-sm text-slate-500">รายการสต็อกทั้งหมด</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={lowStockOnly}
            onChange={(e) => { setLowStockOnly(e.target.checked); setPage(0); }}
          />
          แสดงเฉพาะของน้อย
        </label>
      </div>

      {/* IMEI/SN Scanner */}
      <div className="card">
        <div className="card-body">
          <label className="mb-1 block text-sm font-medium">สแกน/ค้นหา IMEI หรือ Serial Number</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="input"
              placeholder="กรอกหรือสแกน IMEI / SN"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(); }}
            />
            <button onClick={handleLookup} className="btn-primary">
              <Search className="h-4 w-4" /> ค้นหา
            </button>
          </div>

          {/* ผลค้นหา = การ์ดเครื่อง (รายเครื่อง ไม่ใช่หมวดรวม) */}
          {foundDevice && (() => {
            const st = STATUS_LABEL[foundDevice.status] ?? { text: foundDevice.status, cls: 'badge-green' };
            const spec = [foundDevice.deviceColor, foundDevice.deviceStorage].filter(Boolean).join(' / ');
            const pName = productNameOf(foundDevice.variantId);
            return (
              <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700">
                      <Smartphone className="h-5 w-5" />
                    </div>
                    <div className="text-sm">
                      <div className="font-semibold text-slate-800">
                        {pName ?? foundDevice.sku}{spec && <span className="font-normal text-slate-500"> · {spec}</span>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600">
                        {foundDevice.stockCode && <span>รหัส: <span className="font-mono font-semibold text-slate-800">{foundDevice.stockCode}</span></span>}
                        <span>IMEI: <span className="font-mono">{foundDevice.imei ?? '-'}</span></span>
                        <span>SN: <span className="font-mono">{foundDevice.serialNumber}</span></span>
                      </div>
                      <div className="mt-1.5">
                        <span className={st.cls}>{st.text}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={clearSearch} className="rounded p-1 text-slate-400 hover:bg-slate-100" title="ล้าง">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    className="btn-primary text-sm"
                    onClick={() => setSerialsFor({
                      variantId: foundDevice.variantId,
                      productName: pName ?? foundDevice.sku,
                      sku: foundDevice.sku,
                      highlightId: foundDevice.id,
                    })}>
                    <Smartphone className="h-4 w-4" /> เปิดดูเครื่องนี้
                  </button>
                </div>
              </div>
            );
          })()}
          {notFound && (
            <div className="mt-3 flex items-center justify-between rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <span>ไม่พบเครื่องที่ตรงกับ "{notFound}" — ตรวจ IMEI/Serial อีกครั้ง</span>
              <button onClick={clearSearch} className="rounded p-1 text-amber-500 hover:bg-amber-100"><X className="h-4 w-4" /></button>
            </div>
          )}
        </div>
      </div>

      {/* สรุปจำนวนเครื่องพร้อมขาย + filter มือ1/มือ2 (กดเพื่อกรองตาราง) */}
      <div className="grid grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => pickCondition('')}
          className={`rounded-lg border p-3 text-left transition-colors ${
            condition === '' ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-300' : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}>
          <div className="text-xs text-slate-500">พร้อมขายทั้งหมด</div>
          <div className="mt-0.5 text-2xl font-bold text-slate-800">
            {summary ? formatNumber(summary.totalAvailable) : '—'} <span className="text-sm font-normal text-slate-400">เครื่อง</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => pickCondition('NEW')}
          className={`rounded-lg border p-3 text-left transition-colors ${
            condition === 'NEW' ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300' : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}>
          <div className="text-xs text-slate-500">มือ 1 (ใหม่)</div>
          <div className="mt-0.5 text-2xl font-bold text-emerald-700">
            {summary ? formatNumber(summary.newAvailable) : '—'} <span className="text-sm font-normal text-slate-400">เครื่อง</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => pickCondition('SECOND_HAND')}
          className={`rounded-lg border p-3 text-left transition-colors ${
            condition === 'SECOND_HAND' ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-300' : 'border-slate-200 bg-white hover:bg-slate-50'
          }`}>
          <div className="text-xs text-slate-500">มือ 2 (มือสอง)</div>
          <div className="mt-0.5 text-2xl font-bold text-amber-700">
            {summary ? formatNumber(summary.secondHandAvailable) : '—'} <span className="text-sm font-normal text-slate-400">เครื่อง</span>
          </div>
        </button>
      </div>

      {/* View toggle: รายเครื่อง / รวมรุ่น */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => pickView('device')}
          className={`rounded-md border px-4 py-1.5 text-sm font-medium ${
            viewMode === 'device' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'
          }`}>
          📱 รายเครื่อง (ทีละตัว)
        </button>
        <button
          type="button"
          onClick={() => pickView('variant')}
          className={`rounded-md border px-4 py-1.5 text-sm font-medium ${
            viewMode === 'variant' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'
          }`}>
          📦 รวมรุ่น (สรุปสต็อก)
        </button>
      </div>

      {/* มุมมองรายเครื่อง — เครื่องทีละตัว (รหัส DD + IMEI + สถานะ) */}
      {viewMode === 'device' && (
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-2 text-sm">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="input w-64 pl-8"
              placeholder="ค้นหา IMEI / Serial / รหัส / รุ่น (รวมที่ขายแล้ว)"
              value={deviceSearchInput}
              onChange={(e) => setDeviceSearchInput(e.target.value)}
            />
          </div>
          <span className="text-slate-600">
            {condition ? <>กรองเฉพาะ <span className="font-semibold">{condition === 'NEW' ? 'มือ 1' : 'มือ 2'}</span> · </> : null}
            {devices ? `${formatNumber(devices.totalElements)} เครื่อง` : ''}
          </span>
          <select className="input w-44" value={deviceStatus}
                  onChange={(e) => { setDeviceStatus(e.target.value); setPage(0); }}>
            <option value="">ทุกสถานะ</option>
            <option value="IN_STOCK">พร้อมขาย</option>
            <option value="RESERVED">จองแล้ว</option>
            <option value="SOLD">ขายแล้ว</option>
            <option value="DEFECTIVE">ชำรุด/ซ่อม</option>
            <option value="RETURNED">คืนแล้ว</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">รหัสสินค้า</th>
                <th className="px-5 py-2.5">ชื่อรุ่น</th>
                <th className="px-5 py-2.5">สี / ความจุ</th>
                <th className="px-5 py-2.5">IMEI / SN</th>
                <th className="px-5 py-2.5">สภาพ</th>
                <th className="px-5 py-2.5">สถานะ</th>
                <th className="px-5 py-2.5">รับเข้า</th>
                <th className="px-5 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devicesLoading && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {devices?.content.map((s) => {
                const st = STATUS_LABEL[s.status] ?? { text: s.status, cls: 'badge-green' };
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <span className="rounded bg-brand-100 px-1.5 font-mono text-xs font-semibold text-brand-700">
                        {s.stockCode ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium">
                      {s.productName ?? s.sku}
                      {s.branchName && (
                        <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-500">
                          🏪 {s.branchName}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {[s.deviceColor, s.deviceStorage].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td className="px-5 py-3">
                      <div className="font-mono text-xs">{s.imei ?? '-'}</div>
                      <div className="font-mono text-xs text-slate-400">{s.serialNumber}</div>
                    </td>
                    <td className="px-5 py-3 text-xs">{CONDITION_TH[s.condition] ?? s.condition}</td>
                    <td className="px-5 py-3"><span className={st.cls}>{st.text}</span></td>
                    <td className="px-5 py-3 text-xs text-slate-500">{formatDateTime(s.receivedAt)}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        className="rounded p-1.5 text-brand-600 hover:bg-brand-50"
                        title="ดูรุ่นนี้ + จัดการเครื่อง"
                        onClick={() => setSerialsFor({
                          variantId: s.variantId, productName: s.productName ?? s.sku, sku: s.sku, highlightId: s.id,
                        })}>
                        <Smartphone className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {devices && devices.content.length === 0 && (
                <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-400">ไม่พบเครื่อง</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {devices && devices.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm">
            <div>หน้า {devices.page + 1} / {devices.totalPages} ({formatNumber(devices.totalElements)} เครื่อง)</div>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</button>
              <button className="btn-secondary" disabled={devices.last} onClick={() => setPage((p) => p + 1)}>ถัดไป</button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Table — รวมรุ่น (variant aggregate) */}
      {viewMode === 'variant' && (
      <div className="card">
        {condition && (
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-2 text-sm text-slate-600">
            <span>กรองเฉพาะ <span className="font-semibold">{condition === 'NEW' ? 'มือ 1 (ใหม่)' : 'มือ 2 (มือสอง)'}</span> · นับเฉพาะเครื่องพร้อมขาย</span>
            <button onClick={() => pickCondition('')} className="text-brand-600 hover:underline">ดูทั้งหมด</button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">รุ่น / รหัส</th>
                <th className="px-5 py-2.5">รายละเอียด</th>
                <th className="px-5 py-2.5 text-right">Qty</th>
                <th className="px-5 py-2.5 text-right">จอง</th>
                <th className="px-5 py-2.5 text-right">พร้อมขาย</th>
                <th className="px-5 py-2.5">สถานะ</th>
                <th className="px-5 py-2.5 text-right">เครื่อง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {groups.map((g) => {
                const key = g.name.trim().toLowerCase();
                const isOpen = expanded.has(key) || g.rows.length === 1;
                const single = g.rows.length === 1;
                return (
                  <Fragment key={key}>
                    {/* แถวหัวกลุ่ม (รุ่น) — รวม qty ของทุก variant ในรุ่นนี้ */}
                    <tr className={`hover:bg-slate-50 ${single ? '' : 'cursor-pointer bg-slate-50/40'}`}
                        onClick={() => !single && toggleGroup(key)}>
                      <td className="px-5 py-3 font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          {!single && (isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />)}
                          {single && <span className="inline-block w-4" />}
                          {g.name}
                          {!single && <span className="rounded-full bg-slate-200 px-1.5 text-[11px] font-medium text-slate-600">{g.rows.length} รหัส</span>}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-500">{single ? (g.rows[0].sku) : <span className="text-xs">รวมทุกรหัส</span>}</td>
                      <td className="px-5 py-3 text-right font-bold">{formatNumber(g.quantity)}</td>
                      <td className="px-5 py-3 text-right text-slate-500">{formatNumber(g.reservedQty)}</td>
                      <td className="px-5 py-3 text-right text-slate-700">{formatNumber(g.availableQty)}</td>
                      <td className="px-5 py-3">
                        {g.lowStock ? <span className="badge-amber">ของน้อย</span> : <span className="badge-green">OK</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {single && (
                          <button
                            className="rounded p-1.5 text-brand-600 hover:bg-brand-50"
                            title="ดูเครื่องทีละชิ้น (IMEI) + ส่งซ่อม/เคลม"
                            onClick={(e) => { e.stopPropagation(); setSerialsFor({ variantId: g.rows[0].variantId, productName: g.rows[0].productName, sku: g.rows[0].sku }); }}>
                            <Smartphone className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {/* แถวย่อย variant (เมื่อขยาย) */}
                    {!single && isOpen && g.rows.map((row) => (
                      <tr key={row.variantId} className="hover:bg-slate-50">
                        <td className="px-5 py-2 pl-12 font-mono text-xs text-slate-600">{row.sku}</td>
                        <td className="px-5 py-2 text-slate-600">{[row.color, row.storage].filter(Boolean).join(' / ') || '-'}</td>
                        <td className="px-5 py-2 text-right">{formatNumber(row.quantity)}</td>
                        <td className="px-5 py-2 text-right text-slate-500">{formatNumber(row.reservedQty)}</td>
                        <td className="px-5 py-2 text-right text-slate-700">{formatNumber(row.availableQty)}</td>
                        <td className="px-5 py-2">
                          {row.lowStock ? <span className="badge-amber">ของน้อย</span> : <span className="badge-green">OK</span>}
                        </td>
                        <td className="px-5 py-2 text-right">
                          <button
                            className="rounded p-1.5 text-brand-600 hover:bg-brand-50"
                            title="ดูเครื่องทีละชิ้น (IMEI) + ส่งซ่อม/เคลม"
                            onClick={() => setSerialsFor({ variantId: row.variantId, productName: row.productName, sku: row.sku })}>
                            <Smartphone className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {data && groups.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-8 text-center text-slate-400">ไม่พบข้อมูล</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {serialsFor && (
        <SerialsModal
          variantId={serialsFor.variantId}
          productName={serialsFor.productName}
          sku={serialsFor.sku}
          highlightId={serialsFor.highlightId}
          onClose={() => setSerialsFor(null)}
        />
      )}
    </div>
  );
}
