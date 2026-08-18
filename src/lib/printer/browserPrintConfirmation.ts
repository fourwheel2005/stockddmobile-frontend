const PRINT_NOT_CONFIRMED = 'ผู้ใช้ยังไม่ยืนยันว่าใบเสร็จพิมพ์ออกแล้ว';

/** Browser API บอกไม่ได้ว่ากระดาษออกจริง จึงต้องให้ผู้ใช้ยืนยันก่อน mark job เป็น PRINTED */
export function printAndConfirmReceipt(): void {
  window.print();
  const printed = window.confirm('ใบเสร็จพิมพ์ออกจากเครื่องเรียบร้อยแล้วใช่ไหม?');
  if (!printed) throw new Error(PRINT_NOT_CONFIRMED);
}
