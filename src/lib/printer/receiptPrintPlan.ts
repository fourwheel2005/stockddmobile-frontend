export type ReceiptJobType = 'RECEIPT' | 'DUPLICATE';

interface ReceiptPrintPlanInput {
  jobType: ReceiptJobType;
  isCash: boolean;
  openDrawerRequested?: boolean;
}

export interface ReceiptPrintPlan {
  duplicate: boolean;
  openDrawer: boolean;
}

/** กฎเอกสารและลิ้นชักต้องมาจาก job ที่ backend ตัดสินแล้ว */
export function resolveReceiptPrintPlan({
  jobType,
  isCash,
  openDrawerRequested = true,
}: ReceiptPrintPlanInput): ReceiptPrintPlan {
  const duplicate = jobType === 'DUPLICATE';
  return {
    duplicate,
    openDrawer: !duplicate && isCash && openDrawerRequested,
  };
}
