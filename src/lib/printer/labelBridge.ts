import { printOrchestrator } from './PrintOrchestrator';

export async function requireLabelBridge() {
  printOrchestrator.setBridgeToken(localStorage.getItem('ddmobile.bridge.token'));
  const bridge = printOrchestrator.getLocalBridge();
  if (!(await bridge.isReady())) {
    throw new Error('พิมพ์ป้ายต้องเปิด Local Bridge บนเครื่องที่เสียบ TSC TTP-247');
  }
  if (!(await bridge.labelReady())) {
    throw new Error('Bridge ยังไม่พบ TSC TTP-247 — ตรวจ USB และอัปเดต Bridge');
  }
  return bridge;
}
