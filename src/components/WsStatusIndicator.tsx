import { useWsStore, type WsStatus } from '@/stores/wsStore';
import { Wifi, WifiOff, Loader2, AlertCircle } from 'lucide-react';

const CONFIG: Record<WsStatus, {
  label: string;
  cls: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  connected:    { label: 'Live',         cls: 'bg-emerald-100 text-emerald-800 border-emerald-200',    icon: Wifi },
  connecting:   { label: 'Connecting…',  cls: 'bg-amber-100 text-amber-800 border-amber-200 animate-pulse', icon: Loader2 },
  disconnected: { label: 'Offline',      cls: 'bg-slate-100 text-slate-700 border-slate-200',          icon: WifiOff },
  error:        { label: 'WS Error',     cls: 'bg-red-100 text-red-800 border-red-200',                icon: AlertCircle },
};

export function WsStatusIndicator() {
  const status = useWsStore((s) => s.status);
  const lastError = useWsStore((s) => s.lastError);
  const receivedCount = useWsStore((s) => s.receivedCount);
  const lastEventAt = useWsStore((s) => s.lastEventAt);

  const cfg = CONFIG[status];
  const Icon = cfg.icon;

  const ago = lastEventAt
    ? `${Math.max(1, Math.round((Date.now() - lastEventAt) / 1000))}s ago`
    : null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${cfg.cls}`}
      title={lastError ?? (ago ? `received ${receivedCount} · last ${ago}` : status)}
    >
      <Icon className={`h-3.5 w-3.5 ${status === 'connecting' ? 'animate-spin' : ''}`} />
      <span>{cfg.label}</span>
      {status === 'connected' && receivedCount > 0 && (
        <span className="rounded bg-emerald-200/60 px-1 text-[10px]">{receivedCount}</span>
      )}
    </div>
  );
}
