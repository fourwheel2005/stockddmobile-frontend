import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CircleHelp, Info, TriangleAlert, X } from 'lucide-react';

interface HintProps {
  children: ReactNode;
  /** warning = ข้อความเตือนสีเหลือง; default = คำแนะนำสีเทา */
  tone?: 'info' | 'warning';
  className?: string;
}

/** คำแนะนำสั้นใต้ฟิลด์/ฟอร์ม — ไอคอน SVG ขนาดเดียวแทน emoji คำแนะนำ/เตือนแบบเดิม. */
export function Hint({ children, tone = 'info', className = '' }: HintProps) {
  const Icon = tone === 'warning' ? TriangleAlert : Info;
  const color = tone === 'warning' ? 'text-amber-700' : 'text-slate-500';
  return (
    <p className={`flex items-start gap-1.5 text-xs ${color} ${className}`}>
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

interface HelpPopoverProps {
  title?: string;
  label?: string;
  children: ReactNode;
  className?: string;
}

/**
 * คำอธิบายยาวที่ไม่ควรกินพื้นที่ฟอร์มตลอดเวลา — ปุ่ม "วิธีใช้" เปิด popover
 * ปิดด้วย Escape, คลิกนอกกรอบ หรือปุ่มปิด; ไม่ใช้ library เพิ่ม.
 */
export function HelpPopover({ title = 'วิธีใช้', label = 'วิธีใช้', children, className = '' }: HelpPopoverProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button type="button" aria-expanded={open} aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
        <CircleHelp className="h-3.5 w-3.5" />
        {label}
      </button>
      {open && (
        <div role="dialog" aria-label={title}
          className="absolute left-0 z-30 mt-1 w-80 max-w-[90vw] rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-semibold text-slate-800">{title}</span>
            <button type="button" aria-label="ปิด" onClick={() => setOpen(false)}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="space-y-1.5 leading-relaxed">{children}</div>
        </div>
      )}
    </div>
  );
}
