import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * สาขาที่กำลังทำงานอยู่ (active branch) — Phase 2A.
 * `activeBranchId = null` = ทุกสาขา (สำหรับมุมมองรวมของเจ้าของ).
 * รับของ/ดูสต๊อก จะอิงค่านี้.
 */
interface BranchState {
  activeBranchId: string | null;   // null = ทุกสาขา
  setActiveBranch: (id: string | null) => void;
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      activeBranchId: null,
      setActiveBranch: (id) => set({ activeBranchId: id }),
    }),
    { name: 'ddmobile.branch' },
  ),
);
