import { useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { printOrchestrator } from '@/lib/printer/PrintOrchestrator';
import { encodeCp874 } from '@/lib/escpos/cp874';
import {
  getLabelConfig,
  parseLabelSize,
  saveLabelConfig,
  type LabelConfig,
} from '@/lib/tspl/labelConfig';

async function sendGapCalibration(): Promise<void> {
  printOrchestrator.setBridgeToken(localStorage.getItem('ddmobile.bridge.token'));
  const bridge = printOrchestrator.getLocalBridge();
  if (!(await bridge.isReady()) || !(await bridge.labelReady())) {
    throw new Error('ยังไม่พบ TSC TTP-247 ผ่าน Local Bridge');
  }
  await bridge.print(encodeCp874('GAPDETECT\r\n'), {
    billNo: 'TSC-GAP-CALIBRATION',
    target: 'label',
  });
}

export function TscLabelSettings() {
  const initial = getLabelConfig();
  const [size, setSize] = useState(`${initial.w}x${initial.h}`);
  const [across, setAcross] = useState(String(initial.across));
  const [gapX, setGapX] = useState(String(initial.gapX));
  const [gapY, setGapY] = useState(String(initial.gapY));
  const [code, setCode] = useState(initial.code);
  const [speed, setSpeed] = useState(String(initial.speed));
  const [density, setDensity] = useState(String(initial.density));

  const save = () => {
    const parsedSize = parseLabelSize(size);
    if (!parsedSize) {
      toast.error('รูปแบบขนาดต้องเป็น กว้างxสูง เช่น 50x40 หรือ 49.5x40');
      return;
    }
    const config: LabelConfig = {
      ...parsedSize,
      across: Number(across),
      gapX: Number(gapX),
      gapY: Number(gapY),
      code,
      speed: Number(speed),
      density: Number(density),
    };
    try {
      saveLabelConfig(config);
      toast.success('บันทึก Format ป้าย TSC แล้ว');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Format ป้ายไม่ถูกต้อง');
    }
  };

  const calibrate = async () => {
    const confirmed = window.confirm(
      'TTP-247 จะป้อนสติ๊กเกอร์ประมาณ 2–3 แถวเพื่อหา GAP อัตโนมัติ ดำเนินการต่อหรือไม่?',
    );
    if (!confirmed) return;
    try {
      await sendGapCalibration();
      toast.success('Calibrate GAP สำเร็จ — ลองพิมพ์ป้ายจริง 1 แถว');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Calibrate ไม่สำเร็จ');
    }
  };

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <h3 className="mb-2 text-sm font-semibold">🏷️ ป้ายสติกเกอร์ (TSC)</h3>
      <p className="mb-2 text-xs text-slate-500">
        วัดจากม้วนจริง: ขนาด <strong>ต่อดวง</strong> กว้าง×สูง (มม.) และมีกี่ดวงต่อแถว —
        ตั้งผิดป้ายจะพิมพ์คร่อมดวง
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <LabelSetting label="ขนาดต่อดวง (มม.)">
          <input className="input text-center font-mono" placeholder="50x40"
                 value={size} onChange={(event) => setSize(event.target.value)} />
        </LabelSetting>
        <LabelSetting label="จำนวนต่อแถว">
          <select className="input" value={across} onChange={(event) => setAcross(event.target.value)}>
            <option value="1">1 ดวง</option><option value="2">2 ดวง</option>
            <option value="3">3 ดวง</option><option value="4">4 ดวง</option>
          </select>
        </LabelSetting>
        <NumberSetting label="ช่องกลาง X (มม.)" value={gapX} setValue={setGapX} max={25.4} step={0.1} />
        <NumberSetting label="ช่องระหว่างแถว Y" value={gapY} setValue={setGapY} max={25.4} step={0.1} />
        <NumberSetting label="ความเร็ว (1–7)" value={speed} setValue={setSpeed} min={1} max={7} />
        <NumberSetting label="ความเข้ม (0–15)" value={density} setValue={setDensity} max={15} />
        <div className="col-span-2">
          <LabelSetting label="ดวงเล็กพิมพ์โค้ดแบบใด">
            <select className="input" value={code}
                    onChange={(event) => setCode(event.target.value as LabelConfig['code'])}>
              <option value="qr">QR ลูกค้าสแกนเข้าหน้าสินค้า</option>
              <option value="barcode">Code128 สำหรับปืนยิง</option>
            </select>
          </LabelSetting>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        ระบบตรวจความกว้างรวมไม่ให้เกินหัวพิมพ์ TTP-247 ที่ 108 มม. · ป้ายใหญ่พิมพ์ QR + Code128 ให้ครบ
      </p>
      <div className="mt-2 flex gap-2">
        <button className="btn-primary" onClick={save}>บันทึก Format</button>
        <button className="btn-secondary" onClick={calibrate}>Calibrate GAP</button>
      </div>
    </div>
  );
}

interface NumberSettingProps {
  label: string;
  value: string;
  setValue: (value: string) => void;
  min?: number;
  max: number;
  step?: number;
}

function NumberSetting({ label, value, setValue, min = 0, max, step = 1 }: NumberSettingProps) {
  return (
    <LabelSetting label={label}>
      <input type="number" min={min} max={max} step={step} className="input"
             value={value} onChange={(event) => setValue(event.target.value)} />
    </LabelSetting>
  );
}

function LabelSetting({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
