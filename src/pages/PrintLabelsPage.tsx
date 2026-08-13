import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Printer, Tag, CheckSquare, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import { posApi } from '@/api/pos';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import { LabelsPrintView, type LabelItem } from '@/components/LabelsPrintView';
import { formatTHB } from '@/lib/format';
import { formatLabelWarrantyExpire } from '@/lib/tspl/deviceLabel';

/**
 * Lets staff select IMEIs (or SKUs) from inventory and print barcode labels
 * onto A4 paper (24-up). Replaces external barcode generator websites.
 */
export function PrintLabelsPage() {
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copies, setCopies] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['in-stock-items', q],
    queryFn: () => posApi.inStockItems({ q: q || undefined, size: 100 }),
  });

  const items = data?.content ?? [];

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(items.map((i) => i.id)));
  const clearAll = () => setSelected(new Set());

  const labelItems: LabelItem[] = useMemo(() =>
    items
      .filter((i) => selected.has(i.id))
      .map((i) => ({
        code: i.imei || i.serialNumber,
        productName: i.productName,
        detail: [i.color, i.storage].filter(Boolean).join(' / ') || undefined,
        price: formatTHB(i.sellingPrice),
        warranty: formatLabelWarrantyExpire(i.warrantyExpire) ?? undefined,
      })),
    [items, selected]
  );

  const handlePrint = () => {
    if (labelItems.length === 0) {
      toast.error('เลือกอย่างน้อย 1 รายการ');
      return;
    }
    setTimeout(() => window.print(), 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 page-title">
            <Tag className="h-6 w-6 text-brand-600" /> พิมพ์ Label / Barcode
          </h1>
          <p className="text-sm text-slate-500">
            สร้าง barcode label ภายในระบบ — ปริ้นติดกล่องสินค้าหรือชั้นวาง
            (รองรับ A4 24 ใบ/แผ่น)
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="card">
        <div className="card-body space-y-3">
          <div className="flex gap-2">
            <input className="input flex-1" placeholder="ค้นหา IMEI / SKU / ชื่อสินค้า"
                   value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn-secondary" onClick={selectAll}>
              <CheckSquare className="h-4 w-4" /> เลือกทั้งหมด
            </button>
            <button className="btn-secondary" onClick={clearAll}>
              <Square className="h-4 w-4" /> ล้าง
            </button>
          </div>

          <div className="flex items-center gap-4">
            <label className="text-sm">
              จำนวนชุดที่พิมพ์ต่อ label:
              <input type="number" min={1} max={10} className="input ml-2 inline-block w-20"
                     value={copies} onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <div className="ml-auto text-sm">
              เลือกไว้ <strong className="text-lg text-brand-700">{selected.size}</strong> /
              จะพิมพ์ <strong className="text-lg text-emerald-700">{selected.size * copies}</strong> ใบ
            </div>
            <button
              className="btn-primary bg-emerald-600 hover:bg-emerald-700"
              onClick={handlePrint}
              disabled={selected.size === 0}>
              <Printer className="h-4 w-4" /> พิมพ์ {selected.size * copies} ใบ
            </button>
          </div>
        </div>
      </div>

      {/* Items table with preview */}
      <div className="card">
        <div className="card-header">เลือกรายการที่จะพิมพ์ ({items.length} ตัวในสต็อก)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2.5 w-10"></th>
                <th className="px-4 py-2.5">IMEI / SN</th>
                <th className="px-4 py-2.5">สินค้า</th>
                <th className="px-4 py-2.5 text-right">ราคา</th>
                <th className="px-4 py-2.5">Preview Barcode</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">กำลังโหลด...</td></tr>
              )}
              {items.map((it) => {
                const code = it.imei || it.serialNumber;
                return (
                  <tr key={it.id}
                      onClick={() => toggle(it.id)}
                      className={`cursor-pointer hover:bg-slate-50
                                  ${selected.has(it.id) ? 'bg-emerald-50' : ''}`}>
                    <td className="px-4 py-2 text-center">
                      <input type="checkbox" checked={selected.has(it.id)}
                             onChange={() => toggle(it.id)}
                             onClick={(e) => e.stopPropagation()} />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{code}</td>
                    <td className="px-4 py-2">
                      <div>{it.productName}</div>
                      <div className="text-xs text-slate-500">
                        {[it.color, it.storage].filter(Boolean).join(' / ')}
                      </div>
                      {it.warrantyExpire && (
                        <div className="text-xs text-sky-700">{formatLabelWarrantyExpire(it.warrantyExpire)}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">{formatTHB(it.sellingPrice)}</td>
                    <td className="px-4 py-2">
                      <BarcodeDisplay value={code} height={28} width={1} fontSize={9} />
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && !isLoading && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                  ไม่มีเครื่องในสต็อก — ทำ Inbound ก่อน
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hidden print area */}
      <LabelsPrintView items={labelItems} copies={copies} />
    </div>
  );
}
