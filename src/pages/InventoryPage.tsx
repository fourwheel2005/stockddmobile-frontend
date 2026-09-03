import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cable, ChevronDown, ChevronRight, Eye, Package, PlugZap, Search, Smartphone, X, Plug, Store, TriangleAlert } from 'lucide-react';
import { inventoryApi, type InventoryStockGroup } from '@/api/inventory';
import { useBranchStore } from '@/stores/branchStore';
import { useAuthStore } from '@/stores/authStore';
import { SerialsModal } from '@/components/SerialsModal';
import { StockDeviceListModal, type StockCheckCondition } from '@/components/inventory/StockDeviceListModal';
import { formatNumber, formatDateTime } from '@/lib/format';
import type { SerializedItemResponse } from '@/types/api';

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  IN_STOCK: { text: 'อยู่ในสต็อก', cls: 'badge-green' },
  PENDING_INTAKE: { text: 'รอลงสต็อก', cls: 'badge-amber' },
  RESERVED: { text: 'จองแล้ว', cls: 'badge-amber' },
  SOLD: { text: 'ขายแล้ว', cls: 'bg-slate-200 text-slate-600 rounded-full px-2 py-0.5 text-xs font-medium' },
  IN_SERVICE: { text: 'ส่งซ่อม/เคลม', cls: 'badge-amber' },
  RETURNED: { text: 'คืนแล้ว', cls: 'bg-slate-200 text-slate-600 rounded-full px-2 py-0.5 text-xs font-medium' },
};

type ConditionFilter = '' | 'NEW' | 'SECOND_HAND';
type ViewMode = 'device' | 'variant' | 'accessory';
type AccessoryGroup = Extract<InventoryStockGroup, 'ACCESSORY' | 'CHARGER_HEAD' | 'CHARGING_CABLE' | 'OTHER_ACCESSORY'>;

const CONDITION_TH: Record<string, string> = {
  NEW: 'มือ 1', SECOND_HAND: 'มือ 2', LIKE_NEW: 'สภาพดี', REFURBISHED: 'รีเฟอร์บ', DEFECTIVE: 'ชำรุด',
};

export function InventoryPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('device');
  const [accessoryGroup, setAccessoryGroup] = useState<AccessoryGroup>('ACCESSORY');
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
  const [stockView, setStockView] = useState<StockCheckCondition | null>(null);
  const activeBranchId = useBranchStore((s) => s.activeBranchId);

  // มุมมองรวมรุ่น — ดึงมาทั้งหมด (ร้านมี variant ไม่กี่สิบ) แล้ว group ตามชื่อรุ่นฝั่ง client
  const { data, isLoading } = useQuery({
    queryKey: ['inventory', { lowStockOnly, condition, viewMode, accessoryGroup, activeBranchId }],
    enabled: viewMode !== 'device',
    queryFn: () => inventoryApi.list({
      page: 0, size: 500, lowStockOnly,
      condition: viewMode === 'variant' ? condition || undefined : undefined,
      stockGroup: viewMode === 'accessory' ? accessoryGroup : 'DEVICE',
      branchId: activeBranchId || undefined,
    }),
  });

  // debounce ค้นหาเครื่อง (IMEI/Serial/รหัส/รุ่น) — ค้นข้ามทุกสถานะรวมเครื่องที่ขายแล้ว
  useEffect(() => {
    const t = setTimeout(() => { setDeviceQ(deviceSearchInput.trim()); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [deviceSearchInput]);

  // มุมมองรายเครื่อง (flat ทุกรุ่น) — filter ตาม condition (chips) + status + คำค้น
  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ['inventory-serials', { page, condition, deviceStatus, deviceQ, activeBranchId }],
    enabled: viewMode === 'device',
    queryFn: () => inventoryApi.listSerials({
      page, size: 50,
      condition: condition || undefined,
      status: deviceStatus || undefined,
      branchId: activeBranchId || undefined,   // กรองตามสาขาที่เลือก (Phase 2A)
      stockGroup: 'DEVICE',
      q: deviceQ || undefined,
    }),
  });

  const { data: summary } = useQuery({
    queryKey: ['inventory-summary', activeBranchId],
    queryFn: () => inventoryApi.summary(activeBranchId || undefined),
  });

  // F-12 (FIX-135): reconciliation — เตือน manager/admin เมื่อยอด inventory ไม่ตรงจำนวน IMEI จริง (read-only)
  const canReconcile = useAuthStore((s) => s.hasRole('ADMIN', 'MANAGER'));
  const { data: drift } = useQuery({
    queryKey: ['inventory-reconciliation'],
    enabled: canReconcile,
    queryFn: () => inventoryApi.reconciliation(),
  });

  const pickCondition = (c: ConditionFilter) => {
    setCondition(c); setPage(0);
    if (viewMode === 'accessory') setViewMode('device');
    if (viewMode === 'device' || viewMode === 'accessory') setDeviceStatus('IN_STOCK');
  };
  const pickAccessory = (group: AccessoryGroup) => {
    setAccessoryGroup(group); setCondition(''); setPage(0); setViewMode('accessory');
  };
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
    <div className="space-y-4">
      {/* F-12: เตือนสต็อกเพี้ยน (serialized SKU ยอดไม่ตรงจำนวน IMEI จริง) — เห็นเฉพาะ manager/admin */}
      {drift && drift.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <div className="font-semibold text-amber-800">
            <TriangleAlert className="inline h-3.5 w-3.5 align-[-2px]" /> พบสต็อกไม่ตรงจำนวนเครื่องจริง {drift.length} SKU
          </div>
          <p className="mt-0.5 text-xs text-amber-700">
            ยอดในระบบไม่เท่ากับจำนวน IMEI ที่พร้อมขายจริง — ตรวจและแก้ผ่านการรับเข้า/ลบเครื่อง/ส่งซ่อม (ระบบไม่แก้อัตโนมัติ)
          </p>
          <div className="mt-2 space-y-1">
            {drift.slice(0, 8).map((d) => (
              <div key={d.variantId} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono text-slate-700">{d.sku}</span>
                <span className="truncate text-slate-500">{d.productName}</span>
                <span className="whitespace-nowrap text-amber-800">
                  ระบบ {formatNumber(d.inventoryQty)} · จริง {formatNumber(d.actualInStock)}
                  <span className="ml-1 font-semibold">({d.diff > 0 ? '+' : ''}{d.diff})</span>
                </span>
              </div>
            ))}
            {drift.length > 8 && (
              <div className="text-xs text-amber-700">…และอีก {drift.length - 8} SKU</div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="text-sm text-slate-500">รายการสต็อกทั้งหมด</p>
        </div>
        {/* IMEI/SN Scanner — compact inline bar (secondary action, ไม่กินพื้นที่แนวตั้ง) */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="input pl-9"
              placeholder="สแกน / ค้นหา IMEI หรือ Serial"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLookup(); }}
            />
          </div>
          <button onClick={handleLookup} className="btn-primary shrink-0">
            <Search className="h-4 w-4" /> ค้นหา
          </button>
        </div>
      </div>

      {/* ผลค้นหา IMEI/SN — แสดงเฉพาะเมื่อมีผล (ไม่มีการ์ดว่างกินที่) */}
      {(foundDevice || notFound) && (
        <div className="card">
          <div className="p-4">

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
      )}

      {/* สรุปพร้อมขาย — เครื่องและ accessory เป็นคนละยอด/คนละหน่วย */}
      <section aria-label="สรุปเครื่องพร้อมขาย">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Smartphone className="h-4 w-4 text-brand-600" /> เครื่อง — ไม่รวมอุปกรณ์เสริม
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryButton label="พร้อมขายทั้งหมด" value={summary?.totalAvailable} unit="เครื่อง"
                         active={viewMode !== 'accessory' && condition === ''} tone="brand"
                         onClick={() => pickCondition('')} />
          <SummaryButton label="มือ 1 (ใหม่)" value={summary?.newAvailable} unit="เครื่อง"
                         active={viewMode !== 'accessory' && condition === 'NEW'} tone="emerald"
                         onClick={() => pickCondition('NEW')} onView={() => setStockView('NEW')} />
          <SummaryButton label="มือ 2 (มือสอง)" value={summary?.secondHandAvailable} unit="เครื่อง"
                         active={viewMode !== 'accessory' && condition === 'SECOND_HAND'} tone="amber"
                         onClick={() => pickCondition('SECOND_HAND')} onView={() => setStockView('SECOND_HAND')} />
        </div>
      </section>

      <section aria-label="สรุปอุปกรณ์เสริมพร้อมขาย">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-slate-700">
          <span className="flex items-center gap-2"><PlugZap className="h-4 w-4 text-sky-600" /> อุปกรณ์เสริม — รวม {summary ? formatNumber(summary.totalAccessoriesAvailable) : '—'} ชิ้น</span>
          {activeBranchId && summary?.accessoryInventoryGlobal && (
            <span className="rounded bg-amber-100 px-2 py-1 text-[10px] font-medium text-amber-800">
              แบบนับจำนวนเป็นยอดรวมทุกสาขา · แบบมี Serial กรองตามสาขา
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryButton label="หัวชาร์จ" value={summary?.chargerHeadsAvailable} unit="หัว"
                         icon={<PlugZap className="h-4 w-4" />} active={viewMode === 'accessory' && accessoryGroup === 'CHARGER_HEAD'} tone="sky"
                         onClick={() => pickAccessory('CHARGER_HEAD')} />
          <SummaryButton label="สายชาร์จ" value={summary?.chargingCablesAvailable} unit="เส้น"
                         icon={<Cable className="h-4 w-4" />} active={viewMode === 'accessory' && accessoryGroup === 'CHARGING_CABLE'} tone="violet"
                         onClick={() => pickAccessory('CHARGING_CABLE')} />
          <SummaryButton label="อุปกรณ์เสริมอื่น" value={summary?.otherAccessoriesAvailable} unit="ชิ้น"
                         icon={<Package className="h-4 w-4" />} active={viewMode === 'accessory' && accessoryGroup === 'OTHER_ACCESSORY'} tone="slate"
                         onClick={() => pickAccessory('OTHER_ACCESSORY')} />
        </div>
      </section>

      {/* View toggle: เครื่องรายตัว / เครื่องรวมรุ่น / accessory */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => pickView('device')}
          className={`rounded-md border px-4 py-1.5 text-sm font-medium ${
            viewMode === 'device' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'
          }`}>
          <Smartphone className="inline h-4 w-4 align-[-2px]" /> รายเครื่อง (ทีละตัว)
        </button>
        <button
          type="button"
          onClick={() => pickView('variant')}
          className={`rounded-md border px-4 py-1.5 text-sm font-medium ${
            viewMode === 'variant' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'
          }`}>
          <Package className="inline h-4 w-4 align-[-2px]" /> รวมรุ่น (สรุปสต็อก)
        </button>
        <button
          type="button"
          onClick={() => pickAccessory('ACCESSORY')}
          className={`rounded-md border px-4 py-1.5 text-sm font-medium ${
            viewMode === 'accessory' ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 hover:bg-slate-50'
          }`}>
          <Plug className="inline h-4 w-4 align-[-2px]" /> อุปกรณ์เสริม
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
                          <Store className="inline h-4 w-4 align-[-2px]" /> {s.branchName}
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

      {/* Table — เครื่องรวมรุ่น หรือ accessory แยกประเภท */}
      {(viewMode === 'variant' || viewMode === 'accessory') && (
      <div className="card">
        {viewMode === 'variant' && condition && (
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-2 text-sm text-slate-600">
            <span>กรองเฉพาะ <span className="font-semibold">{condition === 'NEW' ? 'มือ 1 (ใหม่)' : 'มือ 2 (มือสอง)'}</span> · นับเฉพาะเครื่องพร้อมขาย</span>
            <button onClick={() => pickCondition('')} className="text-brand-600 hover:underline">ดูทั้งหมด</button>
          </div>
        )}
        {viewMode === 'accessory' && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-2 text-sm text-slate-600">
            <span>แสดง <strong>{accessoryGroupLabel(accessoryGroup)}</strong> แยกจากยอดเครื่อง</span>
            {accessoryGroup !== 'ACCESSORY' && (
              <button onClick={() => setAccessoryGroup('ACCESSORY')} className="text-brand-600 hover:underline">ดู Accessory ทั้งหมด</button>
            )}
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
                <th className="px-5 py-2.5 text-right">{viewMode === 'accessory' ? 'Serial' : 'เครื่อง'}</th>
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
                        {single && g.rows[0].serialized && (
                          <button
                            className="rounded p-1.5 text-brand-600 hover:bg-brand-50"
                            title={viewMode === 'accessory' ? 'ดูอุปกรณ์ที่มี Serial' : 'ดูเครื่องทีละชิ้น (IMEI) + ส่งซ่อม/เคลม'}
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
                          {row.serialized && <button
                            className="rounded p-1.5 text-brand-600 hover:bg-brand-50"
                            title={viewMode === 'accessory' ? 'ดูอุปกรณ์ที่มี Serial' : 'ดูเครื่องทีละชิ้น (IMEI) + ส่งซ่อม/เคลม'}
                            onClick={() => setSerialsFor({ variantId: row.variantId, productName: row.productName, sku: row.sku })}>
                            <Smartphone className="h-4 w-4" />
                          </button>}
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
      {stockView && (
        <StockDeviceListModal
          condition={stockView}
          scope="READY"
          branchId={activeBranchId ?? undefined}
          expectedTotal={stockView === 'NEW' ? summary?.newAvailable : summary?.secondHandAvailable}
          onClose={() => setStockView(null)}
        />
      )}
    </div>
  );
}

function SummaryButton({ label, value, unit, active, tone, onClick, onView, icon }: {
  label: string;
  value?: number;
  unit: string;
  active: boolean;
  tone: 'brand' | 'emerald' | 'amber' | 'sky' | 'violet' | 'slate';
  onClick: () => void;
  onView?: () => void;
  icon?: React.ReactNode;
}) {
  const colors = {
    brand: ['border-brand-400 bg-brand-50 ring-brand-300', 'text-slate-800'],
    emerald: ['border-emerald-400 bg-emerald-50 ring-emerald-300', 'text-emerald-700'],
    amber: ['border-amber-400 bg-amber-50 ring-amber-300', 'text-amber-700'],
    sky: ['border-sky-400 bg-sky-50 ring-sky-300', 'text-sky-700'],
    violet: ['border-violet-400 bg-violet-50 ring-violet-300', 'text-violet-700'],
    slate: ['border-slate-400 bg-slate-50 ring-slate-300', 'text-slate-700'],
  }[tone];
  return (
    <div className={`overflow-hidden rounded-lg border transition-colors ${active
      ? `${colors[0]} ring-1`
      : 'border-slate-200 bg-white'}`}>
      <button type="button" onClick={onClick} className="w-full p-3 text-left hover:bg-slate-50/70">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">{icon}{label}</div>
        <div className={`mt-0.5 text-2xl font-bold ${colors[1]}`}>
          {value == null ? '—' : formatNumber(value)} <span className="text-sm font-normal text-slate-400">{unit}</span>
        </div>
      </button>
      {onView && (
        <button type="button" onClick={onView}
                className="flex w-full items-center justify-center gap-1.5 border-t border-current/10 bg-white/60 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-white">
          <Eye className="h-3.5 w-3.5" /> ดูว่าเหลือเครื่องไหนบ้าง
        </button>
      )}
    </div>
  );
}

function accessoryGroupLabel(group: AccessoryGroup) {
  return {
    ACCESSORY: 'Accessory ทั้งหมด',
    CHARGER_HEAD: 'หัวชาร์จ',
    CHARGING_CABLE: 'สายชาร์จ',
    OTHER_ACCESSORY: 'อุปกรณ์เสริมอื่น',
  }[group];
}
