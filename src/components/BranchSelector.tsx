import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { branchesApi } from '@/api/branches';
import { useBranchStore } from '@/stores/branchStore';

/**
 * เลือกสาขาที่กำลังทำงานอยู่ (active branch) — Phase 2A.
 * มีผลกับ "รับของเข้าสาขาไหน" + "ดูสต๊อกสาขาไหน". "ทุกสาขา" = มุมมองรวม (ไม่ใช้ตอนรับของ).
 */
export function BranchSelector() {
  const { activeBranchId, setActiveBranch } = useBranchStore();
  const { data: branches } = useQuery({
    queryKey: ['branches', 'active'],
    queryFn: () => branchesApi.list(false),
    staleTime: 5 * 60 * 1000,
  });

  // มีสาขาเดียว (ยังไม่แยกสาขา) → ไม่ต้องโชว์ตัวเลือก
  if (!branches || branches.length <= 1) return null;

  return (
    <div className="px-3 pb-1 pt-3">
      <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        <Building2 className="h-3.5 w-3.5" /> สาขาที่ทำงาน
      </label>
      <select
        className="input w-full text-sm"
        value={activeBranchId ?? ''}
        onChange={(e) => setActiveBranch(e.target.value || null)}
      >
        <option value="">ทุกสาขา (ดูรวม)</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
    </div>
  );
}
