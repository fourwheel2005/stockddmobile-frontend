import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { History, X } from 'lucide-react';
import { repairPartsApi } from '@/api/repairParts';
import { extractErrorMessage } from '@/api/client';
import { backdropCloseHandler, useModalChrome } from '@/hooks/useModalChrome';
import { Hint } from '@/components/ui/Hint';
import { formatDateTime, formatTHB } from '@/lib/format';
import { MOVEMENT_LABEL, WARRANTY_PRESETS, laborFromTotal, partLabel, profitOf } from '@/lib/repairParts';
import { IPHONE_MODEL_SERIES, hasModel } from '@/lib/iphoneModels';
import type { RepairPart, RepairPartGroup } from '@/types/api';

/** หน้าต่างของหน้า "อะไหล่ซ่อม / ค่าแรง" (FIX-235) — ทุกช่องมีคำอธิบายใต้ช่อง */

export const REPAIR_PARTS_KEY = ['repair-parts'] as const;

function Modal({ title, onClose, children, footer, wide }: {
  title: string; onClose: () => void; children: ReactNode; footer: ReactNode; wide?: boolean;
}) {
  useModalChrome(onClose);
  return (
    <div onClick={backdropCloseHandler(onClose)}
         className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-3 pt-[5vh]">
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
           className={`w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100" title="ปิด (Esc)"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-5">{children}</div>
        <div className="flex justify-end gap-2 border-t px-5 py-3">{footer}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && <Hint className="mt-1">{hint}</Hint>}
    </div>
  );
}

const num = (v: string) => (v.trim() === '' ? 0 : Number(v));
const validMoney = (v: string) => v.trim() === '' || (Number.isFinite(Number(v)) && Number(v) >= 0);

function useSave<T>(fn: () => Promise<T>, done: string, onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(done);
      qc.invalidateQueries({ queryKey: REPAIR_PARTS_KEY });
      onDone();
    },
    onError: (e) => toast.error(extractErrorMessage(e)),
  });
}

// ─── เพิ่ม/แก้รุ่น ─────────────────────────────────────────────────────────

type StartWith = 'STANDARD' | 'COPY' | 'EMPTY';

export function GroupModal({ group, groups, onClose }: { group?: RepairPartGroup; groups: RepairPartGroup[]; onClose: () => void }) {
  const editing = !!group;
  const [name, setName] = useState(group?.name ?? '');
  const [general, setGeneral] = useState(group?.general ?? false);
  const [note, setNote] = useState(group?.note ?? '');
  const [startWith, setStartWith] = useState<StartWith>('STANDARD');
  const models = groups.filter((g) => !g.general);
  const existingNames = groups.filter((g) => g.id !== group?.id).map((g) => g.name);
  const [copyFrom, setCopyFrom] = useState(models[0]?.id ?? '');

  const save = useSave(
    () => editing
      ? repairPartsApi.updateGroup(group.id, { name: name.trim(), note: note.trim() || undefined })
      : repairPartsApi.createGroup({
          name: name.trim(), general, note: note.trim() || undefined,
          withStandardParts: !general && startWith === 'STANDARD',
          copyFromGroupId: !general && startWith === 'COPY' && copyFrom ? copyFrom : undefined,
        }),
    editing ? 'แก้ชื่อรุ่นแล้ว' : `เพิ่ม "${name.trim()}" แล้ว — กรอกราคาแต่ละชิ้นได้เลย`,
    onClose,
  );

  return (
    <Modal title={editing ? `แก้ไขรุ่น — ${group.name}` : 'เพิ่มรุ่น / หมวดอะไหล่'} onClose={onClose}
           footer={<>
             <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
             <button className="btn-primary" disabled={!name.trim() || hasModel(existingNames, name) || save.isPending} onClick={() => save.mutate()}>
               {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
             </button>
           </>}>
      {!editing && !general && (
        <Field label="เลือกรุ่น iPhone" hint="รุ่นที่มีในตารางแล้วเลือกซ้ำไม่ได้ · ไม่ใช่ iPhone (iPad, Android) พิมพ์ชื่อเองในช่องด้านล่าง">
          <select className="input" value="" onChange={(e) => { if (e.target.value) setName(e.target.value); }}>
            <option value="">— เลือกจากรายการ iPhone ทุกรุ่น —</option>
            {IPHONE_MODEL_SERIES.map((s) => (
              <optgroup key={s.series} label={`ปี ${s.series}`}>
                {s.models.map((m) => {
                  const taken = hasModel(existingNames, m);
                  return <option key={m} value={m} disabled={taken}>{m}{taken ? ' (มีแล้ว)' : ''}</option>;
                })}
              </optgroup>
            ))}
          </select>
        </Field>
      )}
      <Field label="ชื่อรุ่น / หมวด *" hint="ใช้ชื่อเดียวกับที่หน้าร้านพิมพ์ในใบงานซ่อม เช่น iPhone 13 Pro Max — ระบบจะเลือกรุ่นให้อัตโนมัติตอนช่างเลือกอะไหล่">
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)}
               placeholder="เลือกด้านบน หรือพิมพ์เอง เช่น iPad Air 5" list={editing || general ? undefined : 'iphone-model-options'} />
        {!editing && !general && (
          <datalist id="iphone-model-options">
            {IPHONE_MODEL_SERIES.flatMap((s) => s.models).filter((m) => !hasModel(existingNames, m)).map((m) => <option key={m} value={m} />)}
          </datalist>
        )}
        {!editing && name.trim() && hasModel(existingNames, name) && <Hint tone="warning">มีรุ่นนี้ในตารางแล้ว — แก้ราคาที่รุ่นเดิมได้เลย</Hint>}
      </Field>
      {!editing && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={general} onChange={(e) => setGeneral(e.target.checked)} />
          <span>เป็นหมวด <b>อะไหล่/อุปกรณ์ทั่วไป</b> (ไม่ผูกรุ่น เช่น กาวติดจอ น็อต ฟิล์มกันน้ำ)</span>
        </label>
      )}
      {!editing && !general && (
        <Field label="เริ่มต้นด้วย">
          <div className="space-y-1.5 text-sm">
            <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={startWith === 'STANDARD'} onChange={() => setStartWith('STANDARD')} />
              <span><b>รายการชิ้นมาตรฐาน</b> — จอ แบต ลำโพงกระดิ่ง ลำโพงสนทนา แพรตูดชาร์จ กล้อง ฝาหลัง ปุ่ม ไมค์ (ราคาเริ่ม 0 ให้กรอก)</span></label>
            <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={startWith === 'COPY'} disabled={models.length === 0} onChange={() => setStartWith('COPY')} />
              <span><b>คัดลอกจากรุ่นอื่น</b> — ได้ชื่อชิ้น เกรด และราคาเหมือนกัน (คงเหลือเริ่มที่ 0)</span></label>
            {startWith === 'COPY' && (
              <select className="input ml-6 w-auto" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                {models.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.parts.length} ชิ้น)</option>)}
              </select>
            )}
            <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={startWith === 'EMPTY'} onChange={() => setStartWith('EMPTY')} />
              <span><b>ว่าง</b> — เพิ่มชิ้นเองทีละรายการ</span></label>
          </div>
        </Field>
      )}
      <Field label="หมายเหตุ" hint="ไม่บังคับ เช่น รุ่นนี้จอ OEM ต้องสั่งล่วงหน้า 2 วัน">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

// ─── เพิ่ม/แก้ชิ้น ─────────────────────────────────────────────────────────

export function PartModal({ part, group, onClose }: { part?: RepairPart; group: RepairPartGroup; onClose: () => void }) {
  const editing = !!part;
  const [f, setF] = useState({
    name: part?.name ?? '', grade: part?.grade ?? '', note: part?.note ?? '',
    cost: part?.cost != null ? String(part.cost) : '', partPrice: part ? String(part.partPrice) : '',
    // FIX-237: ช่างกรอกยอดรวม (ราคาเปลี่ยน) — ค่าแรงคิดให้เอง = ยอดรวม − ราคาอะไหล่
    total: part && part.replacePrice > 0 ? String(part.replacePrice) : '',
    warranty: part?.warranty ?? '', initialQuantity: '',
  });
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));
  const labor = laborFromTotal(num(f.total), num(f.partPrice));
  const moneyOk = validMoney(f.cost) && validMoney(f.partPrice) && validMoney(f.total);
  const totalOk = labor !== null;
  const qtyOk = f.initialQuantity.trim() === '' || (Number.isInteger(Number(f.initialQuantity)) && Number(f.initialQuantity) >= 0);
  const total = num(f.total);
  const profit = profitOf(num(f.partPrice), labor ?? 0, num(f.cost));

  const body = () => ({
    groupId: group.id, name: f.name.trim(), grade: f.grade.trim() || undefined, note: f.note.trim() || undefined,
    cost: num(f.cost), partPrice: num(f.partPrice), laborPrice: labor ?? 0,
    warranty: f.warranty.trim() || undefined,
    initialQuantity: editing || f.initialQuantity.trim() === '' ? undefined : Number(f.initialQuantity),
  });
  const save = useSave(
    () => editing ? repairPartsApi.updatePart(part.id, body()) : repairPartsApi.createPart(body()),
    editing ? 'บันทึกราคาแล้ว' : 'เพิ่มอะไหล่แล้ว', onClose,
  );

  return (
    <Modal title={`${editing ? 'แก้ไข' : 'เพิ่ม'}อะไหล่ — ${group.name}`} onClose={onClose}
           footer={<>
             <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
             <button className="btn-primary" disabled={!f.name.trim() || !moneyOk || !totalOk || !qtyOk || save.isPending} onClick={() => save.mutate()}>
               {save.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
             </button>
           </>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ชื่ออะไหล่ *" hint="เช่น จอ, แบตเตอรี่, ลำโพงกระดิ่ง">
          <input className="input" autoFocus={!editing} value={f.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="เกรด / ชนิด" hint="ไม่บังคับ — ชิ้นเดียวกันมีหลายเกรดให้เพิ่มแยกแถว เช่น แท้ศูนย์ / OEM / เทียบ">
          <input className="input" value={f.grade} onChange={(e) => set({ grade: e.target.value })} placeholder="เช่น แท้ศูนย์" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="ต้นทุน (บาท)" hint="ราคาที่ร้านซื้ออะไหล่มา ต่อ 1 ชิ้น — พนักงานหน้าร้านไม่เห็น">
          <input className="input text-right" inputMode="decimal" value={f.cost} onChange={(e) => set({ cost: e.target.value })} placeholder="0" />
        </Field>
        <Field label="ราคาอะไหล่ (บาท)" hint="ค่าตัวอะไหล่ที่คิดลูกค้า — ไม่แยกก็เว้นว่างได้">
          <input className="input text-right" inputMode="decimal" value={f.partPrice} onChange={(e) => set({ partPrice: e.target.value })} placeholder="0" />
        </Field>
        <Field label="ยอดรวม (บาท)" hint="ราคาเปลี่ยนทั้งหมดที่บอกลูกค้า (รวมค่าช่างแล้ว)">
          <input className="input text-right font-semibold" inputMode="decimal" value={f.total} onChange={(e) => set({ total: e.target.value })} placeholder="0" />
        </Field>
      </div>
      {!moneyOk && <Hint tone="warning">ราคาต้องเป็นตัวเลข 0 ขึ้นไป</Hint>}
      {moneyOk && !totalOk && <Hint tone="warning">ยอดรวมต้องไม่น้อยกว่าราคาอะไหล่ ({formatTHB(num(f.partPrice))})</Hint>}
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm">
        <div>ราคาที่บอกลูกค้า<div className="text-lg font-bold text-brand-700">{formatTHB(total)}</div>
          <div className="text-xs text-slate-500">= ยอดรวมที่กรอก</div></div>
        <div>กำไรต่อชิ้น<div className={`text-lg font-bold ${profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatTHB(profit)}</div>
          <div className="text-xs text-slate-500">= ยอดรวม − ต้นทุน (คำนวณให้อัตโนมัติ)</div></div>
      </div>
      {total === 0 && <Hint tone="warning">ยังไม่ได้ตั้งราคา — หน้าร้านจะเห็นป้าย "ยังไม่ตั้งราคา" แทนตัวเลข</Hint>}
      <Field label="รับประกัน" hint="พิมพ์เองได้เลย เช่น 3 เดือน, 1 ปี, 2 ปี — พนักงานหน้าร้านเห็นเพื่อแจ้งลูกค้า · เว้นว่าง = ไม่ระบุ">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {WARRANTY_PRESETS.map((w) => (
            <button key={w} type="button" onClick={() => set({ warranty: w })}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${f.warranty === w ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}>{w}</button>
          ))}
        </div>
        <input className="input" maxLength={60} value={f.warranty} onChange={(e) => set({ warranty: e.target.value })} placeholder="เช่น 1 ปี" />
      </Field>
      {!editing && (
        <Field label="จำนวนที่มีอยู่ตอนนี้" hint="ไม่บังคับ — บันทึกเป็น 'รับเข้า' ด้วยต้นทุนด้านบน · ภายหลังใช้ปุ่ม รับเข้า / ปรับยอด">
          <input className="input w-32 text-right" inputMode="numeric" value={f.initialQuantity} onChange={(e) => set({ initialQuantity: e.target.value })} placeholder="0" />
        </Field>
      )}
      {!qtyOk && <Hint tone="warning">จำนวนต้องเป็นจำนวนเต็ม 0 ขึ้นไป</Hint>}
      <Field label="หมายเหตุ" hint="ไม่บังคับ เช่น ร้านที่สั่ง, รอของกี่วัน, ข้อควรระวังตอนเปลี่ยน">
        <input className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      {editing && <Hint>จำนวนคงเหลือแก้ที่ปุ่ม "รับเข้า" หรือ "ปรับยอด" เพื่อให้มีประวัติทุกครั้ง</Hint>}
    </Modal>
  );
}

// ─── รับเข้า ──────────────────────────────────────────────────────────────

export function ReceiveModal({ part, groupName, onClose }: { part: RepairPart; groupName: string; onClose: () => void }) {
  const [qty, setQty] = useState('1');
  const [unitCost, setUnitCost] = useState(part.cost != null && part.cost > 0 ? String(part.cost) : '');
  const [note, setNote] = useState('');
  const qtyOk = Number.isInteger(Number(qty)) && Number(qty) >= 1;
  const save = useSave(
    () => repairPartsApi.receive(part.id, { quantity: Number(qty), unitCost: unitCost.trim() === '' ? undefined : Number(unitCost), note: note.trim() || undefined }),
    `รับเข้า ${qty} ชิ้นแล้ว`, onClose,
  );
  return (
    <Modal title={`รับเข้า — ${groupName} · ${partLabel(part)}`} onClose={onClose}
           footer={<>
             <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
             <button className="btn-primary" disabled={!qtyOk || !validMoney(unitCost) || save.isPending} onClick={() => save.mutate()}>
               {save.isPending ? 'กำลังบันทึก…' : `รับเข้า ${qtyOk ? qty : ''} ชิ้น`}
             </button>
           </>}>
      <p className="text-sm text-slate-600">คงเหลือตอนนี้ <b>{part.quantity}</b> ชิ้น → หลังรับเข้า <b>{part.quantity + (qtyOk ? Number(qty) : 0)}</b> ชิ้น</p>
      <Field label="จำนวนที่รับเข้า *" hint="จำนวนชิ้นที่ซื้อมาเพิ่มรอบนี้">
        <input className="input w-32 text-right" autoFocus inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
      </Field>
      <Field label="ต้นทุนต่อชิ้น (บาท)" hint="ราคาที่ซื้อรอบนี้ — ต้นทุนของรายการจะเปลี่ยนเป็นราคานี้ · เว้นว่าง = ใช้ต้นทุนเดิม">
        <input className="input w-40 text-right" inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
      </Field>
      <Field label="หมายเหตุ" hint="ไม่บังคับ เช่น ซื้อจากร้านไหน เลขบิล">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Modal>
  );
}

// ─── ปรับยอด ──────────────────────────────────────────────────────────────

const ADJUST_REASONS = ['นับสต็อกจริง', 'เสียระหว่างซ่อม', 'ของหาย', 'เคลมคืนร้านที่ซื้อ'];

export function AdjustModal({ part, groupName, onClose }: { part: RepairPart; groupName: string; onClose: () => void }) {
  const [qty, setQty] = useState(String(part.quantity));
  const [reason, setReason] = useState('');
  const qtyOk = Number.isInteger(Number(qty)) && Number(qty) >= 0 && qty.trim() !== '';
  const diff = qtyOk ? Number(qty) - part.quantity : 0;
  const save = useSave(
    () => repairPartsApi.adjust(part.id, { newQuantity: Number(qty), reason: reason.trim() }),
    'ปรับยอดแล้ว', onClose,
  );
  return (
    <Modal title={`ปรับยอด — ${groupName} · ${partLabel(part)}`} onClose={onClose}
           footer={<>
             <button className="btn-secondary" onClick={onClose}>ยกเลิก</button>
             <button className="btn-primary" disabled={!qtyOk || !reason.trim() || diff === 0 || save.isPending} onClick={() => save.mutate()}>
               {save.isPending ? 'กำลังบันทึก…' : 'บันทึกยอดใหม่'}
             </button>
           </>}>
      <Hint>ใช้เมื่อจำนวนในระบบไม่ตรงของจริง — ใส่ "จำนวนที่มีจริงตอนนี้" ไม่ใช่จำนวนที่ต่าง</Hint>
      <Field label="จำนวนที่มีจริงตอนนี้ *">
        <div className="flex items-center gap-3">
          <input className="input w-32 text-right" autoFocus inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          <span className="text-sm text-slate-600">ในระบบ {part.quantity} ชิ้น
            {diff !== 0 && <b className={diff > 0 ? 'text-emerald-700' : 'text-red-600'}> ({diff > 0 ? '+' : ''}{diff})</b>}</span>
        </div>
      </Field>
      <Field label="เหตุผล *" hint="บังคับกรอก — เก็บในประวัติว่าใครปรับ เพราะอะไร">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {ADJUST_REASONS.map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${reason === r ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 hover:bg-slate-50'}`}>{r}</button>
          ))}
        </div>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="หรือพิมพ์เหตุผลเอง" />
      </Field>
    </Modal>
  );
}

// ─── ประวัติ ──────────────────────────────────────────────────────────────

export function HistoryModal({ part, groupName, onClose }: { part: RepairPart; groupName: string; onClose: () => void }) {
  const q = useQuery({ queryKey: [...REPAIR_PARTS_KEY, 'movements', part.id], queryFn: () => repairPartsApi.movements(part.id) });
  return (
    <Modal wide title={`ประวัติสต็อก — ${groupName} · ${partLabel(part)}`} onClose={onClose}
           footer={<button className="btn-secondary" onClick={onClose}>ปิด</button>}>
      {q.isLoading && <p className="text-sm text-slate-400">กำลังโหลด...</p>}
      {q.data?.length === 0 && <p className="flex items-center gap-1.5 text-sm text-slate-400"><History className="h-4 w-4" /> ยังไม่มีการเคลื่อนไหว</p>}
      {q.data && q.data.length > 0 && (
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-100 text-left text-xs text-slate-500">
              <tr><th className="px-2 py-1.5">เมื่อ</th><th className="px-2 py-1.5">รายการ</th><th className="px-2 py-1.5 text-right">จำนวน</th>
                <th className="px-2 py-1.5 text-right">คงเหลือ</th><th className="px-2 py-1.5">รายละเอียด</th><th className="px-2 py-1.5">โดย</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.data.map((m) => (
                <tr key={m.id}>
                  <td className="px-2 py-1.5 text-xs text-slate-500">{formatDateTime(m.createdAt)}</td>
                  <td className="px-2 py-1.5">{MOVEMENT_LABEL[m.type]}</td>
                  <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${m.quantityChange > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {m.quantityChange > 0 ? '+' : ''}{m.quantityChange}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{m.quantityAfter}</td>
                  <td className="px-2 py-1.5 text-xs">
                    {m.ticketNo && <span className="font-mono">{m.ticketNo} </span>}
                    {m.note}
                    {m.unitCost != null && m.type === 'RECEIVE' && <span className="text-slate-500"> · ทุน {formatTHB(m.unitCost)}/ชิ้น</span>}
                  </td>
                  <td className="px-2 py-1.5 text-xs text-slate-500">{m.createdBy ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
