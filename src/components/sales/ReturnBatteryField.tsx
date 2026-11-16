import { useQuery } from '@tanstack/react-query';
import { BatteryMedium } from 'lucide-react';
import { inventoryApi } from '@/api/inventory';

/** ช่องว่าง = ไม่แก้แบต · ตัวเลข 0-100 = แบตตอนรับคืน */
export function parseBattery(text: string): { value: number | undefined; error: string | null } {
  const t = text.trim();
  if (t === '') return { value: undefined, error: null };
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0 || n > 100) return { value: undefined, error: 'แบตต้องเป็นตัวเลข 0-100' };
  return { value: n, error: null };
}

/**
 * % แบตตอนรับเครื่องคืน (FIX-229/230) — โชว์แบตที่บันทึกไว้ + กรอกค่าที่วัดได้ตอนรับคืน
 * (เครื่องกลับเข้าสต็อก → เว็บ/ป้ายใช้แบตใหม่) · คืนหลายเครื่องพร้อมกันให้ไปแก้รายเครื่องที่หน้าคลัง
 */
export function ReturnBatteryField({ device, deviceCount, value, onChange }: {
  /** เครื่องเดียวที่กำลังคืน (null = ไม่มี/หลายเครื่อง) */
  device: { imei: string | null; serialNumber: string | null } | null;
  /** จำนวนเครื่องที่กำลังคืน */
  deviceCount: number;
  value: string;
  onChange: (text: string) => void;
}) {
  const key = device ? (device.imei || device.serialNumber || '') : '';
  const current = useQuery({
    queryKey: ['scan-detail', key],
    queryFn: () => inventoryApi.lookupSerial(key),
    enabled: !!key,
    staleTime: 30_000,
  });
  if (deviceCount === 0) return null;
  if (!device) {
    return (
      <p className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600">
        <BatteryMedium className="inline h-4 w-4 align-[-2px]" /> คืน {deviceCount} เครื่องพร้อมกัน — แก้ % แบตรายเครื่องที่หน้า สินค้า + คลัง หลังรับคืน
      </p>
    );
  }
  const { error } = parseBattery(value);
  const saved = current.data?.batteryHealth;
  return (
    <div>
      <label className="mb-1 block text-sm font-medium" htmlFor="return-battery">
        <BatteryMedium className="inline h-4 w-4 align-[-2px] text-emerald-600" /> แบตเตอรี่ตอนรับคืน (%)
      </label>
      <input id="return-battery" type="number" inputMode="numeric" min={0} max={100} className="input tabular-nums"
             placeholder={saved != null ? `ในระบบ ${saved}% — เว้นว่าง = ไม่แก้` : 'เช่น 86 — เว้นว่าง = ไม่แก้'}
             value={value} onChange={(e) => onChange(e.target.value)} />
      <p className="mt-1 text-xs text-slate-500">
        แบตที่บันทึกไว้: <strong>{current.isLoading ? '…' : saved != null ? `${saved}%` : 'ยังไม่ระบุ'}</strong>
        {' '}· ใส่ค่าที่เช็คตอนรับคืน เครื่องกลับเข้าสต็อกพร้อมแบตใหม่ (เว็บอัปเดตด้วย)
      </p>
      {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
    </div>
  );
}
