import { useState } from 'react';
import { ShieldCheck, Search, CheckCircle2, XCircle, Calendar, Package, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import { warrantyApi } from '@/api/warranty';
import { extractErrorMessage } from '@/api/client';
import { BarcodeDisplay } from '@/components/BarcodeDisplay';
import { LabelsPrintView } from '@/components/LabelsPrintView';
import { formatTHB, formatDateTime, formatDate } from '@/lib/format';
import type { WarrantyLookup } from '@/types/api';

export function WarrantyPage() {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<WarrantyLookup | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const r = await warrantyApi.lookup(query.trim());
      setResult(r);
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <ShieldCheck className="h-6 w-6 text-brand-600" /> ตรวจสอบประกัน (Warranty Lookup)
        </h1>
        <p className="text-sm text-slate-500">
          ค้นหาด้วย IMEI หรือ Serial Number เพื่อดูข้อมูลประกันของเครื่อง
        </p>
      </div>

      <form onSubmit={handleSearch} className="card">
        <div className="card-body">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                type="text"
                className="input pl-9"
                placeholder="กรอก IMEI 15 หลัก หรือ Serial Number"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'กำลังค้นหา...' : 'ค้นหา'}
            </button>
          </div>
        </div>
      </form>

      {result && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Package className="h-4 w-4 text-brand-600" /> ผลการค้นหา
            </span>
            {result.isWarrantyActive === true && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" /> อยู่ในประกัน
              </span>
            )}
            {result.isWarrantyActive === false && (
              <span className="flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
                <XCircle className="h-3.5 w-3.5" /> หมดประกันแล้ว
              </span>
            )}
            {result.isWarrantyActive === null && (
              <span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                ⏳ ยังไม่ได้ขาย
              </span>
            )}
          </div>
          <div className="card-body space-y-4">
            <div>
              <h3 className="text-lg font-semibold">{result.productName}</h3>
              <p className="text-sm text-slate-500">
                {[result.color, result.storage].filter(Boolean).join(' · ')}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="SKU" value={result.sku} mono />
              <Field label="สถานะ" value={result.status} />
              <Field label="IMEI" value={result.imei ?? '-'} mono />
              <Field label="Serial Number" value={result.serialNumber} mono />
              <Field label="วันที่รับเข้า" value={formatDateTime(result.receivedAt)} icon={<Calendar className="h-4 w-4" />} />
              <Field label="ขายเมื่อ" value={result.soldAt ? formatDateTime(result.soldAt) : 'ยังไม่ได้ขาย'} icon={<Calendar className="h-4 w-4" />} />
              <Field label="บิลที่ขาย" value={result.soldOnBill ?? '-'} mono />
              <Field label="ราคาขาย" value={formatTHB(result.sellingPrice)} />
            </div>

            {/* Barcode display + print button */}
            {(result.imei || result.serialNumber) && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex min-w-0 items-center gap-4">
                  <BarcodeDisplay
                    value={result.imei || result.serialNumber}
                    height={50}
                    fontSize={12}
                  />
                  <div className="text-xs text-slate-500">
                    บาร์โค้ดของเครื่องนี้ — ใช้ Scanner ยิงตรวจสอบได้
                  </div>
                </div>
                <button className="btn-secondary shrink-0" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> พิมพ์ Label
                </button>
              </div>
            )}

            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <h4 className="mb-2 flex items-center gap-1 font-semibold text-amber-800">
                <ShieldCheck className="h-4 w-4" /> ข้อมูลประกัน
              </h4>
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <Field label="เงื่อนไขประกัน" value={result.warrantyTerms ?? '-'} />
                <Field label="วันหมดประกัน"
                       value={result.warrantyExpire ? formatDate(result.warrantyExpire) : '-'} />
                {result.daysUntilExpire !== null && (
                  <Field
                    label="เหลือเวลา"
                    value={
                      result.daysUntilExpire >= 0
                        ? `${result.daysUntilExpire} วัน`
                        : `หมดมาแล้ว ${Math.abs(result.daysUntilExpire)} วัน`
                    }
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="card">
          <div className="card-body text-center text-sm text-slate-500">
            💡 พิมพ์หรือสแกน IMEI/SN แล้วกด "ค้นหา" เพื่อดูข้อมูลประกัน
          </div>
        </div>
      )}

      {result && (result.imei || result.serialNumber) && (
        <LabelsPrintView items={[{
          code: result.imei || result.serialNumber,
          productName: result.productName,
          detail: [result.color, result.storage].filter(Boolean).join(' / '),
          price: formatTHB(result.sellingPrice),
        }]} copies={1} />
      )}
    </div>
  );
}

function Field({ label, value, mono, icon }: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-xs text-slate-500">{icon}{label}</div>
      <div className={`text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
