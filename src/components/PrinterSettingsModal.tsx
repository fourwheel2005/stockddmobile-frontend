import { useState } from 'react';
import toast from 'react-hot-toast';
import { X, Printer, RefreshCw, Key, Usb, TestTube, AlertTriangle } from 'lucide-react';
import { useModalChrome, backdropCloseHandler } from '@/hooks/useModalChrome';
import type { PrinterStatus } from '@/hooks/usePrinter';
import { printOrchestrator } from '@/lib/printer/PrintOrchestrator';
import { EscPosBuilder } from '@/lib/escpos/EscPosBuilder';
import { TscLabelSettings } from '@/components/TscLabelSettings';

/** Detect WebUSB support — Safari + Firefox ไม่รองรับ */
function isWebUsbSupported(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

function getBrowserName(): string {
  if (typeof navigator === 'undefined') return 'Unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('edg/')) return 'Edge';
  if (ua.includes('chrome/') && !ua.includes('edg/')) return 'Chrome';
  if (ua.includes('safari/') && !ua.includes('chrome/')) return 'Safari';
  if (ua.includes('firefox/')) return 'Firefox';
  return 'Unknown';
}

interface Props {
  status: PrinterStatus;
  onClose: () => void;
  onRefresh: () => Promise<void> | void;
  onRequestWebUsb: () => Promise<void>;
  onSetBridgeToken: (token: string) => void;
  onSetBridgeUrl?: (url: string) => void;
  getBridgeUrl?: () => string;
  onOpenDrawer: () => Promise<void>;
  onSetAgentMode?: (enabled: boolean, printerId: string) => void;
  getAgentConfig?: () => { enabled: boolean; printerId: string };
}

export function PrinterSettingsModal({
  status, onClose, onRefresh, onRequestWebUsb, onSetBridgeToken,
  onSetBridgeUrl, getBridgeUrl, onOpenDrawer, onSetAgentMode, getAgentConfig,
}: Props) {
  const [token, setToken] = useState(localStorage.getItem('ddmobile.bridge.token') ?? '');
  const [bridgeUrl, setBridgeUrl] = useState(
    getBridgeUrl?.() ?? localStorage.getItem('ddmobile.bridge.url') ?? 'http://localhost:8765',
  );
  const initAgent = getAgentConfig?.() ?? { enabled: false, printerId: '' };
  const [agentEnabled, setAgentEnabled] = useState(initAgent.enabled);
  const [agentPrinterId, setAgentPrinterId] = useState(initAgent.printerId);
  useModalChrome(onClose);

  const [testCodepage, setTestCodepage] = useState<number>(26);

  /** Test 1: ASCII only — verify printer wiring works (no Thai/codepage) */
  const testAscii = async () => {
    try {
      const bytes = new EscPosBuilder()
        .init()
        .align('C')
        .size(2, 2).bold(true).textln('DDMobile').bold(false).size(1, 1)
        .textln('=== ASCII TEST ===')
        .align('L')
        .textln('Hello World')
        .textln('1234567890')
        .textln('ABCDEFGHIJKLM')
        .textln('NOPQRSTUVWXYZ')
        .align('C')
        .textln('=== END ===')
        .feedAndCut(4)
        .build();
      const result = await printOrchestrator.print(bytes, { billNo: 'TEST-ASCII' });
      toast.success(`ASCII test ผ่าน ${result.strategy}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ทดสอบไม่สำเร็จ');
    }
  };

  /** Test 2: Thai with codepage — try different code pages */
  const testThai = async () => {
    try {
      const bytes = new EscPosBuilder()
        .init()
        .codepage(testCodepage)
        .align('C')
        .size(2, 2).bold(true).textln('DDMobile').bold(false).size(1, 1)
        .textln(`Code Page ${testCodepage}`)
        .separator('=', 48)
        .align('L')
        .textln('สวัสดีครับ')
        .textln('ABC 1234567890')
        .textln('กขคงจฉชซฌญฎฏฐฑฒณดต')
        .textln('ถทธนบปผฝพฟภมยรลวศษ')
        .textln('สหฬอฮ ะ า ิ ี ึ ื ุ ู')
        .textln('เ แ โ ใ ไ ่ ้ ๊ ๋ ็')
        .separator('-', 48)
        .align('C')
        .textln('ถ้าอ่านได้ = OK')
        .feedAndCut(4)
        .build();
      const result = await printOrchestrator.print(bytes, { billNo: 'TEST-THAI' });
      toast.success(`Thai test (CP${testCodepage}) ผ่าน ${result.strategy}`);
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
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl animate-modal-zoom-in">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Printer className="h-5 w-5 text-brand-600" />
            ตั้งค่าเครื่องพิมพ์
          </h2>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-slate-100" title="ปิด (Esc)">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {/* Status */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">สถานะเครื่องพิมพ์</h3>
              <button onClick={() => onRefresh()} className="btn-secondary text-xs">
                <RefreshCw className="h-3.5 w-3.5" /> รีเฟรช
              </button>
            </div>
            <StatusRow label="🔌 Local Bridge (PC daemon)" ok={status.bridge} hint="เครื่องเดียวกับปริ้นเตอร์ — silent + cash drawer" />
            <StatusRow label="☁️ คิวปริ้นสาขา (Pull-Agent)" ok={status.agent} hint="iPad/มือถือทุกสาขา · ไม่ต้อง tunnel — ตั้ง Printer ID ด้านล่าง" />
            <StatusRow label="🔗 WebUSB (Chrome direct)" ok={status.webUsb} hint="Chrome · ❌ ไม่ทำงานบน Mac ถ้าเครื่องอยู่ใน System Printers" />
            <StatusRow label="🖨 Browser Print (fallback)" ok={status.browser} hint="ใช้ได้ทุก browser · ช้า" />
          </div>

          {/* macOS CUPS warning */}
          {status.webUsb && !status.bridge && getBrowserName() !== 'Safari' && (
            <div className="rounded-md border-2 border-blue-300 bg-blue-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <div className="text-sm">
                  <div className="font-semibold text-blue-900">
                    💡 ถ้าทดสอบพิมพ์ออกเป็นกระดาษเปล่า
                  </div>
                  <p className="mt-1 text-xs text-blue-800">
                    macOS CUPS driver อาจ "claim" USB ของ printer ทำให้ text bytes ถูก drop —
                    feed/cut ทำงานแต่ text หาย
                  </p>
                  <p className="mt-2 text-xs font-semibold text-blue-900">วิธีแก้:</p>
                  <ol className="mt-1 list-inside list-decimal space-y-0.5 text-xs text-blue-800">
                    <li>เปิด System Settings → Printers & Scanners</li>
                    <li>ลบ EPSON TM-T82X-II ออก (กดปุ่ม <code>−</code>)</li>
                    <li>ถอด-เสียบ USB ใหม่</li>
                    <li>กลับมาที่นี่ กดรีเฟรช + ทดสอบใหม่</li>
                  </ol>
                  <p className="mt-2 text-xs text-blue-800">
                    <strong>หรือดีกว่า:</strong> ติดตั้ง <strong>Local Bridge</strong> (ใช้ libusb แก้ปัญหา CUPS โดยตรง + เปิดลิ้นชักได้)
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Pull-Agent (คิวปริ้นสาขา) — แนะนำสำหรับ iPad/มือถือ ทุกสาขา */}
          {onSetAgentMode && (
          <div className="rounded-md border-2 border-brand-200 bg-brand-50/40 p-3">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              ☁️ คิวปริ้นสาขา (Pull-Agent) <span className="rounded bg-brand-100 px-1.5 text-[10px] text-brand-700">แนะนำ iPad/มือถือ</span>
            </h3>
            <p className="mb-2 text-xs text-slate-500">
              ส่งงานพิมพ์ผ่านเซิร์ฟเวอร์ → กล่อง agent ที่สาขาดึงไปพิมพ์เอง · <strong>ไม่ต้อง tunnel/ngrok</strong> ·
              ตั้ง <strong>Printer ID</strong> ให้ตรงกับที่ตั้งใน agent ของสาขานี้
            </p>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={agentEnabled} onChange={(e) => setAgentEnabled(e.target.checked)} />
              เปิดใช้โหมดคิวปริ้นสาขา
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1 font-mono text-xs"
                placeholder="Printer ID เช่น BRANCH1 หรือ MAIN"
                value={agentPrinterId}
                onChange={(e) => setAgentPrinterId(e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))}
              />
              <button
                onClick={() => {
                  if (agentEnabled && !agentPrinterId.trim()) {
                    toast.error('กรอก Printer ID ก่อน'); return;
                  }
                  onSetAgentMode(agentEnabled, agentPrinterId.trim());
                  toast.success('บันทึกคิวปริ้นสาขาแล้ว — กดรีเฟรชเพื่อเช็คสถานะ');
                }}
                className="btn-primary">
                บันทึก
              </button>
            </div>
          </div>
          )}

          {/* Bridge URL */}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              🌐 Bridge URL (เปลี่ยนถ้าใช้ผ่าน LAN)
            </h3>
            <p className="mb-2 text-xs text-slate-500">
              <code className="rounded bg-white px-1">http://localhost:8765</code> = Bridge บนเครื่องเดียวกัน ·
              ถ้า Bridge อยู่ Mac อื่นใน LAN ใส่ <code className="rounded bg-white px-1">http://192.168.x.x:8765</code>
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                className="input flex-1 font-mono text-xs"
                placeholder="http://localhost:8765"
                value={bridgeUrl}
                onChange={(e) => setBridgeUrl(e.target.value)}
              />
              <button
                onClick={() => {
                  if (onSetBridgeUrl) onSetBridgeUrl(bridgeUrl);
                  else localStorage.setItem('ddmobile.bridge.url', bridgeUrl);
                  toast.success('บันทึก URL แล้ว — กดรีเฟรชเพื่อทดสอบ');
                }}
                className="btn-primary">
                บันทึก
              </button>
            </div>
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

          <TscLabelSettings />

          {/* Browser compatibility warning */}
          {!isWebUsbSupported() && !status.bridge && (
            <div className="rounded-md border-2 border-amber-400 bg-amber-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div className="text-sm">
                  <div className="font-semibold text-amber-900">
                    ⚠️ {getBrowserName()} ไม่รองรับ WebUSB
                  </div>
                  <p className="mt-1 text-xs text-amber-800">
                    Safari + Firefox ไม่รองรับการเชื่อมต่อ USB โดยตรง — ต้องเลือกอย่างใดอย่างหนึ่ง:
                  </p>
                  <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-amber-800">
                    <li>เปลี่ยนเป็น <strong>Chrome</strong> / <strong>Edge</strong> / <strong>Brave</strong> (silent, ไม่ต้องลงอะไร)</li>
                    <li>หรือติดตั้ง <strong>Local Bridge</strong> daemon (ใช้ Safari ได้ + เปิดลิ้นชัก)</li>
                  </ul>
                  <div className="mt-2 flex gap-2">
                    <a
                      href="https://www.google.com/chrome/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700">
                      ⬇ ดาวน์โหลด Chrome
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* WebUSB connect — เฉพาะ browser ที่รองรับ */}
          {isWebUsbSupported() && !status.bridge && (
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
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <TestTube className="h-4 w-4" /> ทดสอบเครื่องพิมพ์
            </h3>
            <p className="mb-2 text-[11px] text-slate-500">
              ถ้าพิมพ์ออกหน้าขาว → ASCII ผ่าน แต่ Thai ไม่ผ่าน → ลองเปลี่ยน Code Page
            </p>

            <button onClick={testAscii} className="btn-secondary w-full justify-center mb-2">
              📄 1) ทดสอบ ASCII (ไม่มีไทย) — ดู printer ทำงานไหม
            </button>

            <div className="mb-2">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Code Page สำหรับภาษาไทย:
              </label>
              <div className="grid grid-cols-4 gap-1">
                {[21, 26, 17, 18].map((cp) => (
                  <button
                    key={cp}
                    type="button"
                    onClick={() => setTestCodepage(cp)}
                    className={`rounded border px-2 py-1 text-xs ${
                      testCodepage === cp
                        ? 'border-brand-500 bg-brand-50 font-semibold text-brand-700'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}>
                    CP{cp}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                TM-T82III/V = 21 · <strong>TM-T82X-II = 26</strong> · บางรุ่น = 17/18
              </p>
            </div>

            <button onClick={testThai} className="btn-secondary w-full justify-center">
              🇹🇭 2) ทดสอบ Thai (Code Page {testCodepage})
            </button>

            <button
              onClick={onOpenDrawer}
              disabled={!status.bridge}
              className="btn-secondary w-full justify-center mt-2 disabled:opacity-50"
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
