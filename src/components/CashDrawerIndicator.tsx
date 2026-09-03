import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { cashRegisterApi } from '@/api/cashRegister';
import { formatTHB } from '@/lib/format';
import { useBranchStore } from '@/stores/branchStore';

/**
 * Indicator สถานะเก๊ะเงินสด — แสดงทุกหน้า (ใน Sidebar) ให้พนักงานรู้ตลอดว่า
 * เก๊ะเปิดอยู่ไหม. เปิด = ขายได้ · ปิด = ต้องเปิดก่อนขาย. กดเพื่อไปหน้าเก๊ะ.
 */
export function CashDrawerIndicator() {
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const { data: session } = useQuery({
    queryKey: ['cash-session', 'current', activeBranchId],
    queryFn: () => cashRegisterApi.current(activeBranchId ?? undefined),
    refetchInterval: 30_000,
  });

  const open = !!session;
  const balance = (session?.movements ?? [])
    .reduce((sum, m) => sum + Number(m.amount || 0), 0);

  return (
    <Link
      to="/cash-register"
      className={`mx-3 mt-3 flex items-center gap-2.5 rounded-lg border px-3 py-2 transition ${
        open
          ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
          : 'border-amber-300 bg-amber-50 hover:bg-amber-100'
      }`}
    >
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${
          open ? 'bg-emerald-500' : 'animate-pulse bg-amber-500'
        }`}
        aria-hidden
      />
      <div className="min-w-0 flex-1 leading-tight">
        {open ? (
          <>
            <div className="text-sm font-semibold text-emerald-800">เก๊ะเปิดอยู่</div>
            <div className="text-xs text-emerald-700">เงินสด {formatTHB(balance)}</div>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold text-amber-800">เก๊ะปิด</div>
            <div className="text-xs text-amber-700">กดเปิดก่อนขาย</div>
          </>
        )}
      </div>
      <Wallet className={`h-4 w-4 shrink-0 ${open ? 'text-emerald-500' : 'text-amber-500'}`} />
    </Link>
  );
}
