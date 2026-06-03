import { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Printer, RefreshCw, Key, Usb, TestTube } from 'lucide-react';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import type { PrinterStatus } from '@/hooks/usePrinter';
import { printOrchestrator } from '@/lib/printer/PrintOrchestrator';
import { EscPosBuilder } from '@/lib/escpos/EscPosBuilder';

interface Props {
  status: PrinterStatus;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
  onRequestWebUsb: () => Promise<void>;
  onSetBridgeToken: (token: string) => void;
  onOpenDrawer: () => Promise<void>;
}

export function PrinterSettingsModal({
  status, onClose, onRefresh, onRequestWebUsb, onSetBridgeToken, onOpenDrawer,
}: Props) {
  const [token, setToken] = useState(localStorage.getItem('ddmobile.bridge.token') ?? '');
  useModalChrome(onClose);

  const testPrint = async () => {
    try {
      const bytes = new EscPosBuilder()
        .init()
        .codepage(21)
        .align('C')
        .size(2, 2).bold(true).textln('DDMobile').bold(false).size(1, 1)
        .textln('— Test Print —')
        .separator('=', 48)
        .align('L')
        .textln('สวัสดีครับ 🇹🇭')
        .textln('ABC 1234567890')
        .textln('กขคงจฉชซฌญฎฏฐฑฒณดต')
        .textln('ถทธนบปผฝพฟภมยรลวศษ')
        .textln('สหฬอฮฤฦะาำิีึืุู เ แ โ ใ ไ')
        .textln('ก่ก้ก๊ก๋ก็ก์ก๎')
        .separator('-', 48)
        .align('C')
        .text('ทดสอบสำเร็จ ✓')
        .feedAndCut(4)
        .build();
      const result = await printOrchestrator.print(bytes, {
        billNo: 'TEST',
      });
      toast.success(`ทดสอบสำเร็จผ่าน ${result.strategy}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ทดสอบไม่สำเร็จ');
    }
  };

  return (
    <div
      onClick={backdropCloseHandler(onClose)}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/60 p-4 pt-[10vh] backdrop-blur-sm animate-modal-fade-in">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Printer className="h-5 w-5 text-brand-600" />
            ตั้งค่าเครื่องพิมพ์ใบเสร็จ
          </h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Status */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">สถานะเครื่องพิมพ์</h3>
              <button onClick={() => onRefresh()} className="btn-secondary text-xs">
                <RefreshCw className="h-3.5 w-3.5" /> รีเฟรช
              </button>
            </div>
            <StatusRow label="🔌 Local Bridge (PC daemon)" ok={status.bridge} hint="แนะนำ — silent + cash drawer" />
            <StatusRow label="🔗 WebUSB (Chrome direct)" ok={status.webUsb} hint="Chrome เท่านั้น · ไม่มี cash drawer" />
            <StatusRow label="🖨 Browser Print (fallback)" ok={status.browser} hint="ใช้ได้ทุก browser · ช้า" />
          </div>

          {/* Bridge token */}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Key className="h-4 w-4" /> Bridge Token (ถ้ามี)
            </h3>
            <p className="mb-2 text-xs text-slate-500">
              วาง token จากไฟล์ <code className="rounded bg-white px-1">~/.ddmobile-bridge/token</code> หลังติดตั้ง Bridge
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                className="input flex-1 font-mono text-xs"
                placeholder="paste token..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <button
                onClick={() => {
                  onSetBridgeToken(token);
                  toast.success('บันทึก token แล้ว');
                }}
                className="btn-primary">
                บันทึก
              </button>
            </div>
          </div>

          {/* WebUSB connect */}
          {!status.bridge && (
            <div>
              <button
                onClick={onRequestWebUsb}
                className="btn-secondary w-full justify-center">
                <Usb className="h-4 w-4" /> เชื่อมต่อ Epson ผ่าน WebUSB
              </button>
              <p className="mt-1 text-[11px] text-slate-500">
                กดแล้ว browser จะแสดงหน้าต่างเลือก printer (ทำครั้งเดียวต่อเครื่อง)
              </p>
            </div>
          )}

          {/* Tests */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={testPrint} className="btn-secondary">
              <TestTube className="h-4 w-4" /> ทดสอบพิมพ์
            </button>
            <button
              onClick={onOpenDrawer}
              disabled={!status.bridge}
              className="btn-secondary disabled:opacity-50"
              title={!status.bridge ? 'ต้องใช้ Local Bridge' : ''}>
              💰 ทดสอบเปิดลิ้นชัก
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between border-t bg-slate-50/50 px-5 py-3 text-xs text-slate-500 rounded-b-xl">
          <span>กด <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono">Esc</kbd> เพื่อปิด</span>
          <a
            href="https://github.com/yourorg/ddmobile-print-bridge/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 hover:underline">
            ดาวน์โหลด Bridge →
          </a>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ label, ok, hint }: { label: string; ok: boolean; hint: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
      ok ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'
    }`}>
      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      <div className="flex-1">
        <div className={ok ? 'font-semibold text-emerald-800' : 'text-slate-700'}>{label}</div>
        <div className="text-[11px] text-slate-500">{hint}</div>
      </div>
      <span className="text-[11px] font-medium">
        {ok ? '✓ พร้อมใช้' : '— offline'}
      </span>
    </div>
  );
}
