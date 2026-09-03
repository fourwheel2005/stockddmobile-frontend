import { useState, useRef, useEffect } from 'react';
import { ScanLine, CheckCircle2, AlertTriangle, Info, Package, TriangleAlert, BookOpen } from 'lucide-react';

interface ScanLog {
  raw: string;
  length: number;
  containsEnter: boolean;
  durationMs: number;
  at: string;
}

/**
 * Debug page for verifying that a USB barcode scanner is set up correctly.
 * Helps staff/IT diagnose:
 *   - Whether the scanner is plugged in at all
 *   - Whether it sends Enter (CR/LF) after each scan
 *   - Whether the keyboard layout is messing characters up
 */
export function ScannerTestPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [logs, setLogs] = useState<ScanLog[]>([]);
  const [current, setCurrent] = useState('');
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (startTimeRef.current === null) startTimeRef.current = Date.now();
    setCurrent(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    const now = Date.now();
    const duration = startTimeRef.current ? now - startTimeRef.current : 0;
    setLogs((prev) => [{
      raw: current,
      length: current.length,
      containsEnter: true,           // form submit means Enter was pressed
      durationMs: duration,
      at: new Date().toLocaleTimeString('th-TH'),
    }, ...prev].slice(0, 20));
    setCurrent('');
    startTimeRef.current = null;
    inputRef.current?.focus();
  };

  const clear = () => setLogs([]);

  const allGood = logs.length > 0 && logs.every((l) => l.containsEnter && l.length >= 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 page-title">
          <ScanLine className="h-6 w-6 text-brand-600" /> ทดสอบ Scanner (Debug)
        </h1>
        <p className="text-sm text-slate-500">
          ใช้หน้านี้เพื่อตรวจสอบว่า Scanner ทำงานถูกต้อง
        </p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-lg bg-slate-800 p-5 shadow-sm">
        <label className="mb-2 block text-xs font-semibold uppercase text-amber-400">
          <Package className="inline h-4 w-4 align-[-2px]" /> ยิงบาร์โค้ดอะไรก็ได้มาที่นี่
        </label>
        <input
          ref={inputRef}
          type="text"
          style={{ backgroundColor: '#0f172a', color: '#ffffff' }}
          className="w-full rounded-md border border-slate-600 px-3 py-3 text-base
                     placeholder:text-slate-500 focus:border-amber-500 focus:outline-none
                     focus:ring-2 focus:ring-amber-500/40"
          placeholder="ยิงบาร์โค้ดที่นี่... (cursor ควรกระพริบ)"
          value={current}
          onChange={handleChange}
        />
        <p className="mt-2 text-xs text-slate-400">
          <Info className="inline h-3.5 w-3.5 align-[-2px]" /> ทดสอบที่ดี: ยิงเสร็จ → ผลลัพธ์ใหม่ขึ้นในตารางด้านล่างทันที (ไม่ต้องกดปุ่มอะไร)
        </p>
      </form>

      {/* Status panel */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="ครั้งที่ยิง" value={logs.length} />
        <Stat label="ความยาวเฉลี่ย"
              value={logs.length > 0
                ? Math.round(logs.reduce((s, l) => s + l.length, 0) / logs.length)
                : 0} />
        <Stat label="เร็วเฉลี่ย (ms)"
              value={logs.length > 0
                ? Math.round(logs.reduce((s, l) => s + l.durationMs, 0) / logs.length)
                : 0} />
      </div>

      {logs.length > 0 && (
        <div className={`rounded-md border p-4 ${
          allGood ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'
        }`}>
          {allGood ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
              <CheckCircle2 className="h-5 w-5" />
              <CheckCircle2 className="inline h-4 w-4 align-[-2px]" /> Scanner ทำงานถูกต้อง — พร้อมใช้กับ POS ได้เลย
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              <TriangleAlert className="inline h-3.5 w-3.5 align-[-2px]" /> อาจต้องตั้งค่า Scanner เพิ่ม — ดูคำแนะนำด้านล่าง
            </p>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-header flex items-center justify-between">
          <span>ประวัติการยิง (20 ครั้งล่าสุด)</span>
          {logs.length > 0 && (
            <button className="text-xs text-brand-600 hover:underline" onClick={clear}>
              ล้างประวัติ
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-2.5">เวลา</th>
                <th className="px-5 py-2.5">ค่าที่ได้</th>
                <th className="px-5 py-2.5 text-right">ความยาว</th>
                <th className="px-5 py-2.5 text-right">เวลาที่ใช้</th>
                <th className="px-5 py-2.5">Enter?</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                  ยังไม่มีการยิง — เริ่มยิงได้เลย ↑
                </td></tr>
              )}
              {logs.map((l, idx) => (
                <tr key={idx}>
                  <td className="px-5 py-2 text-xs text-slate-500">{l.at}</td>
                  <td className="px-5 py-2 font-mono text-sm font-semibold text-brand-700">{l.raw}</td>
                  <td className="px-5 py-2 text-right">{l.length}</td>
                  <td className="px-5 py-2 text-right text-xs text-slate-500">{l.durationMs} ms</td>
                  <td className="px-5 py-2">
                    {l.containsEnter ? <span className="badge-green">ส่ง Enter</span>
                                     : <span className="badge-amber">ไม่ Enter</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><BookOpen className="inline h-4 w-4 align-[-2px]" /> วิธีตีความผลลัพธ์</div>
        <div className="card-body space-y-2 text-sm">
          <p><strong>ความยาว ≥ 8</strong> = น่าจะเป็นบาร์โค้ดจริง ไม่ใช่กดมือ</p>
          <p><strong>เวลาที่ใช้ &lt; 500ms</strong> = ยิงเร็วมาก — เป็น Scanner แน่ ไม่ใช่พิมพ์มือ</p>
          <p><strong>ส่ง Enter</strong> = Scanner ตั้งค่าถูก ส่ง suffix Enter หลังบาร์โค้ด → ใช้กับ POS ได้</p>
          <p className="text-slate-500">
            ถ้าผลออกมา "ไม่ Enter" → ต้องเปิดคู่มือ Scanner หา barcode "Add Enter Suffix" / "CR/LF" แล้วยิงครั้งเดียว
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="card">
      <div className="card-body">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-3xl font-bold">{value}</div>
      </div>
    </div>
  );
}
